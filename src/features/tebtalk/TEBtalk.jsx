import React, { useEffect, useState, useRef } from 'react'
import { Search, ArrowLeft, Send, MessageCircle, Users, Plus, Settings, X, Trash2, Smile, User, UserX, Menu } from 'lucide-react'
import CreateGroup from './modals/CreateGroup'
import GroupSettings from './modals/GroupSettings'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../services/supabase'
import ReportButton from '../../components/ReportButton'
import MediaUploader from '../../components/common/MediaUploader'
import { ImageKitService } from '../../services/imageKitService'
import { WordFilter } from '../../services/wordFilter'
import { useToast } from '../../context/ToastContext'
import { getRoleLabel, getUserInitial } from '../profile/profileMeta'
import { sanitizeImageUrl, sanitizePlainText } from '../../utils/safeContent'
import {
    fetchBlocks as queryFetchBlocks,
    fetchFriends as queryFetchFriends,
    fetchGroupMembers as queryFetchGroupMembers,
    fetchRecentChats as queryFetchRecentChats,
    fetchMessages as queryFetchMessages,
    loadOlderMessages as queryLoadOlderMessages,
    sendMessage as querySendMessage,
    sendImage as querySendImage,
    deleteMessage as queryDeleteMessage,
    deleteGroupMessage as queryDeleteGroupMessage,
    sendFriendRequest as querySendFriendRequest,
    toggleBlockQuery,
    searchProfiles,
    normalizePrivateTarget as queryNormalizePrivateTarget,
    isBlockedRelationship as queryIsBlockedRelationship,
    appendIncomingMessage as queryAppendIncomingMessage,
} from './services/tebtalkQueries'

// --- Helpers: date separators + Discord-style message grouping ---
function formatDateSeparator(dateStr) {
    const d = new Date(dateStr)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
    const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    if (msgDate.getTime() === today.getTime()) return 'Dzisiaj'
    if (msgDate.getTime() === yesterday.getTime()) return 'Wczoraj'
    return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })
}
function formatTimestamp(dateStr) {
    const d = new Date(dateStr)
    return d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
}
const GROUP_TIME_WINDOW_MS = 5 * 60 * 1000
function groupMessages(messages, myId) {
    if (!messages.length) return []
    const groups = []; let currentGroup = null
    for (const msg of messages) {
        if (msg.is_deleted) { if (currentGroup) { groups.push(currentGroup); currentGroup = null } groups.push({ type: 'deleted', messages: [msg] }); continue }
        const isMe = msg.sender_id === myId
        if (currentGroup && currentGroup.type === 'normal' && currentGroup.senderId === msg.sender_id) {
            const lastMsg = currentGroup.messages[currentGroup.messages.length - 1]
            const timeDiff = new Date(msg.created_at) - new Date(lastMsg.created_at)
            if (timeDiff <= GROUP_TIME_WINDOW_MS && currentGroup.messages.length < 6) { currentGroup.messages.push(msg); continue }
        }
        if (currentGroup) groups.push(currentGroup)
        currentGroup = { type: 'normal', senderId: msg.sender_id, senderName: msg.sender_name || 'Nieznany', isMe, messages: [msg] }
    }
    if (currentGroup) groups.push(currentGroup)
    return groups
}
function splitGroupsByDate(messages, myId) {
    const grouped = groupMessages(messages, myId)
    if (!grouped.length) return []
    const result = []; let currentDate = null; let currentBlock = []
    for (const group of grouped) {
        const firstMsg = group.messages ? group.messages[0] : null
        const msgDate = firstMsg?.created_at ? new Date(firstMsg.created_at).toDateString() : null
        if (msgDate !== currentDate) {
            if (currentBlock.length) result.push({ type: 'block', items: currentBlock, dateLabel: formatDateSeparator(firstMsg?.created_at || currentDate) })
            currentDate = msgDate; currentBlock = []
        }
        currentBlock.push(group)
    }
    if (currentBlock.length && currentDate) result.push({ type: 'block', items: currentBlock, dateLabel: formatDateSeparator(currentDate) })
    return result
}

