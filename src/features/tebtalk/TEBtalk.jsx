import React, { useEffect, useState, useRef } from 'react'
import { Search, ArrowLeft, Send, MessageCircle, Users, Plus, Settings, X, LogOut, Trash2, Paperclip, Smile, User, UserX } from 'lucide-react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../services/supabase'
import ReportButton from '../../components/ReportButton'
import MediaUploader from '../../components/common/MediaUploader'
import { ImageKitService } from '../../services/imageKitService'
import { WordFilter } from '../../services/wordFilter'
import { useToast } from '../../context/ToastContext'
import { getRoleLabel, getUserInitial } from '../profile/profileMeta'
import { sanitizeImageUrl, sanitizePlainText } from '../../utils/safeContent'

export default function TEBtalk() {
    const MAX_CHAT_MESSAGE = 2000
    const MAX_CHAT_GROUP_NAME = 120
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
    const [isCreatingGroup, setIsCreatingGroup] = useState(false)
    const [groupName, setGroupName] = useState('')
    const [isGroupSettingsOpen, setIsGroupSettingsOpen] = useState(false)
    const [friends, setFriends] = useState([])
    const [groupMembers, setGroupMembers] = useState([])
    const [isAddingMember, setIsAddingMember] = useState(false)
    const [myBlockedIds, setMyBlockedIds] = useState([])
    const [blockedByIds, setBlockedByIds] = useState([])
    const [chatError, setChatError] = useState('')
    
    const toast = useToast()
    const messagesEndRef = useRef(null)
    const chatMessagesCacheRef = useRef(new Map())
    const location = useLocation()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const routeChat = location.state?.openChatWith
    const routeChatId = searchParams.get('chat') || routeChat?.id || null

    const getMessagesCacheKey = (userId, chatId, isGroup) => `${userId}:${isGroup ? 'group' : 'private'}:${chatId}`

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

    const normalizePrivateTarget = (target) => {
        if (!target?.id) return null

        return {
            id: target.id,
            full_name: sanitizePlainText(target.full_name, { maxLength: 80 }) || 'Użytkownik',
            role: target.role || 'student',
            avatar_url: sanitizeImageUrl(target.avatar_url),
            dm_friends_only: Boolean(target.dm_friends_only),
            type: 'private'
        }
    }

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

                const { data, error } = await supabase
                    .from('profiles')
                    .select('id, full_name, role, avatar_url, dm_friends_only')
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
                            setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
                            scrollToBottom()
                        }
                    } else {
                        if ((msg.sender_id === myId && msg.receiver_id === activeChatUser.id) ||
                            (msg.sender_id === activeChatUser.id && msg.receiver_id === myId)) {
                            setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
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

    function isBlockedRelationship(userId) {
        return myBlockedIds.includes(userId) || blockedByIds.includes(userId)
    }

    function isAcceptedFriend(userId) {
        return friends.some(friend => friend.id === userId)
    }

    async function fetchBlocks(userId) {
        const [{ data: myBlocks }, { data: blockedMe }] = await Promise.all([
            supabase.from('user_blocks').select('blocked_user_id').eq('blocking_user_id', userId),
            supabase.from('user_blocks').select('blocking_user_id').eq('blocked_user_id', userId)
        ])

        const blocked = (myBlocks || []).map(row => row.blocked_user_id)
        const blockedBy = (blockedMe || []).map(row => row.blocking_user_id)

        setMyBlockedIds(blocked)
        setBlockedByIds(blockedBy)

        return { blocked, blockedBy }
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
        const { data } = await supabase
            .from('friends')
            .select(`
                friend_id,
                profiles!friends_friend_id_fkey (id, full_name, avatar_url, role, dm_friends_only)
            `)
            .eq('user_id', userId)
            .eq('status', 'accepted')

        if (data) {
            const normalizedFriends =
                data
                    .map(f => f.profiles)
                    .filter(friend => friend && !blocked.has(friend.id) && !blockedBy.has(friend.id))
            setFriends(normalizedFriends)
            return normalizedFriends
        }

        const { data: fallbackFriends } = await supabase
            .from('friends')
            .select('friend_id')
            .eq('user_id', userId)
            .eq('status', 'accepted')

        const friendIds = (fallbackFriends || []).map(friend => friend.friend_id).filter(Boolean)
        if (friendIds.length === 0) {
            setFriends([])
            return []
        }

        const { data: fallbackProfiles } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url, role')
            .in('id', friendIds)

        const normalizedFallbackFriends =
            (fallbackProfiles || [])
                .map(friend => ({ ...friend, dm_friends_only: false }))
                .filter(friend => friend && !blocked.has(friend.id) && !blockedBy.has(friend.id))
        setFriends(normalizedFallbackFriends)
        return normalizedFallbackFriends
    }

    async function fetchGroupMembers(groupId) {
        const { data, error } = await supabase
            .from('chat_group_members')
            .select(`
                user_id,
                role,
                nickname,
                profiles (full_name, avatar_url)
            `)
            .eq('group_id', groupId)

        if (error) {
            console.error('Błąd pobierania członków grupy:', error)
            setGroupMembers([])
            return []
        }

        const normalizedMembers = (data || []).map(member => ({
            ...member,
            nickname: sanitizePlainText(member.nickname, { maxLength: 80 }),
            profiles: {
                full_name: sanitizePlainText(member.profiles?.full_name, { maxLength: 80 }) || 'Użytkownik',
                avatar_url: sanitizeImageUrl(member.profiles?.avatar_url)
            }
        }))

        setGroupMembers(normalizedMembers)
        return normalizedMembers
    }

    async function fetchRecentChats(userId, blockState = null) {
        const blocked = new Set(blockState?.blocked || myBlockedIds)
        const blockedBy = new Set(blockState?.blockedBy || blockedByIds)
        // 1. Prywatne wiadomości
        const { data: sentMsg } = await supabase.from('direct_messages').select('receiver_id').eq('sender_id', userId)
        const { data: recvMsg } = await supabase.from('direct_messages').select('sender_id').eq('receiver_id', userId)

        const userIds = new Set([
            ...(sentMsg || []).map(m => m.receiver_id).filter(id => id && id.length > 20),
            ...(recvMsg || []).map(m => m.sender_id).filter(id => id && id.length > 20)
        ])

        let chats = []
        if (userIds.size > 0) {
            const primaryUsers = await supabase.from('profiles').select('id, full_name, role, avatar_url, dm_friends_only').in('id', Array.from(userIds))
            const users = primaryUsers.data || (await supabase.from('profiles').select('id, full_name, role, avatar_url').in('id', Array.from(userIds))).data?.map(user => ({ ...user, dm_friends_only: false }))

            if (users) {
                chats = users
                    .filter(u => !blocked.has(u.id) && !blockedBy.has(u.id))
                    .map(u => ({ ...u, type: 'private' }))
            }
        }

        // 2. Grupy w których jestem
        const { data: myGroups } = await supabase
            .from('chat_group_members')
            .select('group_id, chat_groups(id, name, image_url)')
            .eq('user_id', userId)
        
        if (myGroups) {
            const groups = myGroups.map(g => ({
                id: g.chat_groups.id,
                full_name: g.chat_groups.name,
                avatar_url: g.chat_groups.image_url,
                type: 'group',
                role: 'room'
            }))
            chats = [...chats, ...groups]
        }

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
        const { data } = await supabase.from('profiles')
            .select('id, full_name, role, avatar_url, is_private, dm_friends_only')
            .ilike('full_name', `%${nextQuery}%`)
            .eq('is_private', false)
            .neq('id', myId)
            .limit(10)

        if (data) {
            setSearchResults(data.filter(user => !isBlockedRelationship(user.id)))
            return
        }

        const { data: fallbackData } = await supabase.from('profiles')
            .select('id, full_name, role, avatar_url, is_private')
            .ilike('full_name', `%${nextQuery}%`)
            .eq('is_private', false)
            .neq('id', myId)
            .limit(10)

        if (fallbackData) {
            setSearchResults(fallbackData.map(user => ({ ...user, dm_friends_only: false })).filter(user => !isBlockedRelationship(user.id)))
        }
    }

    async function toggleBlock(userId) {
        const isBlocked = myBlockedIds.includes(userId)

        if (isBlocked) {
            const { error } = await supabase
                .from('user_blocks')
                .delete()
                .eq('blocking_user_id', myId)
                .eq('blocked_user_id', userId)

            if (error) {
                console.error(error)
                toast.error('Nie udało się odblokować użytkownika.')
                return
            }

            toast.success('Użytkownik został odblokowany.')
        } else {
            if (!window.confirm('Zablokować tego użytkownika? Zablokowane osoby nie wyślą Ci prywatnej wiadomości.')) return

            const { error } = await supabase
                .from('user_blocks')
                .insert([{ blocking_user_id: myId, blocked_user_id: userId }])

            if (error) {
                console.error(error)
                toast.error('Nie udało się zablokować użytkownika.')
                return
            }

            if (activeChatUser?.type === 'private' && activeChatUser.id === userId) {
                setActiveChatUser(null)
                setMessages([])
                setView('list')
            }

            toast.success('Użytkownik został zablokowany.')
        }

        await loadCommunicationState(myId)
        setSearchResults(prev => prev.filter(user => !isBlockedRelationship(user.id) && user.id !== userId))
    }

    async function fetchMessages(partnerId, isGroup = false, options = {}) {
        const { hadCachedMessages = false } = options
        let query = supabase.from(isGroup ? 'chat_group_messages' : 'direct_messages').select('*')
        
        if (isGroup) {
            query = query.eq('group_id', partnerId)
        } else {
            query = query.or(`and(sender_id.eq.${myId},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${myId})`)
        }

        const { data, error } = await query.order('created_at', { ascending: true })

        if (error) {
            console.error("Błąd pobierania wiadomości:", error)
            if (!hadCachedMessages) {
                setMessages([])
                setChatError('Nie udało się pobrać wiadomości.')
            } else {
                setChatError('Nie udało się odświeżyć rozmowy. Wyświetlam ostatnio zapisane wiadomości.')
            }
        } else if (data) {
            setMessages(data)
            persistMessagesCache(partnerId, isGroup, data)
            scrollToBottom()
        }
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
        const isGroup = activeChatUser.type === 'group'
        const tableName = isGroup ? 'chat_group_messages' : 'direct_messages'
        const tempId = Math.random().toString(36).substring(7)

        const optimisticMsg = {
            id: tempId,
            sender_id: myId,
            [isGroup ? 'group_id' : 'receiver_id']: activeChatUser.id,
            content: WordFilter.clean(msgText),
            created_at: new Date().toISOString(),
            status: 'sending'
        }

        setMessages(prev => [...prev, optimisticMsg])
        setNewMessage('')
        scrollToBottom()

        const payload = {
            sender_id: myId,
            content: WordFilter.clean(msgText)
        }
        if (isGroup) payload.group_id = activeChatUser.id
        else payload.receiver_id = activeChatUser.id

        const { data, error } = await supabase.from(tableName).insert([payload]).select().single()

        if (error) {
            console.error("Błąd wysyłania:", error)
            const isBlockedOrRestricted = error.code === '42501' || /row-level security|permission denied/i.test(error.message || '')
            toast.error(isBlockedOrRestricted ? 'Ta osoba nie przyjmuje od Ciebie wiadomości lub istnieje blokada.' : 'Nie udało się wysłać wiadomości.')
            setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'error' } : m))
        } else if (data) {
            // Zastąp optimistic msg realnym — uwzględnia przypadek, gdy Realtime
            // dodał już tę wiadomość przed odpowiedzią insertu (race condition).
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

        const isGroup = activeChatUser.type === 'group'
        const tableName = isGroup ? 'chat_group_messages' : 'direct_messages'

        const payload = {
            sender_id: myId,
            content: safeUrl
        }
        if (isGroup) payload.group_id = activeChatUser.id
        else payload.receiver_id = activeChatUser.id

        const { error } = await supabase.from(tableName).insert([payload])
        if (error) {
            console.error("Błąd wysyłania zdjęcia:", error)
            const isBlockedOrRestricted = error.code === '42501' || /row-level security|permission denied/i.test(error.message || '')
            toast.error(isBlockedOrRestricted ? 'Nie możesz wysłać zdjęcia do tego użytkownika.' : 'Błąd wysyłania zdjęcia.')
        }
    }

    async function deleteMessage(messageId) {
        if (!confirm('Czy na pewno chcesz usunąć tę wiadomość?')) return
        const isGroup = activeChatUser.type === 'group'
        const tableName = isGroup ? 'chat_group_messages' : 'direct_messages'

        const { error } = await supabase
            .from(tableName)
            .update({ content: 'Wiadomość usunięta', is_deleted: true })
            .eq('id', messageId)
            .eq('sender_id', myId)

        if (error) {
            console.error("Błąd usuwania wiadomości:", error)
            toast.error("Nie udało się usunąć wiadomości.")
        } else {
            setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: 'Wiadomość usunięta', is_deleted: true } : m))
        }
    }

    async function createGroup() {
        const cleanGroupName = sanitizePlainText(groupName, { maxLength: MAX_CHAT_GROUP_NAME })
        if (!cleanGroupName) return
        if (cleanGroupName.length > MAX_CHAT_GROUP_NAME) {
            toast.error(`Nazwa grupy jest za długa (max ${MAX_CHAT_GROUP_NAME} znaków).`)
            return
        }
        
        // 1. Stwórz grupę
        const { data: group, error: groupErr } = await supabase
            .from('chat_groups')
            .insert([{ name: cleanGroupName, creator_id: myId }])
            .select()
            .single()
        
        if (groupErr || !group) {
            console.error(groupErr || 'No group data returned')
            toast.error("Błąd tworzenia grupy.")
            return
        }

        // 2. Dodaj siebie jako admina
        const { error: memberErr } = await supabase
            .from('chat_group_members')
            .insert([{ group_id: group.id, user_id: myId, role: 'admin' }])

        if (memberErr) {
            console.error("Błąd dodawania admina:", memberErr)
            // Nie przerywamy, bo grupa powstała, ale RLS mógł zablokować insert
            // Jednak po naprawie SQL (Tworca dodaje siebie) powinno działać.
        }

        // 3. Wyślij powitanie
        await supabase.from('chat_group_messages').insert([{
            sender_id: myId,
            group_id: group.id,
            content: `Grupa ${cleanGroupName} została utworzona!`
        }])

        setIsCreatingGroup(false)
        setGroupName('')
        fetchRecentChats(myId)
        toast.success("Grupa utworzona pomyślnie!")
    }

    async function addMember(userId) {
        const { error } = await supabase
            .from('chat_group_members')
            .insert([{ group_id: activeChatUser.id, user_id: userId, role: 'member' }])
        
        if (error) {
            console.error(error)
            toast.error("Nie udało się dodać użytkownika.")
        } else {
            fetchGroupMembers(activeChatUser.id)
            setIsAddingMember(false)
            toast.success("Użytkownik dodany!")
        }
    }

    async function sendFriendRequest(friendId) {
        if (isBlockedRelationship(friendId)) {
            toast.error('Relacja jest zablokowana. Najpierw odblokuj użytkownika.')
            return
        }

        const { error } = await supabase
            .from('friends')
            .insert([{ user_id: myId, friend_id: friendId, status: 'pending' }])
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
            if (normalizedTarget.dm_friends_only && !isAcceptedFriend(normalizedTarget.id)) {
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
        setIsAddingMember(false)
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
            <div className="flex flex-col h-[calc(100vh-140px)] bg-background -mx-4 -mt-4 rounded-xl overflow-hidden border border-gray-800 relative z-10">
                {/* Header Czatu */}
                <div className="bg-[#1a1a1a] px-4 py-3 border-b border-gray-800 flex items-center gap-3 shrink-0">
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
                    ) : (
                        messages.map(msg => {
                            const isMe = msg.sender_id === myId
                            const sender = activeChatUser.type === 'group' 
                                ? groupMembers.find(m => m.user_id === msg.sender_id)
                                : null
                            const senderName = sanitizePlainText(sender?.nickname || sender?.profiles?.full_name, { maxLength: 80 }) || 'Użytkownik'
                            const safeMessageImageUrl = sanitizeImageUrl(msg.content)
                            
                            return (
                                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} mb-2 group relative`}>
                                    {!isMe && activeChatUser.type === 'group' && sender && (
                                        <div className="text-[9px] font-bold text-gray-500 mb-0.5 ml-1 uppercase">
                                            {senderName}
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2">
                                        {isMe && !msg.is_deleted && (
                                            <button 
                                                onClick={() => deleteMessage(msg.id)}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-500 hover:text-red-500"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                        {!isMe && (
                                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                                <ReportButton entityType={activeChatUser.type === 'group' ? "group_message" : "direct_message"} entityId={msg.id} subtle={true} />
                                            </div>
                                        )}
                                        <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${msg.is_deleted ? 'bg-gray-800/30 text-gray-600 italic border border-gray-800' : isMe ? 'bg-primary text-white rounded-tr-sm' : 'bg-surface border border-gray-800 text-gray-200 rounded-tl-sm'}`}>
                                            {msg.is_deleted ? 'Wiadomość usunięta' : safeMessageImageUrl ? (
                                                <img
                                                    src={ImageKitService.getOptimizedUrl(safeMessageImageUrl, 400)}
                                                    alt="Przesłane zdjęcie"
                                                    className="rounded-lg cursor-pointer hover:opacity-90 transition"
                                                    onClick={() => window.open(safeMessageImageUrl, '_blank', 'noopener,noreferrer')}
                                                    loading="lazy"
                                                    decoding="async"
                                                />
                                            ) : (
                                                sanitizePlainText(msg.content, { maxLength: MAX_CHAT_MESSAGE, preserveLineBreaks: true })
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )
                        })
                    )}
                    <div ref={messagesEndRef} />
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

                {/* Modal Ustawień Grupy */}
                {isGroupSettingsOpen && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
                        <div className="bg-surface border border-gray-700 w-full max-w-sm rounded-2xl p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
                            <button onClick={() => setIsGroupSettingsOpen(false)} className="absolute top-4 right-4 text-gray-500 hover:text-white"><X size={20} /></button>
                            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2"><Settings className="text-secondary" /> Ustawienia Grupy</h3>
                            
                            <div className="space-y-6">
                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-[10px] text-gray-500 font-bold uppercase">Członkowie ({groupMembers.length})</label>
                                        <button 
                                            onClick={() => setIsAddingMember(true)}
                                            className="text-xs text-secondary font-bold flex items-center gap-1 hover:underline"
                                        >
                                            <Plus size={12} /> Dodaj znajomego
                                        </button>
                                    </div>
                                    <div className="max-h-48 overflow-y-auto space-y-2 pr-1 scrollbar-none">
                                        {groupMembers.map(m => (
                                            <div key={m.user_id} className="flex items-center gap-3 p-2 bg-background border border-gray-800 rounded-xl">
                                                <div className="w-8 h-8 rounded-full bg-gray-800 overflow-hidden flex items-center justify-center font-bold text-xs">
                                                    {m.profiles.avatar_url ? (
                                                        <img src={ImageKitService.getOptimizedUrl(m.profiles.avatar_url, 80)} alt="Av" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                                                    ) : m.profiles.full_name.charAt(0)}
                                                </div>
                                                <div className="flex-1">
                                                    <div className="text-sm font-bold text-white leading-none">{m.nickname || m.profiles.full_name}</div>
                                                    <div className="text-[10px] text-gray-500 uppercase">{m.role === 'admin' ? 'Administrator' : 'Uczestnik'}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-gray-800">
                                    <button 
                                        className="w-full py-3 bg-red-900/20 text-red-500 border border-red-900/30 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-red-900/40 transition"
                                        onClick={() => alert("Wkrótce: Opuszczanie grupy")}
                                    >
                                        <LogOut size={16} /> Opuść grupę
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Sub-modal Dodawania Członków */}
                        {isAddingMember && (
                            <div className="absolute inset-0 bg-black/90 backdrop-blur-md z-[120] flex items-center justify-center p-4">
                                <div className="bg-surface border border-gray-700 w-full max-w-xs rounded-2xl p-6 shadow-2xl relative">
                                    <button onClick={() => setIsAddingMember(false)} className="absolute top-4 right-4 text-gray-500"><X size={20} /></button>
                                    <h4 className="text-lg font-bold text-white mb-4">Dodaj do grupy</h4>
                                    <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-none">
                                        {friends.length === 0 ? (
                                            <p className="text-center text-gray-500 text-sm py-4">Nie masz jeszcze zaakceptowanych znajomych.</p>
                                        ) : (
                                            friends.filter(f => !groupMembers.find(m => m.user_id === f.id)).map(friend => (
                                                <div 
                                                    key={friend.id} 
                                                    onClick={() => addMember(friend.id)}
                                                    className="flex items-center gap-3 p-3 bg-background border border-gray-800 rounded-xl cursor-pointer hover:border-secondary transition"
                                                >
                                                    <div className="w-8 h-8 rounded-full bg-gray-800 overflow-hidden flex items-center justify-center font-bold text-xs">
                                                        {friend.avatar_url ? <img src={ImageKitService.getOptimizedUrl(friend.avatar_url, 80)} alt="Av" className="w-full h-full object-cover" loading="lazy" decoding="async" /> : friend.full_name.charAt(0)}
                                                    </div>
                                                    <div className="text-sm font-bold text-white">{friend.full_name}</div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        )
    }

    return (
        <div className="pb-10">
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
            {/* Modal Tworzenia Grupy */}
            {isCreatingGroup && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[100] flex items-center justify-center p-4">
                    <div className="bg-surface border border-gray-700 w-full max-w-sm rounded-3xl p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
                        <button onClick={() => setIsCreatingGroup(false)} className="absolute top-4 right-4 text-gray-500 hover:text-white"><X size={20} /></button>
                        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2 tracking-tight">Nowa Grupa</h3>

                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] text-gray-500 font-bold uppercase ml-1">Nazwa Grupy</label>
                                <input
                                    type="text"
                                    placeholder="np. Giełda 4A..."
                                    value={groupName}
                                    onChange={e => setGroupName(e.target.value.slice(0, MAX_CHAT_GROUP_NAME))}
                                    maxLength={MAX_CHAT_GROUP_NAME}
                                    className="w-full mt-1 p-3 bg-background border border-gray-800 rounded-xl text-white outline-none focus:border-secondary transition"
                                />
                            </div>
                            <button
                                onClick={createGroup}
                                disabled={!groupName.trim()}
                                className="w-full py-3 bg-secondary hover:bg-secondary/80 disabled:opacity-50 text-black font-bold rounded-xl flex items-center justify-center gap-2 transition"
                            >
                                <Plus size={18} /> Stwórz Pokój
                            </button>
                        </div>

                        <p className="text-[10px] text-gray-600 mt-4 text-center">
                            Wiadomości w grupach są publiczne dla każdego, <br /> kto zna identyfikator pokoju.
                        </p>
                    </div>
                </div>
            )}
        </div>
    )
}
