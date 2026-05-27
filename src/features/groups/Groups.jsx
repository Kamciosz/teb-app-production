import React, { useEffect, useState, useRef, useMemo } from 'react'
import { Users, Plus, Hash, Send, Search, X, Trash2, Menu, Clock, MessageCircle, ChevronLeft, LogOut } from 'lucide-react'
import { supabase } from '../../services/supabase'
import ReportButton from '../../components/ReportButton'
import MediaUploader from '../../components/common/MediaUploader'
import { ImageKitService } from '../../services/imageKitService'

// --- Helper: format timestamp for date separator ---
function formatDateSeparator(dateStr) {
    const d = new Date(dateStr)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate())

    if (msgDate.getTime() === today.getTime()) return 'Dzisiaj'
    if (msgDate.getTime() === yesterday.getTime()) return 'Wczoraj'
    return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })
}

// --- Helper: format timestamp for message bubble ---
function formatTimestamp(dateStr) {
    const d = new Date(dateStr)
    return d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
}

// --- Helper: compute message groups for Discord-style grouping ---
// Consecutive messages from same sender within 5 minutes are grouped
const GROUP_TIME_WINDOW_MS = 5 * 60 * 1000
function groupMessages(messages, myId) {
    if (!messages.length) return []

    const groups = []
    let currentGroup = null

    for (const msg of messages) {
        if (msg.is_deleted) {
            // Deleted messages always start their own group
            if (currentGroup) {
                groups.push(currentGroup)
                currentGroup = null
            }
            groups.push({ type: 'deleted', messages: [msg] })
            continue
        }

        const isMe = msg.sender_id === myId

        if (currentGroup && currentGroup.type === 'normal' && currentGroup.senderId === msg.sender_id) {
            const lastMsg = currentGroup.messages[currentGroup.messages.length - 1]
            const timeDiff = new Date(msg.created_at) - new Date(lastMsg.created_at)
            if (timeDiff <= GROUP_TIME_WINDOW_MS && currentGroup.messages.length < 6) {
                currentGroup.messages.push(msg)
                continue
            }
        }

        if (currentGroup) groups.push(currentGroup)
        currentGroup = {
            type: 'normal',
            senderId: msg.sender_id,
            senderName: msg.profiles?.full_name || 'Nieznany',
            isMe,
            messages: [msg]
        }
    }
    if (currentGroup) groups.push(currentGroup)

    return groups
}

// --- Helper: split messages by date for date separators ---
function splitGroupsByDate(messages, myId) {
    const grouped = groupMessages(messages, myId)
    if (!grouped.length) return []

    const result = []
    let currentDate = null
    let currentBlock = []

    for (const group of grouped) {
        const firstMsg = group.messages ? group.messages[0] : group.messages?.[0]
        const msgDate = firstMsg?.created_at
            ? new Date(firstMsg.created_at).toDateString()
            : null

        if (msgDate !== currentDate) {
            if (currentBlock.length) {
                result.push({ type: 'block', items: currentBlock, dateLabel: formatDateSeparator(firstMsg?.created_at || currentDate) })
            }
            currentDate = msgDate
            currentBlock = []
        }
        currentBlock.push(group)
    }
    if (currentBlock.length && currentDate) {
        result.push({ type: 'block', items: currentBlock, dateLabel: formatDateSeparator(currentDate) })
    }

    return result
}