export default function TEBtalk() {
    const MAX_CHAT_MESSAGE = 2000
    const MAX_CHAT_GROUP_NAME = 120
    const RECENT_DM_SCAN_LIMIT = 300
    const INITIAL_MESSAGES_FETCH_LIMIT = 120
    const LOAD_OLDER_MESSAGES_LIMIT = 80
    const MAX_MESSAGES_IN_MEMORY = 300
    const CHAT_CACHE_TTL_MS = 30 * 60 * 1000
    const STATE_CACHE_TTL_MS = 10 * 60 * 1000

    const [view, setView] = useState('list') // 'list', 'chat', 'search', 'friends'
    const [recentChats, setRecentChats] = useState([])
    const [searchResults, setSearchResults] = useState([])
    const [searchQuery, setSearchQuery] = useState('')
    const [activeChatUser, setActiveChatUser] = useState(null)
    const [messages, setMessages] = useState([])
    const [newMessage, setNewMessage] = useState('')
    const [myId, setMyId] = useState(null)
    const [loading, setLoading] = useState(true)
    const [chatLoading, setChatLoading] = useState(false)
    const [loadingOlderMessages, setLoadingOlderMessages] = useState(false)
    const [hasOlderMessages, setHasOlderMessages] = useState(false)
    const [isCreatingGroup, setIsCreatingGroup] = useState(false)
    const [isGroupSettingsOpen, setIsGroupSettingsOpen] = useState(false)
    const [friends, setFriends] = useState([])
    const [groupMembers, setGroupMembers] = useState([])
    const [myBlockedIds, setMyBlockedIds] = useState([])
    const [blockedByIds, setBlockedByIds] = useState([])
    const [chatError, setChatError] = useState('')
    const [sidebarOpen, setSidebarOpen] = useState(false)
    
    const toast = useToast()
    const messagesEndRef = useRef(null)
    const chatMessagesCacheRef = useRef(new Map())
    const location = useLocation()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const routeChat = location.state?.openChatWith
    const routeChatId = searchParams.get('chat') || routeChat?.id || null

    const getMessagesCacheKey = (userId, chatId, isGroup) => `${userId}:${isGroup ? 'group' : 'private'}:${chatId}`

    const isValidCachedMessage = (message) => {
        if (!message || typeof message !== 'object') return false
        if (typeof message.id !== 'string' && typeof message.id !== 'number') return false
        if (typeof message.sender_id !== 'string' || !message.sender_id) return false
        if (typeof message.content !== 'string') return false
        if (typeof message.created_at !== 'string') return false
        return true
    }

    const sanitizeCachedMessages = (data) => {
        if (!Array.isArray(data)) return null
        const sanitized = data.filter(isValidCachedMessage).slice(-MAX_MESSAGES_IN_MEMORY)
        return sanitized.length ? sanitized : null
    }

    const sanitizeCachedState = (data) => {
        if (!data || typeof data !== 'object') return null
        const safeRecentChats = Array.isArray(data.recentChats)
            ? data.recentChats.filter(chat => chat && typeof chat === 'object' && typeof chat.id === 'string').slice(-200)
            : []
        const safeFriends = Array.isArray(data.friends)
            ? data.friends.filter(friend => friend && typeof friend === 'object' && typeof friend.id === 'string').slice(-300)
            : []
        return { recentChats: safeRecentChats, friends: safeFriends }
    }

    const readCachedSessionEntry = (key, ttlMs) => {
        try {
            const raw = sessionStorage.getItem(key)
            if (!raw) return null
            const parsed = JSON.parse(raw)
            
            // Walidacja schematu (reczna — bez zaleznosci od AJV w przegladarce)
            const isValid = typeof parsed === 'object' && parsed !== null &&
                typeof parsed.ts === 'number' && 'data' in parsed;

            if (!isValid) {
                console.warn('[TEBtalk] Invalid cache schema, clearing');
                sessionStorage.removeItem(key);
                return null;
            }
            
            if ((Date.now() - parsed.ts) > ttlMs) {
                sessionStorage.removeItem(key)
                return null
            }
            if (key.startsWith('tebtalk_messages_')) return sanitizeCachedMessages(parsed.data)
            if (key.startsWith('tebtalk_state_')) return sanitizeCachedState(parsed.data)
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

    const hydrateMessagesCache = (chatId, isGroup) => {
        if (!myId || !chatId) return false
        const cacheKey = getMessagesCacheKey(myId, chatId, isGroup)
        const inMemory = chatMessagesCacheRef.current.get(cacheKey)
        if (Array.isArray(inMemory) && inMemory.length) {
            setMessages(inMemory)
            return true
        }

        const fromSession = readCachedSessionEntry(`tebtalk_messages_${cacheKey}`, CHAT_CACHE_TTL_MS)
        if (Array.isArray(fromSession) && fromSession.length) {
            chatMessagesCacheRef.current.set(cacheKey, fromSession)
            setMessages(fromSession)
            return true
        }

        return false
    }

    const persistMessagesCache = (chatId, isGroup, list) => {
        if (!myId || !chatId || !Array.isArray(list)) return
        const trimmed = list.slice(-250)
        const cacheKey = getMessagesCacheKey(myId, chatId, isGroup)
        chatMessagesCacheRef.current.set(cacheKey, trimmed)
        writeCachedSessionEntry(`tebtalk_messages_${cacheKey}`, trimmed)
    }

    const normalizePrivateTarget = queryNormalizePrivateTarget

    useEffect(() => {
        supabase.auth.getSession()
            .then(({ data: { session } }) => {
                if (session) {
                    setMyId(session.user.id)
                    loadCommunicationState(session.user.id)
                    return
                }

                if (import.meta.env.DEV) {
                    const fallbackUserId = 'local-test-user'
                    setMyId(fallbackUserId)
                    loadCommunicationState(fallbackUserId)
                    return
                }

                setChatError('Sesja wygasła. Zaloguj się ponownie, aby otworzyć wiadomości.')
                setLoading(false)
            })
            .catch(error => {
                console.error('Failed to load session for TEBtalk:', error)
                if (import.meta.env.DEV) {
                    const fallbackUserId = 'local-test-user'
                    setMyId(fallbackUserId)
                    loadCommunicationState(fallbackUserId)
                    return
                }
                setChatError('Nie udało się odczytać sesji użytkownika.')
                setLoading(false)
            })
    }, [])

    useEffect(() => {
        if (!myId || !routeChatId) return

        let cancelled = false

        async function openRouteChat() {
            setChatError('')

            try {
                const fallbackTarget = normalizePrivateTarget(routeChat)
                if (fallbackTarget?.id) {
                    setActiveChatUser(fallbackTarget)
                    setGroupMembers([])
                    setView('chat')
                }

                const { data, error } = await supabase
                    .from('profiles')
                    .select('id, full_name, role, avatar_url')
                    .eq('id', routeChatId)
                    .single()

                if (cancelled) return

                if (error && !fallbackTarget) {
                    console.error('Failed to load chat target profile:', error)
                    setChatError('Nie udało się otworzyć tej rozmowy.')
                    setActiveChatUser(null)
                    setView('list')
                    return
                }

                const target = normalizePrivateTarget(data) || fallbackTarget
                if (!target?.id) {
                    setChatError('Nie udało się odczytać danych rozmówcy.')
                    setActiveChatUser(null)
                    setView('list')
                    return
                }

                setActiveChatUser(target)
                setGroupMembers([])
                setView('chat')
            } catch (error) {
                if (cancelled) return
                console.error('Unexpected route chat opening error:', error)
                setChatError('Wystąpił błąd podczas otwierania rozmowy.')
                setActiveChatUser(null)
                setView('list')
            } finally {
                if (!cancelled) setChatLoading(false)
            }
        }

        openRouteChat()

        return () => {
            cancelled = true
        }
    }, [myId, routeChat, routeChatId])

    useEffect(() => {
        if (view === 'chat' && !activeChatUser) {
            setView('list')
        }
    }, [view, activeChatUser])

    useEffect(() => {
        if (view !== 'chat' || !activeChatUser?.id) return
        persistMessagesCache(activeChatUser.id, activeChatUser.type === 'group', messages)
    }, [messages, view, activeChatUser, myId])

    useEffect(() => {
        if (view === 'chat' && activeChatUser && myId) {
            const isGroup = activeChatUser.type === 'group'
            const tableName = isGroup ? 'chat_group_messages' : 'direct_messages'

            setChatError('')

            const loadChat = async () => {
                const hadCachedMessages = hydrateMessagesCache(activeChatUser.id, isGroup)
                setChatLoading(!hadCachedMessages)
                try {
                    if (isGroup) await fetchGroupMembers(activeChatUser.id)
                    else setGroupMembers([])
                    await fetchMessages(activeChatUser.id, isGroup, { hadCachedMessages })
                } finally {
                    setChatLoading(false)
                }
            }

            loadChat()

            const channel = supabase.channel(isGroup ? `group_${activeChatUser.id}` : 'direct_messages')
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: tableName }, payload => {
                    const msg = payload.new
                    if (isGroup) {
                        if (msg.group_id === activeChatUser.id) {
                            setMessages(prev => appendIncomingMessage(prev, msg))
                            scrollToBottom()
                        }
                    } else {
                        if ((msg.sender_id === myId && msg.receiver_id === activeChatUser.id) ||
                            (msg.sender_id === activeChatUser.id && msg.receiver_id === myId)) {
                            setMessages(prev => appendIncomingMessage(prev, msg))
                            scrollToBottom()
                        }
                    }
                })
                .subscribe((status) => {
                    if (status === 'CHANNEL_ERROR') {
                        console.warn('Failed to subscribe to messages for chat:', activeChatUser.id)
                        setChatError('Połączenie z rozmową zostało przerwane. Odśwież widok.')
                    }
                })

            return () => { supabase.removeChannel(channel) }
        }
    }, [view, activeChatUser, myId])

    const scrollToBottom = () => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }, 100)
    }

    const appendIncomingMessage = queryAppendIncomingMessage

    function isBlockedRelationship(userId) {
        return queryIsBlockedRelationship(userId, myBlockedIds, blockedByIds)
    }

    function isAcceptedFriend(userId) {
        return friends.some(friend => friend.id === userId)
    }

    async function fetchBlocks(userId) {
        const result = await queryFetchBlocks(userId)
        setMyBlockedIds(result.blocked)
        setBlockedByIds(result.blockedBy)
        return result
    }

    async function loadCommunicationState(userId) {
        const cachedState = readCachedSessionEntry(`tebtalk_state_${userId}`, STATE_CACHE_TTL_MS)
        if (cachedState?.recentChats) setRecentChats(cachedState.recentChats)
        if (cachedState?.friends) setFriends(cachedState.friends)
        setLoading(!cachedState)

        const blockState = await fetchBlocks(userId)
        const [chats, friendsList] = await Promise.all([
            fetchRecentChats(userId, blockState),
            fetchFriends(userId, blockState)
        ])

        writeCachedSessionEntry(`tebtalk_state_${userId}`, {
            recentChats: chats || [],
            friends: friendsList || []
        })
        setLoading(false)
    }

    async function fetchFriends(userId, blockState = null) {
        const blocked = new Set(blockState?.blocked || myBlockedIds)
        const blockedBy = new Set(blockState?.blockedBy || blockedByIds)
        const normalizedFriends = await queryFetchFriends(userId, { blocked: Array.from(blocked), blockedBy: Array.from(blockedBy) })
        setFriends(normalizedFriends)
        return normalizedFriends
    }

    async function fetchGroupMembers(groupId) {
        const normalizedMembers = await queryFetchGroupMembers(groupId)
        setGroupMembers(normalizedMembers)
        return normalizedMembers
    }

    async function fetchRecentChats(userId, blockState = null) {
        const chats = await queryFetchRecentChats(userId, blockState, RECENT_DM_SCAN_LIMIT)
        setRecentChats(chats)
        return chats
    }

    async function handleSearch(e) {
        const nextQuery = sanitizePlainText(e.target.value, { maxLength: 60 })
        setSearchQuery(nextQuery)
        if (nextQuery.length < 3) {
            setSearchResults([])
            return
        }
        const results = await searchProfiles(nextQuery, myId, 10)
        if (results) {
            setSearchResults(results.filter(user => !isBlockedRelationship(user.id)))
        }
    }

    async function toggleBlock(userId) {
        const isBlocked = myBlockedIds.includes(userId)
        const { action, error } = await toggleBlockQuery(myId, userId, isBlocked)

        if (error) {
            console.error(error)
            toast.error(action === 'unblocked' ? 'Nie udało się odblokować użytkownika.' : 'Nie udało się zablokować użytkownika.')
            return
        }

        if (action === 'blocked') {
            if (activeChatUser?.type === 'private' && activeChatUser.id === userId) {
                setActiveChatUser(null)
                setMessages([])
                setView('list')
            }
            toast.success('Użytkownik został zablokowany.')
        } else {
            toast.success('Użytkownik został odblokowany.')
        }

        await loadCommunicationState(myId)
        setSearchResults(prev => prev.filter(user => !isBlockedRelationship(user.id) && user.id !== userId))
    }

    async function fetchMessages(partnerId, isGroup = false, options = {}) {
        const { hadCachedMessages = false } = options
        const { messages: fetchedMessages, error } = await queryFetchMessages(myId, partnerId, isGroup, INITIAL_MESSAGES_FETCH_LIMIT)

        if (error) {
            console.error("Błąd pobierania wiadomości:", error)
            if (!hadCachedMessages) {
                setMessages([])
                setChatError('Nie udało się pobrać wiadomości.')
            } else {
                setChatError('Nie udało się odświeżyć rozmowy. Wyświetlam ostatnio zapisane wiadomości.')
            }
        } else if (fetchedMessages) {
            setMessages(fetchedMessages.slice(-MAX_MESSAGES_IN_MEMORY))
            setHasOlderMessages(fetchedMessages.length >= INITIAL_MESSAGES_FETCH_LIMIT)
            persistMessagesCache(partnerId, isGroup, fetchedMessages)
            scrollToBottom()
        }
    }

    async function loadOlderMessages() {
        if (!activeChatUser?.id || !messages.length || loadingOlderMessages) return

        const oldestMessage = messages[0]
        if (!oldestMessage?.created_at) return

        const isGroup = activeChatUser.type === 'group'
        setLoadingOlderMessages(true)

        const { messages: olderMessages, error } = await queryLoadOlderMessages(
            myId, oldestMessage.created_at, activeChatUser.id, isGroup, LOAD_OLDER_MESSAGES_LIMIT
        )

        if (error) {
            console.error('Błąd pobierania starszych wiadomości:', error)
            setChatError('Nie udało się pobrać starszych wiadomości.')
            setLoadingOlderMessages(false)
            return
        }

        if (!olderMessages || !olderMessages.length) {
            setHasOlderMessages(false)
            setLoadingOlderMessages(false)
            return
        }

        setMessages(prev => {
            const merged = [...olderMessages, ...prev]
            return merged.slice(-MAX_MESSAGES_IN_MEMORY)
        })
        setHasOlderMessages(olderMessages.length >= LOAD_OLDER_MESSAGES_LIMIT)
        setLoadingOlderMessages(false)
    }

    async function sendMessage(e) {
        e.preventDefault()
        const sanitizedMessage = sanitizePlainText(newMessage, { maxLength: MAX_CHAT_MESSAGE, preserveLineBreaks: true })
        if (!sanitizedMessage || !activeChatUser) return

        if (sanitizedMessage.length > MAX_CHAT_MESSAGE) {
            toast.error(`Wiadomość jest za długa (max ${MAX_CHAT_MESSAGE} znaków).`)
            return
        }

        const msgText = sanitizedMessage
        const tempId = Math.random().toString(36).substring(7)

        const optimisticMsg = {
            id: tempId,
            sender_id: myId,
            [activeChatUser.type === 'group' ? 'group_id' : 'receiver_id']: activeChatUser.id,
            content: WordFilter.clean(msgText),
            created_at: new Date().toISOString(),
            status: 'sending'
        }

        setMessages(prev => [...prev, optimisticMsg])
        setNewMessage('')
        scrollToBottom()

        const { data, error } = await querySendMessage(myId, activeChatUser, msgText)

        if (error) {
            console.error("Błąd wysyłania:", error)
            const isBlockedOrRestricted = error.code === '42501' || /row-level security|permission denied/i.test(error.message || '')
            toast.error(isBlockedOrRestricted ? 'Ta osoba nie przyjmuje od Ciebie wiadomości lub istnieje blokada.' : 'Nie udało się wysłać wiadomości.')
            setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'error' } : m))
        } else if (data) {
            setMessages(prev => {
                const withoutTemp = prev.filter(m => m.id !== tempId)
                const alreadyAdded = withoutTemp.some(m => m.id === data.id)
                return alreadyAdded ? withoutTemp : [...withoutTemp, data]
            })
        }
    }

    async function sendImage(url) {
        if (!activeChatUser) return
        const safeUrl = sanitizeImageUrl(url)
        if (!safeUrl) {
            toast.error('Nieprawidłowy adres obrazu.')
            return
        }

        const { error } = await querySendImage(myId, activeChatUser, safeUrl)
        if (error) {
            console.error("Błąd wysyłania zdjęcia:", error)
            const isBlockedOrRestricted = error.code === '42501' || /row-level security|permission denied/i.test(error.message || '')
            toast.error(isBlockedOrRestricted ? 'Nie możesz wysłać zdjęcia do tego użytkownika.' : 'Błąd wysyłania zdjęcia.')
        }
    }

    async function deleteMessage(messageId) {
        if (!confirm('Czy na pewno chcesz usunąć tę wiadomość?')) return
        const isGroup = activeChatUser.type === 'group'

        const { error } = isGroup
            ? await queryDeleteGroupMessage(messageId, myId)
            : await queryDeleteMessage(messageId, myId)

        if (error) {
            console.error("Błąd usuwania wiadomości:", error)
            toast.error("Nie udało się usunąć wiadomości.")
        } else {
            setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: 'Wiadomość usunięta', is_deleted: true } : m))
        }
    }

    async function sendFriendRequest(friendId) {
        if (isBlockedRelationship(friendId)) {
            toast.error('Relacja jest zablokowana. Najpierw odblokuj użytkownika.')
            return
        }

        const { error } = await querySendFriendRequest(myId, friendId)
        if (error) {
            toast.info("Zaproszenie już wysłane lub błąd.")
        } else {
            toast.success("Zaproszenie wysłane!")
        }
    }

    const openChat = (target) => {
        const normalizedTarget = target?.type === 'private' ? normalizePrivateTarget(target) : target
        if (!normalizedTarget?.id) {
            toast.error('Nie udało się otworzyć rozmowy.')
            return
        }

        if (normalizedTarget.type === 'private') {
            if (isBlockedRelationship(normalizedTarget.id)) {
                toast.info('Nie możesz otworzyć rozmowy, ponieważ relacja jest zablokowana.')
                return
            }
            if (false) {
                toast.info('Ten użytkownik przyjmuje prywatne wiadomości tylko od znajomych.')
                return
            }
        }

        setChatError('')
        setActiveChatUser(normalizedTarget)
        setView('chat')
    }

    const closeChat = () => {
        setActiveChatUser(null)
        setMessages([])
        setChatError('')
        setIsGroupSettingsOpen(false)
        setView('list')
        if (routeChatId || routeChat) {
            navigate('/tebtalk', { replace: true, state: null })
        }
    }

    const openProfile = (userId, event) => {
        if (event) event.stopPropagation()
        if (!userId) return
        navigate(`/profile/${userId}`)
    }

    if (view === 'chat' && activeChatUser) {
        const activeChatName = sanitizePlainText(activeChatUser.full_name, { maxLength: 80 }) || 'Użytkownik'
        const activeChatAvatarUrl = sanitizeImageUrl(activeChatUser.avatar_url)

        return (
            <>
            <div className="flex flex-col h-[calc(100vh-140px)] bg-background -mx-4 -mt-4 rounded-xl overflow-hidden border border-gray-800 relative z-10 lg:h-full lg:min-h-[calc(100vh-7rem)] lg:mx-0 lg:mt-0">
                {/* Header Czatu */}
                <div className="bg-[#1a1a1a] px-4 py-3 border-b border-gray-800 flex items-center gap-3 shrink-0">
                    <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-gray-400 hover:text-white transition lg:hidden">
                        <Menu size={20} />
                    </button>
                    <button onClick={closeChat} className="p-2 -ml-2 text-gray-400 hover:text-white transition">
                        <ArrowLeft size={20} />
                    </button>
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center font-bold overflow-hidden shadow-sm shrink-0">
                            {activeChatUser.type === 'group' ? (
                                <Users size={20} className="text-secondary" />
                            ) : activeChatAvatarUrl ? (
                                <button type="button" onClick={(event) => openProfile(activeChatUser.id, event)} className="w-full h-full">
                                    <img src={ImageKitService.getOptimizedUrl(activeChatAvatarUrl)} alt="Av" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                                </button>
                            ) : (
                                <button type="button" onClick={(event) => openProfile(activeChatUser.id, event)} className="w-full h-full flex items-center justify-center">
                                    {getUserInitial(activeChatName)}
                                </button>
                            )}
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                            <div className="font-bold text-white leading-tight flex items-center gap-1.5 truncate">
                                {activeChatName}
                                {activeChatUser.role === 'admin' && <span className="bg-red-500 w-2 h-2 rounded-full shadow-[0_0_5px_red]"></span>}
                            </div>
                            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider truncate">
                                {activeChatUser.type === 'group' ? `Grupa (${groupMembers.length} osób)` : getRoleLabel(activeChatUser.role || 'student')}
                            </div>
                        </div>
                    </div>
                    {activeChatUser.type === 'private' && (
                        <button
                            onClick={() => toggleBlock(activeChatUser.id)}
                            className={`p-2 transition active:scale-90 ${myBlockedIds.includes(activeChatUser.id) ? 'text-red-500 hover:text-red-400' : 'text-gray-500 hover:text-red-500'}`}
                            title={myBlockedIds.includes(activeChatUser.id) ? 'Odblokuj użytkownika' : 'Zablokuj użytkownika'}
                        >
                            <UserX size={18} />
                        </button>
                    )}
                    {activeChatUser.type === 'group' && (
                        <button onClick={() => setIsGroupSettingsOpen(true)} className="p-2 text-gray-500 hover:text-white transition active:scale-90">
                            <Settings size={20} />
                        </button>
                    )}
                </div>

                {/* Pole Wiadomości */}
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 scrollbar-none">
                    {!chatLoading && hasOlderMessages && messages.length > 0 && (
                        <button
                            type="button"
                            onClick={loadOlderMessages}
                            disabled={loadingOlderMessages}
                            className="self-center mb-2 px-4 py-1.5 text-xs font-bold rounded-full border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 disabled:opacity-50"
                        >
                            {loadingOlderMessages ? 'Ładowanie starszych...' : 'Załaduj starsze wiadomości'}
                        </button>
                    )}
                    {chatError ? (
                        <div className="m-auto max-w-xs rounded-2xl border border-red-900/40 bg-red-950/20 px-4 py-3 text-center text-sm text-red-200">
                            {chatError}
                        </div>
                    ) : chatLoading ? (
                        <div className="m-auto text-center text-gray-500 flex flex-col items-center gap-2">
                            <MessageCircle size={32} className="opacity-50 animate-pulse" />
                            <p className="text-sm">Otwieranie rozmowy...</p>
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="m-auto text-center text-gray-500 flex flex-col items-center gap-2">
                            <MessageCircle size={32} className="opacity-50" />
                            <p className="text-sm">Brak wiadomości.<br />Napisz jako pierwszy!</p>
                        </div>
                    ) : (() => {
                        const messageBlocks = splitGroupsByDate(messages, myId)
                        return (
                            <div className="flex flex-col gap-0">
                                {messageBlocks.map((block, blockIdx) => (
                                    <div key={blockIdx} className="mb-4">
                                        <div className="flex items-center gap-3 mb-3 mt-1">
                                            <div className="flex-1 h-px bg-gray-800/60" />
                                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider shrink-0">{block.dateLabel}</span>
                                            <div className="flex-1 h-px bg-gray-800/60" />
                                        </div>
                                        {block.items.map((group, groupIdx) => {
                                            if (group.type === 'deleted') {
                                                return <div key={groupIdx} className="flex justify-center my-2"><span className="text-[11px] text-gray-600 italic">Wiadomość usunięta</span></div>
                                            }
                                            const sender = activeChatUser.type === 'group' ? groupMembers.find(m => m.user_id === group.senderId) : null
                                            const senderName = sanitizePlainText(sender?.nickname || sender?.profiles?.full_name || group.senderName, { maxLength: 80 }) || 'Użytkownik'
                                            return (
                                                <div key={groupIdx} className={`flex mb-0.5 ${group.isMe ? 'justify-end' : 'justify-start'}`}>
                                                    {!group.isMe && (
                                                        <div className="flex flex-col items-center mr-2.5 mt-0.5 shrink-0">
                                                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center text-xs font-bold text-white">{(senderName || '?')[0].toUpperCase()}</div>
                                                        </div>
                                                    )}
                                                    <div className={`flex flex-col max-w-[75%] min-w-0 ${group.isMe ? 'items-end' : 'items-start'}`}>
                                                        {!group.isMe && activeChatUser.type === 'group' && (
                                                            <span className="text-[11px] font-bold text-gray-400 ml-1 mb-0.5">{senderName}</span>
                                                        )}
                                                        {group.messages.map((msg, msgIdx) => {
                                                            const isImage = !msg.is_deleted && msg.content && msg.content.startsWith('https://')
                                                            const isLastInGroup = msgIdx === group.messages.length - 1
                                                            const msgSafeImageUrl = sanitizeImageUrl(msg.content)
                                                            return (
                                                                <div key={msg.id} className={`group relative flex items-end gap-1.5 ${msgIdx > 0 ? 'mt-0.5' : ''}`}>
                                                                    {group.isMe && !msg.is_deleted && (
                                                                        <button onClick={() => deleteMessage(msg.id)} className="opacity-0 group-hover:opacity-100 transition-all duration-150 p-1 text-gray-600 hover:text-red-500 -ml-8 shrink-0" title="Usuń"><Trash2 size={12} /></button>
                                                                    )}
                                                                    {!group.isMe && !msg.is_deleted && (
                                                                        <div className="opacity-0 group-hover:opacity-100 transition-all duration-150 shrink-0">
                                                                            <ReportButton entityType={activeChatUser.type === 'group' ? "group_message" : "direct_message"} entityId={msg.id} subtle={true} />
                                                                        </div>
                                                                    )}
                                                                    <div className={`px-3 py-2 text-sm leading-relaxed break-words ${msg.is_deleted ? 'bg-gray-800/20 text-gray-600 italic border border-gray-800/30 rounded-xl' : group.isMe ? 'bg-gradient-to-br from-secondary to-emerald-600 text-white rounded-2xl rounded-br-sm' : 'bg-[#1e1e1e] border border-gray-800/60 text-gray-200 rounded-2xl rounded-bl-sm'} ${msg.status === 'sending' ? 'opacity-70' : ''}`}
                                                                        style={{ boxShadow: group.isMe && !msg.is_deleted ? '0 1px 4px rgba(34,197,94,0.15)' : 'none' }}>
                                                                        {msg.is_deleted ? 'Usunięto' : isImage ? (
                                                                            <img src={ImageKitService.getOptimizedUrl(msg.content, 400)} alt="Zdjęcie" className="rounded-lg max-w-full cursor-pointer hover:opacity-90 transition" onClick={() => window.open(msg.content, '_blank', 'noopener,noreferrer')} loading="lazy" />
                                                                        ) : (
                                                                            <span className="whitespace-pre-wrap">{sanitizePlainText(msg.content, { maxLength: MAX_CHAT_MESSAGE, preserveLineBreaks: true })}</span>
                                                                        )}
                                                                    </div>
                                                                    {isLastInGroup && (
                                                                        <span className="text-[9px] text-gray-600 whitespace-nowrap mt-auto mb-1 px-0.5 shrink-0">{formatTimestamp(msg.created_at)}</span>
                                                                    )}
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                    {group.isMe && <div className="w-9 h-9 shrink-0 ml-2.5 hidden lg:block" />}
                                                </div>
                                            )
                                        })}
                                    </div>
                                ))}
                                <div ref={messagesEndRef} />
                            </div>
                        )
                    })()}
                </div>

                {/* Pole Wprowadzania - Messenger Style */}
                <div className="p-2 bg-[#1a1a1a] border-t border-gray-800 flex items-end gap-2 shrink-0 pb-4">
                    <form onSubmit={sendMessage} className="flex-1 flex items-end gap-2 relative">
                        {/* Przycisk załączników (Spinacz / Plus) */}
                        <div className="mb-1">
                            <MediaUploader module="tebtalk" onUploadSuccess={sendImage}>
                                <div className="w-9 h-9 rounded-full bg-gray-800 text-primary flex items-center justify-center hover:bg-gray-700 transition cursor-pointer">
                                    <Plus size={20} />
                                </div>
                            </MediaUploader>
                        </div>

                        {/* Input Field */}
                        <div className="flex-1 bg-gray-800/50 border border-gray-700 rounded-[20px] flex items-center min-h-[40px] px-4 py-2 transition-all focus-within:border-primary focus-within:bg-gray-800">
                            <input
                                type="text"
                                placeholder="Napisz wiadomość..."
                                value={newMessage}
                                onChange={e => setNewMessage(e.target.value.slice(0, MAX_CHAT_MESSAGE))}
                                maxLength={MAX_CHAT_MESSAGE}
                                className="w-full bg-transparent text-white text-[15px] outline-none placeholder-gray-500 max-h-[100px] overflow-y-auto"
                                style={{ resize: 'none' }}
                            />
                            <button type="button" className="text-gray-400 hover:text-yellow-400 transition ml-2 p-1">
                                <Smile size={20} />
                            </button>
                        </div>

                        {/* Send Button */}
                        {newMessage.trim() ? (
                            <button type="submit" className="mb-1 w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary-dark transition shadow-lg shadow-primary/20 animate-in zoom-in duration-200">
                                <Send size={18} className="translate-x-[1px] translate-y-[1px]" />
                            </button>
                        ) : (
                            <div className="mb-1 w-9 h-9 flex items-center justify-center text-primary">
                                {/* Opcjonalnie: Przycisk Like/Kciuk gdy pusto, jak w Messengerze */}
                                <div className="cursor-pointer hover:scale-110 transition active:scale-95" onClick={() => setNewMessage('👍')}>
                                    <span className="text-xl">👍</span>
                                </div>
                            </div>
                        )}
                    </form>
                </div>

                {/* Ustawienia Grupy - wyekstrahowany modal */}
                <GroupSettings
                    isOpen={isGroupSettingsOpen}
                    onClose={() => setIsGroupSettingsOpen(false)}
                    groupMembers={groupMembers}
                    friends={friends}
                    currentUserId={myId}
                    currentUserRole={groupMembers.find(m => m.user_id === myId)?.role || 'member'}
                    groupId={activeChatUser?.id}
                    groupName={activeChatName}
                    groupImageUrl={''}
                    onGroupUpdated={() => fetchGroupMembers(activeChatUser.id)}
                    onMemberAdded={() => fetchGroupMembers(activeChatUser.id)}
                    onRoleChanged={() => fetchGroupMembers(activeChatUser.id)}
                    onMemberRemoved={() => fetchGroupMembers(activeChatUser.id)}
                    onLeaveGroup={() => {
                        setActiveChatUser(null)
                        setMessages([])
                        setView('list')
                        fetchRecentChats(myId)
                    }}
                    toast={toast}
                />
            </div>
            {/* Mobile sidebar overlay */}
            {sidebarOpen && (
                <div className="fixed inset-0 z-50 lg:hidden">
                    <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
                    <div className="absolute left-0 top-0 bottom-0 w-72 bg-[#121212] border-r border-gray-800 shadow-2xl animate-in slide-in-from-left duration-200 overflow-y-auto">
                        <div className="p-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Rozmowy</h3>
                                <button onClick={() => setSidebarOpen(false)} className="text-gray-400 hover:text-white p-1">
                                    <X size={18} />
                                </button>
                            </div>
                            {recentChats.length === 0 ? (
                                <div className="text-center text-gray-500 text-sm py-8">Brak rozmów</div>
                            ) : (
                                <div className="flex flex-col gap-1">
                                    {recentChats.map(chat => (
                                        <div key={chat.id} onClick={() => { openChat(chat); setSidebarOpen(false) }} 
                                             className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/5 cursor-pointer transition">
                                            <div className="w-9 h-9 rounded-full bg-gray-800 flex items-center justify-center shrink-0 text-sm font-bold">
                                                {chat.type === 'group' ? <Users size={16} className="text-secondary" /> : (chat.avatar_url ? null : chat.full_name?.charAt(0) || '?')}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-bold text-white truncate">{chat.full_name}</div>
                                                <div className="text-[10px] text-gray-500 truncate">{chat.type === 'group' ? 'Grupa' : 'Prywatna'}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            </>
        )
    }

    return (
        <div className="pb-10 lg:min-h-full lg:pb-0">
            {chatError && view !== 'chat' ? (
                <div className="mb-4 rounded-2xl border border-red-900/40 bg-red-950/20 px-4 py-3 text-sm text-red-200">
                    {chatError}
                </div>
            ) : null}
            <div className="flex justify-between items-center mb-6 px-2">
                <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight">TEBtalk</h2>
                    <div className="text-xs text-gray-500 font-bold">Prywatny komunikator</div>
                </div>
                {view === 'list' && (
                    <div className="flex gap-2">
                        <button onClick={() => setView('friends')} className="p-2.5 bg-surface border border-gray-700 rounded-full text-primary cursor-pointer active:scale-95 transition relative">
                            <Plus size={18} />
                        </button>
                        <button onClick={() => setIsCreatingGroup(true)} className="p-2.5 bg-surface border border-gray-700 rounded-full text-secondary cursor-pointer active:scale-95 transition">
                            <Users size={18} />
                        </button>
                        <button onClick={() => setView('search')} className="p-2.5 bg-surface border border-gray-700 rounded-full text-white cursor-pointer active:scale-95 transition">
                            <Search size={18} />
                        </button>
                    </div>
                )}
            </div>

            {view === 'friends' && (
                <div className="mb-6 fade-in">
                    <div className="flex items-center gap-3 mb-6">
                        <button onClick={() => setView('list')} className="p-2 text-gray-400 hover:text-white transition">
                            <ArrowLeft size={20} />
                        </button>
                        <h3 className="text-xl font-bold text-white">Twoi Znajomi</h3>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                        {friends.length === 0 ? (
                            <div className="text-center p-10 bg-surface border border-gray-800 border-dashed rounded-3xl text-gray-500">
                                Nie masz jeszcze znajomych. <br /> Wyszukaj kogoś i wyślij zaproszenie!
                            </div>
                        ) : (
                            friends.map(friend => (
                                <div key={friend.id} onClick={() => openChat({ ...friend, type: 'private' })} className="bg-surface border border-gray-800 p-4 rounded-2xl flex items-center gap-4 cursor-pointer hover:border-primary transition group">
                                    <button type="button" onClick={(event) => openProfile(friend.id, event)} className="w-12 h-12 rounded-full bg-gray-800 border border-gray-700 overflow-hidden flex items-center justify-center font-bold text-lg shrink-0">
                                        {friend.avatar_url ? <img src={ImageKitService.getOptimizedUrl(friend.avatar_url)} alt="Av" className="w-full h-full object-cover" loading="lazy" decoding="async" /> : getUserInitial(friend.full_name)}
                                    </button>
                                    <div className="flex-1 text-left min-w-0">
                                        <div className="font-bold text-white group-hover:text-primary transition truncate">{friend.full_name}</div>
                                        <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest truncate">{getRoleLabel(friend.role || 'student')}</div>
                                    </div>
                                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                        <MessageCircle size={16} />
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    <button 
                        onClick={() => setView('search')}
                        className="w-full mt-6 py-4 bg-surface border border-gray-800 border-dashed rounded-2xl text-gray-400 text-sm flex items-center justify-center gap-2 hover:border-primary hover:text-primary transition"
                    >
                        <Search size={16} /> Znajdź nowych osób
                    </button>
                </div>
            )}

            {view === 'search' && (
                <div className="mb-6 fade-in">
                    <div className="flex gap-2 mb-4">
                        <button onClick={() => { setView('list'); setSearchQuery(''); setSearchResults([]) }} className="p-3 bg-surface border border-gray-800 rounded-xl text-gray-400">
                            <ArrowLeft size={20} />
                        </button>
                        <input
                            type="text" autoFocus
                            placeholder="Wyszukaj ucznia..."
                            value={searchQuery}
                            onChange={handleSearch}
                            className="flex-1 p-3 bg-surface border border-gray-700 rounded-xl text-white outline-none focus:border-primary shadow-inner"
                        />
                    </div>
                    {searchResults.length > 0 ? (
                        <div className="flex flex-col gap-2">
                            {searchResults.map(user => (
                                <div key={user.id} onClick={() => openChat({ ...user, type: 'private' })} className="bg-surface border border-gray-800 p-3 rounded-2xl flex items-center gap-3 transition cursor-pointer hover:border-primary/40">
                                    <button type="button" onClick={(event) => openProfile(user.id, event)} className="w-10 h-10 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center font-bold overflow-hidden shrink-0">
                                        {user.avatar_url ? (
                                            <img src={ImageKitService.getOptimizedUrl(user.avatar_url)} alt="Av" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                                        ) : (
                                            getUserInitial(user.full_name)
                                        )}
                                    </button>
                                    <div className="flex-1 text-left min-w-0">
                                        <div className="font-bold text-white text-sm truncate">{user.full_name}</div>
                                        <div className="text-[10px] text-gray-500 uppercase truncate">{getRoleLabel(user.role || 'student')}</div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={(event) => {
                                                event.stopPropagation()
                                                toggleBlock(user.id)
                                            }}
                                            className={`p-2 rounded-lg transition active:scale-90 ${myBlockedIds.includes(user.id) ? 'bg-red-500/20 text-red-500' : 'bg-gray-800 text-gray-300 hover:text-red-500'}`}
                                            title={myBlockedIds.includes(user.id) ? 'Odblokuj użytkownika' : 'Zablokuj użytkownika'}
                                        >
                                            <UserX size={18} />
                                        </button>
                                        <button 
                                            onClick={(event) => {
                                                event.stopPropagation()
                                                sendFriendRequest(user.id)
                                            }}
                                            disabled={isBlockedRelationship(user.id)}
                                            className="p-2 bg-primary/20 text-primary rounded-lg hover:bg-primary hover:text-white transition active:scale-90 disabled:opacity-40"
                                            title="Dodaj do znajomych"
                                        >
                                            <Plus size={18} />
                                        </button>
                                        <button type="button" onClick={(event) => openProfile(user.id, event)} className="p-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-white hover:text-black transition active:scale-90" title="Otwórz profil">
                                            <User size={18} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : searchQuery.length >= 3 ? (
                        <div className="text-center text-sm text-gray-500 mt-10">Nie znaleziono takich osób.</div>
                    ) : (
                        <div className="text-center text-sm text-gray-500 mt-10 flex flex-col items-center gap-3">
                            <Search size={32} className="opacity-20" />
                            <span>Wpisz min. 3 znaki...</span>
                        </div>
                    )}
                </div>
            )}

            {view === 'list' && (
                <div>
                    {loading ? (
                        <div className="text-center text-gray-500 mt-10 animate-pulse">Wczytywanie historii rozmów...</div>
                    ) : recentChats.length === 0 ? (
                        <div className="text-center text-gray-500 mt-10 p-8 border border-gray-800 rounded-2xl border-dashed">
                            Nie masz jeszcze żadnych otwartych konwersacji. <br /> Kliknij lupę, aby kogoś znaleźć!
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {recentChats.map(user => (
                                <div key={user.id} onClick={() => openChat(user)} className="bg-surface border border-gray-800 p-4 rounded-xl flex items-center gap-4 cursor-pointer hover:border-gray-600 transition">
                                    <button type="button" onClick={(event) => user.type === 'group' ? event.stopPropagation() : openProfile(user.id, event)} className="w-12 h-12 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center font-bold text-lg relative overflow-hidden shrink-0">
                                        {user.type === 'group' ? (
                                            <Users size={24} className="text-secondary" />
                                        ) : user.avatar_url ? (
                                            <img src={ImageKitService.getOptimizedUrl(user.avatar_url)} alt="Av" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                                        ) : (
                                            getUserInitial(user.full_name)
                                        )}
                                        {user.type !== 'group' && <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-surface rounded-full z-10"></div>}
                                    </button>
                                    <div className="flex-1 text-left min-w-0">
                                        <div className="font-bold text-white leading-tight truncate">{user.full_name}</div>
                                        <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">{user.type === 'group' ? 'Pokój grupowy' : getRoleLabel(user.role || 'student')}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
            {/* Tworzenie Grupy - wyekstrahowany modal */}
            <CreateGroup
                isOpen={isCreatingGroup}
                onClose={() => setIsCreatingGroup(false)}
                onCreated={() => {
                    fetchRecentChats(myId)
                    toast.success('Grupa utworzona pomyślnie!')
                }}
                myId={myId}
            />
        </div>
    )
}