export default function Groups() {
    const MAX_GROUP_NAME = 120
    const MAX_GROUP_DESC = 1000
    const MAX_GROUP_MESSAGE = 2000
    const GROUP_MESSAGES_PAGE_SIZE = 40
    const MAX_GROUP_MESSAGES_IN_MEMORY = 200
    const GROUP_MESSAGES_CACHE_TTL_MS = 8 * 60 * 1000
    const GROUP_STATE_CACHE_TTL_MS = 10 * 60 * 1000

    const capRecentMessages = (list) => {
        if (list.length <= MAX_GROUP_MESSAGES_IN_MEMORY) return list
        return list.slice(-MAX_GROUP_MESSAGES_IN_MEMORY)
    }

    const readCachedSessionEntry = (key, ttlMs) => {
        try {
            const raw = sessionStorage.getItem(key)
            if (!raw) return null
            const parsed = JSON.parse(raw)
            if (!parsed?.ts || !('data' in parsed)) return null
            if ((Date.now() - parsed.ts) > ttlMs) {
                sessionStorage.removeItem(key)
                return null
            }
            return parsed.data
        } catch {
            return null
        }
    }

    const writeCachedSessionEntry = (key, data) => {
        try {
            sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }))
        } catch {
            // Ignore cache write failures (quota/private mode).
        }
    }

    const [view, setView] = useState('list') // 'list', 'new', 'chat' — used for mobile nav
    const [groups, setGroups] = useState([])
    const [userGroups, setUserGroups] = useState([]) // ID grup do których należę
    const [activeGroup, setActiveGroup] = useState(null)
    const [messages, setMessages] = useState([])
    const [messagesCursor, setMessagesCursor] = useState(null)
    const [hasOlderMessages, setHasOlderMessages] = useState(false)
    const [loadingOlderMessages, setLoadingOlderMessages] = useState(false)
    const [newMessage, setNewMessage] = useState('')
    const [myId, setMyId] = useState(null)
    const [loading, setLoading] = useState(true)
    const [membersCount, setMembersCount] = useState(0)
    const [sidebarOpen, setSidebarOpen] = useState(false) // mobile hamburger
    const [searchQuery, setSearchQuery] = useState('') // search in sidebar

    // Formularz nowej grupy
    const [newGroupName, setNewGroupName] = useState('')
    const [newGroupDesc, setNewGroupDesc] = useState('')

    const messagesEndRef = useRef(null)
    const messagesContainerRef = useRef(null)
    const getGroupMessagesCacheKey = (userId, groupId) => `groups_messages_${userId}_${groupId}`
    const getGroupsStateCacheKey = (userId) => `groups_state_${userId}`

    const readCachedGroupMessages = (userId, groupId) => {
        const cached = readCachedSessionEntry(getGroupMessagesCacheKey(userId, groupId), GROUP_MESSAGES_CACHE_TTL_MS)
        if (!Array.isArray(cached)) return null
        return capRecentMessages(
            cached.filter(msg => msg && typeof msg === 'object' && typeof msg.id !== 'undefined' && typeof msg.content === 'string' && typeof msg.created_at === 'string')
        )
    }

    const persistGroupMessagesCache = (userId, groupId, list) => {
        if (!userId || !groupId || !Array.isArray(list)) return
        writeCachedSessionEntry(getGroupMessagesCacheKey(userId, groupId), capRecentMessages(list))
    }

    const readCachedGroupsState = (userId) => {
        const cached = readCachedSessionEntry(getGroupsStateCacheKey(userId), GROUP_STATE_CACHE_TTL_MS)
        if (!cached || typeof cached !== 'object') return null

        const groupsList = Array.isArray(cached.groups)
            ? cached.groups.filter(group => group && typeof group === 'object' && typeof group.id !== 'undefined').slice(0, 300)
            : []

        const memberships = Array.isArray(cached.userGroups)
            ? cached.userGroups.filter(groupId => typeof groupId === 'number' || typeof groupId === 'string').slice(0, 500)
            : []

        return { groups: groupsList, userGroups: memberships }
    }

    const persistGroupsStateCache = (userId, nextGroups, nextUserGroups) => {
        if (!userId) return
        writeCachedSessionEntry(getGroupsStateCacheKey(userId), {
            groups: Array.isArray(nextGroups) ? nextGroups.slice(0, 300) : [],
            userGroups: Array.isArray(nextUserGroups) ? nextUserGroups.slice(0, 500) : []
        })
    }

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                setMyId(session.user.id)
                const cachedState = readCachedGroupsState(session.user.id)
                if (cachedState) {
                    setGroups(cachedState.groups)
                    setUserGroups(cachedState.userGroups)
                    setLoading(false)
                }
                fetchGroupsAndMemberships(session.user.id)
            }
        })
    }, [])

    useEffect(() => {
        if (view === 'chat' && activeGroup && myId) {
            setMessages([])
            setMessagesCursor(null)
            setHasOlderMessages(false)

            const cachedMessages = readCachedGroupMessages(myId, activeGroup.id)
            if (cachedMessages?.length) {
                setMessages(cachedMessages)
            }

            fetchMessages(activeGroup.id)
            fetchMembersCount(activeGroup.id)
            const channel = supabase.channel(`group_${activeGroup.id}`)
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `group_id=eq.${activeGroup.id}` }, payload => {
                    const msg = payload.new
                    setMessages(prev => {
                        if (!prev.find(m => m.id === msg.id)) {
                            // Fetch user info for new message
                            supabase.from('profiles').select('full_name, role').eq('id', msg.sender_id).single()
                                .then(({ data }) => {
                                    setMessages(current => {
                                        const nextList = capRecentMessages([...current, { ...msg, profiles: data }])
                                        persistGroupMessagesCache(myId, activeGroup.id, nextList)
                                        return nextList
                                    })
                                    scrollToBottom()
                                })
                                .catch(err => console.warn('Failed to fetch message sender info:', err))
                            return prev
                        }
                        return prev
                    })
                })
                .subscribe()

            return () => { supabase.removeChannel(channel) }
        }
    }, [view, activeGroup, myId])

    const scrollToBottom = () => {
        setTimeout(() => {
            if (messagesContainerRef.current) {
                messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
            }
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }, 100)
    }

    async function fetchGroupsAndMemberships(userId) {
        const { data: allGroups } = await supabase.from('groups').select('*').order('created_at', { ascending: false })
        const { data: myMemberships } = await supabase.from('group_members').select('group_id').eq('user_id', userId)

        const nextGroups = allGroups || []
        const nextMemberships = (myMemberships || []).map(m => m.group_id)

        if (allGroups) setGroups(nextGroups)
        if (myMemberships) setUserGroups(nextMemberships)
        persistGroupsStateCache(userId, nextGroups, nextMemberships)
        setLoading(false)
    }

    async function fetchMembersCount(groupId) {
        const { count } = await supabase.from('group_members').select('*', { count: 'exact', head: true }).eq('group_id', groupId)
        setMembersCount(count || 0)
    }

    async function handleCreateGroup(e) {
        e.preventDefault()
        if (!newGroupName) return
        if (newGroupName.trim().length > MAX_GROUP_NAME) {
            alert(`Nazwa grupy jest za długa (max ${MAX_GROUP_NAME} znaków).`)
            return
        }
        if (newGroupDesc.trim().length > MAX_GROUP_DESC) {
            alert(`Opis grupy jest za długi (max ${MAX_GROUP_DESC} znaków).`)
            return
        }

        const { error } = await supabase.from('groups').insert([{
            name: newGroupName,
            description: newGroupDesc,
            creator_id: myId,
            is_approved: false // Domyslnie musi zostać zaakceptowane przez Moderatora
        }])

        if (error) {
            console.error(error)
            alert("Błąd integracji z systemem ról.")
        } else {
            alert("Grupa została wysłana do Moderacji. Pojawi się na liscie po akceptacji!")
            setView('list')
            setNewGroupName('')
            setNewGroupDesc('')
            fetchGroupsAndMemberships(myId)
        }
    }

    async function toggleMembership(groupId, isLeaving = false) {
        if (isLeaving) {
            await supabase.from('group_members').delete().eq('user_id', myId).eq('group_id', groupId)
            setUserGroups(prev => {
                const nextMemberships = prev.filter(id => id !== groupId)
                persistGroupsStateCache(myId, groups, nextMemberships)
                return nextMemberships
            })
            setActiveGroup(null)
            setView('list')
        } else {
            await supabase.from('group_members').insert([{ user_id: myId, group_id: groupId }])
            setUserGroups(prev => {
                const nextMemberships = prev.includes(groupId) ? prev : [...prev, groupId]
                persistGroupsStateCache(myId, groups, nextMemberships)
                return nextMemberships
            })
        }
    }

    async function fetchMessages(groupId, { before = null, appendOlder = false } = {}) {
        setLoading(true)
        let query = supabase.from('group_messages')
            .select('*, profiles(full_name, role)')
            .eq('group_id', groupId)
            .order('created_at', { ascending: false })
            .limit(GROUP_MESSAGES_PAGE_SIZE)

        if (before) {
            query = query.lt('created_at', before)
        }

        const { data, error } = await query

        if (error) {
            console.error("Błąd pobierania wiadomości grupowych:", error)
        } else if (data) {
            const ordered = [...data].reverse()
            const oldestLoaded = ordered[0]?.created_at || null
            setMessages(prev => {
                if (!appendOlder) {
                    const nextList = capRecentMessages(ordered)
                    persistGroupMessagesCache(myId, groupId, nextList)
                    return nextList
                }

                const existingIds = new Set(prev.map(item => item.id))
                const older = ordered.filter(item => !existingIds.has(item.id))
                const nextList = capRecentMessages([...older, ...prev])
                persistGroupMessagesCache(myId, groupId, nextList)
                return nextList
            })

            if (oldestLoaded) {
                setMessagesCursor(oldestLoaded)
            }
            setHasOlderMessages(data.length === GROUP_MESSAGES_PAGE_SIZE)

            if (!appendOlder) {
                scrollToBottom()
            }
        }
        setLoading(false)
    }

    async function loadOlderMessages() {
        if (!activeGroup?.id || !messagesCursor || loadingOlderMessages || !hasOlderMessages) return

        setLoadingOlderMessages(true)
        try {
            await fetchMessages(activeGroup.id, { before: messagesCursor, appendOlder: true })
        } finally {
            setLoadingOlderMessages(false)
        }
    }

    async function sendMessage(e) {
        e.preventDefault()
        if (!newMessage.trim() || !activeGroup || activeGroup.is_locked) return

        if (newMessage.trim().length > MAX_GROUP_MESSAGE) {
            alert(`Wiadomość jest za długa (max ${MAX_GROUP_MESSAGE} znaków).`)
            return
        }

        const msgText = newMessage.trim()
        const tempId = Math.random().toString(36).substring(7)

        // Optimistic UI
        const optimisticMsg = {
            id: tempId,
            group_id: activeGroup.id,
            sender_id: myId,
            content: msgText,
            created_at: new Date().toISOString(),
            status: 'sending',
            profiles: { full_name: 'Ty', role: 'student' } // Tymczasowy profil
        }

        setMessages(prev => {
            const nextList = capRecentMessages([...prev, optimisticMsg])
            persistGroupMessagesCache(myId, activeGroup.id, nextList)
            return nextList
        })
        setNewMessage('')
        scrollToBottom()

        const { data, error } = await supabase.from('group_messages').insert([{
            group_id: activeGroup.id,
            sender_id: myId,
            content: msgText
        }]).select('*, profiles(full_name, role)').single()

        if (error) {
            console.error("Błąd wysyłania na grupę:", error)
            alert("Błąd - czat został zablokowany lub nie należysz do grupy.")
            setMessages(prev => prev.filter(m => m.id !== tempId))
        } else if (data) {
            setMessages(prev => {
                const nextList = prev.map(m => m.id === tempId ? data : m)
                persistGroupMessagesCache(myId, activeGroup.id, nextList)
                return nextList
            })
        }
    }

    async function sendImage(url) {
        if (!activeGroup) return

        const { data, error } = await supabase.from('group_messages').insert([{
            group_id: activeGroup.id,
            sender_id: myId,
            content: url
        }]).select('*, profiles(full_name, role)').single()

        if (error) {
            console.error("Błąd wysyłania zdjęcia na grupę:", error)
        }
    }

    async function deleteMessage(messageId) {
        if (!window.confirm("Czy chcesz usunąć tę wiadomość?")) return

        const { error } = await supabase
            .from('group_messages')
            .update({ is_deleted: true })
            .eq('id', messageId)
            .eq('sender_id', myId)

        if (!error) {
            setMessages(prev => {
                const nextList = prev.map(m => m.id === messageId ? { ...m, is_deleted: true } : m)
                persistGroupMessagesCache(myId, activeGroup.id, nextList)
                return nextList
            })
        }
    }

    function handleSelectGroup(group) {
        setActiveGroup(group)
        setView('chat')
        setSidebarOpen(false)
    }

    function handleBackFromChat() {
        setView('list')
        setSidebarOpen(false)
    }

    // Filter groups by search query
    const filteredGroups = useMemo(() => {
        if (!searchQuery.trim()) return groups
        const q = searchQuery.toLowerCase()
        return groups.filter(g =>
            g.name.toLowerCase().includes(q) ||
            (g.description && g.description.toLowerCase().includes(q))
        )
    }, [groups, searchQuery])

    // Compute message blocks with date separators and grouping
    const messageBlocks = useMemo(() => {
        return splitGroupsByDate(messages, myId)
    }, [messages, myId])

    // Check if we're showing the chat panel (desktop: always visible when activeGroup exists; mobile: only when view === 'chat')
    const showChatPanel = activeGroup && (view === 'chat' || true) // desktop always shows
    const showSidebar = view === 'list' || view === 'new' || !activeGroup

    // --- RENDER: Left Sidebar (Discord-style) ---
    const renderSidebar = () => (
        <div className="flex flex-col h-full bg-[#121212] border-r border-gray-800">
            {/* Sidebar Header */}
            <div className="shrink-0 px-4 py-4 border-b border-gray-800">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <MessageCircle size={18} className="text-secondary" />
                        <h2 className="font-bold text-white text-sm tracking-wide">Kółka i Grupy</h2>
                    </div>
                    <button
                        onClick={() => setView(view === 'new' ? 'list' : 'new')}
                        className="w-8 h-8 rounded-full bg-secondary/20 hover:bg-secondary/30 text-secondary flex items-center justify-center transition active:scale-95"
                        title={view === 'new' ? 'Anuluj' : 'Nowa grupa'}
                    >
                        {view === 'new' ? <X size={16} /> : <Plus size={16} />}
                    </button>
                </div>

                {/* Search */}
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                        type="text"
                        placeholder="Szukaj grup..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full bg-background border border-gray-700/50 rounded-lg pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-secondary/50 transition placeholder:text-gray-600"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Create Group Form (in sidebar) */}
            {view === 'new' && (
                <div className="shrink-0 px-4 py-4 border-b border-gray-800 bg-[#1a1a1a]/50">
                    <form onSubmit={handleCreateGroup} className="flex flex-col gap-3">
                        <input
                            type="text" required placeholder="Nazwa kółka..."
                            value={newGroupName} onChange={e => setNewGroupName(e.target.value.slice(0, MAX_GROUP_NAME))}
                            maxLength={MAX_GROUP_NAME}
                            className="p-2.5 bg-background border border-gray-700 rounded-lg text-white outline-none focus:border-secondary text-sm"
                        />
                        <textarea
                            required rows={2} placeholder="Opis..."
                            value={newGroupDesc} onChange={e => setNewGroupDesc(e.target.value.slice(0, MAX_GROUP_DESC))}
                            maxLength={MAX_GROUP_DESC}
                            className="p-2.5 bg-background border border-gray-700 rounded-lg text-white outline-none focus:border-secondary resize-none text-sm"
                        />
                        <button type="submit" className="bg-secondary text-white font-bold py-2 rounded-lg text-sm hover:bg-opacity-80 transition">
                            Wyślij do weryfikacji
                        </button>
                        <p className="text-[9px] text-gray-600 text-center">Wymaga akceptacji Moderatora</p>
                    </form>
                </div>
            )}

            {/* Group List */}
            <div className="flex-1 overflow-y-auto scrollbar-none py-2">
                {loading && groups.length === 0 ? (
                    <div className="text-center text-gray-600 text-sm mt-6 animate-pulse">Ładowanie...</div>
                ) : filteredGroups.length === 0 ? (
                    <div className="text-center text-gray-600 text-sm mt-8 px-4">
                        {searchQuery ? 'Brak wyników' : 'Brak grup. Stwórz nową!'}
                    </div>
                ) : (
                    <div className="flex flex-col gap-0.5 px-2">
                        {filteredGroups.map(group => {
                            const isMember = userGroups.includes(group.id)
                            const isActive = activeGroup?.id === group.id
                            const firstLetter = (group.name || 'G')[0].toUpperCase()
                            return (
                                <button
                                    key={group.id}
                                    onClick={() => {
                                        if (isMember) {
                                            handleSelectGroup(group)
                                        } else {
                                            setActiveGroup(group)
                                            setView('chat')
                                            setSidebarOpen(false)
                                        }
                                    }}
                                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all w-full text-left ${
                                        isActive
                                            ? 'bg-secondary/15 border border-secondary/30'
                                            : 'hover:bg-white/5 border border-transparent'
                                    }`}
                                >
                                    {/* Avatar Circle */}
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                                        isMember
                                            ? 'bg-gradient-to-br from-secondary to-emerald-600 text-white'
                                            : 'bg-gray-800 text-gray-400'
                                    }`}>
                                        {firstLetter}
                                    </div>

                                    {/* Group Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <span className={`text-sm font-semibold truncate ${isActive ? 'text-white' : 'text-gray-300'}`}>
                                                {group.name}
                                            </span>
                                            {group.is_locked && (
                                                <span className="text-[8px] text-red-500 border border-red-500/50 px-1 rounded shrink-0">LOCK</span>
                                            )}
                                            {!group.is_approved && (
                                                <span className="text-[8px] text-yellow-500 border border-yellow-500/50 px-1 rounded shrink-0">OCZEKUJE</span>
                                            )}
                                            <span className="text-[8px] text-emerald-400 border border-emerald-400/50 px-1 rounded shrink-0">PUBLICZNA</span>
                                        </div>
                                        <div className="text-[11px] text-gray-600 truncate mt-0.5">
                                            {isMember ? (group.description || 'Brak opisu') : 'Kliknij, aby dołączyć'}
                                        </div>
                                    </div>

                                    {/* Member badge */}
                                    {isMember && (
                                        <div className="w-2 h-2 rounded-full bg-secondary/60 shrink-0" title="Jesteś członkiem" />
                                    )}
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Sidebar Footer */}
            <div className="shrink-0 px-4 py-3 border-t border-gray-800/50">
                <div className="text-[10px] text-gray-600 text-center">
                    {groups.length} grup • {userGroups.length} członkostw
                </div>
            </div>
        </div>
    )

    // --- RENDER: Chat Panel (Messenger + Discord-style) ---
    const renderChatPanel = () => {
        if (!activeGroup) {
            return (
                <div className="flex-1 flex items-center justify-center bg-[#121212]">
                    <div className="text-center">
                        <MessageCircle size={48} className="mx-auto text-gray-700 mb-4" />
                        <p className="text-gray-500 text-sm">Wybierz grupę, aby rozpocząć czat</p>
                    </div>
                </div>
            )
        }

        const isMember = userGroups.includes(activeGroup.id)

        return (
            <div className="flex-1 flex flex-col h-full bg-[#121212]">
                {/* Chat Header (Discord-style) */}
                <div className="shrink-0 bg-[#1a1a1a] border-b border-gray-800 flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                        {/* Mobile back button */}
                        <button
                            onClick={handleBackFromChat}
                            className="lg:hidden p-1.5 -ml-1.5 text-gray-400 hover:text-white transition rounded-lg hover:bg-white/5"
                        >
                            <ChevronLeft size={20} />
                        </button>

                        {/* Mobile hamburger */}
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="lg:hidden p-1.5 text-gray-400 hover:text-white transition rounded-lg hover:bg-white/5"
                        >
                            <Menu size={20} />
                        </button>

                        {/* Hash icon */}
                        <div className="w-9 h-9 rounded-lg bg-secondary/10 text-secondary flex items-center justify-center font-bold shrink-0">
                            <Hash size={18} />
                        </div>

                        <div className="min-w-0">
                            <div className="font-bold text-white text-sm leading-tight truncate flex items-center gap-1.5">
                                {activeGroup.name}
                                <span className="text-[8px] text-emerald-400 border border-emerald-400/50 px-1 rounded shrink-0">PUBLICZNA</span>
                            </div>
                            <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider flex items-center gap-2">
                                <Users size={12} className="inline" />
                                {membersCount} {membersCount === 1 ? 'członek' : 'członków'}
                            </div>
                        </div>
                    </div>

                    {/* Right actions */}
                    {isMember && (
                        <button
                            onClick={() => toggleMembership(activeGroup.id, true)}
                            className="text-[11px] text-red-500/60 hover:text-red-500 transition flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-red-500/5"
                            title="Opuść grupę"
                        >
                            <LogOut size={14} />
                            <span className="hidden sm:inline">Opuść</span>
                        </button>
                    )}
                </div>

                {/* Messages Area */}
                <div
                    ref={messagesContainerRef}
                    className="flex-1 overflow-y-auto scrollbar-none px-4 py-4"
                >
                    {!isMember ? (
                        /* Non-member view (join prompt) */
                        <div className="h-full flex flex-col items-center justify-center gap-4">
                            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-secondary/20 to-emerald-600/20 flex items-center justify-center">
                                <Users size={32} className="text-secondary" />
                            </div>
                            <h3 className="text-lg font-bold text-white">{activeGroup.name}</h3>
                            <span className="text-[10px] text-emerald-400 border border-emerald-400/50 px-2 py-0.5 rounded-full">PUBLICZNA</span>
                            <p className="text-sm text-gray-400 max-w-xs text-center">{activeGroup.description}</p>
                            <button
                                onClick={() => toggleMembership(activeGroup.id)}
                                className="bg-secondary hover:bg-opacity-80 text-white font-bold px-8 py-2.5 rounded-full shadow-lg shadow-secondary/20 active:scale-95 transition text-sm"
                            >
                                Dołącz do grupy
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* Load older messages */}
                            {hasOlderMessages && (
                                <div className="flex justify-center mb-4">
                                    <button
                                        type="button"
                                        onClick={loadOlderMessages}
                                        disabled={loadingOlderMessages}
                                        className="px-4 py-1.5 rounded-full text-xs font-medium border border-gray-700/50 text-gray-400 hover:text-white hover:border-gray-500 disabled:opacity-50 transition bg-[#1a1a1a]"
                                    >
                                        {loadingOlderMessages ? (
                                            <span className="flex items-center gap-1.5">
                                                <Clock size={12} className="animate-spin" />
                                                Ładowanie...
                                            </span>
                                        ) : 'Załaduj starsze wiadomości'}
                                    </button>
                                </div>
                            )}

                            {/* Messages with date separators and grouping */}
                            {messageBlocks.length === 0 ? (
                                <div className="h-full flex items-center justify-center">
                                    <div className="text-center">
                                        <MessageCircle size={36} className="mx-auto text-gray-700 mb-3" />
                                        <p className="text-gray-500 text-sm">Brak wiadomości. Zacznij rozmowę!</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-0">
                                    {messageBlocks.map((block, blockIdx) => (
                                        <div key={blockIdx} className="mb-4">
                                            {/* Date Separator */}
                                            <div className="flex items-center gap-3 mb-3 mt-1">
                                                <div className="flex-1 h-px bg-gray-800/60" />
                                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider shrink-0">
                                                    {block.dateLabel}
                                                </span>
                                                <div className="flex-1 h-px bg-gray-800/60" />
                                            </div>

                                            {/* Message Groups */}
                                            {block.items.map((group, groupIdx) => {
                                                if (group.type === 'deleted') {
                                                    const msg = group.messages[0]
                                                    return (
                                                        <div key={groupIdx} className="flex justify-center my-2">
                                                            <span className="text-[11px] text-gray-600 italic">Wiadomość usunięta</span>
                                                        </div>
                                                    )
                                                }

                                                const showAvatar = true // first message in group gets the avatar
                                                const firstMsg = group.messages[0]
                                                const lastMsg = group.messages[group.messages.length - 1]

                                                return (
                                                    <div
                                                        key={groupIdx}
                                                        className={`flex mb-0.5 ${group.isMe ? 'justify-end' : 'justify-start'}`}
                                                    >
                                                        {/* Others: Avatar + name column on left */}
                                                        {!group.isMe && (
                                                            <div className="flex flex-col items-center mr-2.5 mt-0.5 shrink-0">
                                                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center text-xs font-bold text-white">
                                                                    {(group.senderName || '?')[0].toUpperCase()}
                                                                </div>
                                                            </div>
                                                        )}

                                                        <div className={`flex flex-col max-w-[75%] min-w-0 ${group.isMe ? 'items-end' : 'items-start'}`}>
                                                            {/* Sender name (Discord-style, above first message only) */}
                                                            {!group.isMe && (
                                                                <span className="text-[11px] font-bold text-gray-400 ml-1 mb-0.5">
                                                                    {group.senderName}
                                                                </span>
                                                            )}

                                                            {/* Message bubbles */}
                                                            {group.messages.map((msg, msgIdx) => {
                                                                const isImage = !msg.is_deleted && msg.content && msg.content.startsWith('https://')
                                                                const isSending = msg.status === 'sending'
                                                                const isLastInGroup = msgIdx === group.messages.length - 1

                                                                return (
                                                                    <div
                                                                        key={msg.id}
                                                                        className={`group relative flex items-end gap-1.5 ${msgIdx > 0 ? 'mt-0.5' : ''}`}
                                                                    >
                                                                        {/* Delete button (my messages) - hover reveal */}
                                                                        {group.isMe && !msg.is_deleted && (
                                                                            <button
                                                                                onClick={() => deleteMessage(msg.id)}
                                                                                className="opacity-0 group-hover:opacity-100 transition-all duration-150 p-1 text-gray-600 hover:text-red-500 -ml-8 shrink-0"
                                                                                title="Usuń"
                                                                            >
                                                                                <Trash2 size={12} />
                                                                            </button>
                                                                        )}

                                                                        {/* Report button (others' messages) - hover reveal */}
                                                                        {!group.isMe && !msg.is_deleted && (
                                                                            <div className="opacity-0 group-hover:opacity-100 transition-all duration-150 shrink-0">
                                                                                <ReportButton entityType="group_message" entityId={msg.id} subtle={true} />
                                                                            </div>
                                                                        )}

                                                                        {/* Message Bubble */}
                                                                        <div
                                                                            className={`px-3 py-2 text-sm leading-relaxed break-words ${
                                                                                msg.is_deleted
                                                                                    ? 'bg-gray-800/20 text-gray-600 italic border border-gray-800/30 rounded-xl'
                                                                                    : group.isMe
                                                                                        ? 'bg-gradient-to-br from-secondary to-emerald-600 text-white rounded-2xl rounded-br-sm'
                                                                                        : 'bg-[#1e1e1e] border border-gray-800/60 text-gray-200 rounded-2xl rounded-bl-sm'
                                                                            } ${isSending ? 'opacity-70' : ''}`}
                                                                            style={{
                                                                                boxShadow: group.isMe && !msg.is_deleted
                                                                                    ? '0 1px 4px rgba(34,197,94,0.15)'
                                                                                    : 'none'
                                                                            }}
                                                                        >
                                                                            {msg.is_deleted ? (
                                                                                'Usunięto'
                                                                            ) : isImage ? (
                                                                                <img
                                                                                    src={ImageKitService.getOptimizedUrl(msg.content, 400)}
                                                                                    alt="Zdjęcie"
                                                                                    className="rounded-lg max-w-full cursor-pointer hover:opacity-90 transition"
                                                                                    onClick={() => window.open(msg.content, '_blank', 'noopener,noreferrer')}
                                                                                    loading="lazy"
                                                                                />
                                                                            ) : (
                                                                                <span className="whitespace-pre-wrap">{msg.content}</span>
                                                                            )}
                                                                        </div>

                                                                        {/* Timestamp (shown on last message in group only) */}
                                                                        {isLastInGroup && (
                                                                            <span className="text-[9px] text-gray-600 whitespace-nowrap mt-auto mb-1 px-0.5 shrink-0">
                                                                                {formatTimestamp(msg.created_at)}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                )
                                                            })}
                                                        </div>

                                                        {/* My messages: empty spacer for avatar alignment */}
                                                        {group.isMe && (
                                                            <div className="w-9 h-9 shrink-0 ml-2.5 hidden lg:block" />
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    ))}
                                    <div ref={messagesEndRef} />
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Input Area (Messenger/Telegram-style) */}
                {isMember && (
                    <div className="shrink-0 bg-[#1a1a1a] border-t border-gray-800 px-4 py-3">
                        {activeGroup.is_locked ? (
                            <div className="text-center text-red-500 text-xs font-semibold py-2">
                                Ten kanał został wyciszony przez Moderatora.
                            </div>
                        ) : (
                            <form onSubmit={sendMessage} className="flex items-center gap-2">
                                <MediaUploader module="tebtalk" onUploadSuccess={sendImage}>
                                    <button
                                        type="button"
                                        className="w-10 h-10 rounded-full bg-background border border-gray-700/50 hover:border-gray-600 text-gray-400 hover:text-gray-200 flex items-center justify-center transition shrink-0"
                                        title="Dodaj zdjęcie"
                                    >
                                        <Plus size={18} />
                                    </button>
                                </MediaUploader>
                                <div className="flex-1 relative">
                                    <input
                                        type="text"
                                        placeholder={`Napisz na #${activeGroup.name}...`}
                                        value={newMessage}
                                        onChange={e => setNewMessage(e.target.value.slice(0, MAX_GROUP_MESSAGE))}
                                        maxLength={MAX_GROUP_MESSAGE}
                                        className="w-full bg-background border border-gray-700/50 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-secondary/50 transition placeholder:text-gray-600"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={!newMessage.trim()}
                                    className="w-10 h-10 rounded-xl bg-secondary hover:bg-opacity-80 disabled:opacity-50 disabled:cursor-not-allowed text-white flex items-center justify-center transition shrink-0 active:scale-95"
                                >
                                    <Send size={16} className="translate-x-[1px]" />
                                </button>
                            </form>
                        )}
                    </div>
                )}
            </div>
        )
    }

    // --- MAIN RENDER ---
    return (
        <div className="h-[calc(100vh-140px)] lg:h-[calc(100vh-7rem)] -mx-4 -mt-4 lg:mx-0 lg:mt-0 rounded-xl overflow-hidden border border-gray-800 relative z-10 flex bg-[#121212]">
            {/* Sidebar - always visible on desktop, toggleable on mobile */}
            <div className={`
                ${view === 'list' || view === 'new' || !activeGroup || sidebarOpen ? 'flex' : 'hidden'}
                lg:flex
                ${sidebarOpen ? 'absolute inset-0 z-20' : ''}
                w-full lg:w-80 lg:relative shrink-0
            `}>
                {renderSidebar()}
                {/* Mobile overlay close */}
                {sidebarOpen && (
                    <div className="absolute inset-0 bg-black/50 z-10 lg:hidden" onClick={() => setSidebarOpen(false)} />
                )}
            </div>

            {/* Chat Panel */}
            <div className={`
                flex-1 flex
                ${(view === 'chat' && activeGroup) ? 'flex' : 'hidden'}
                lg:flex
            `}>
                {renderChatPanel()}
            </div>
        </div>
    )
}
