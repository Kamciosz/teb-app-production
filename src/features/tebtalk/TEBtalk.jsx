import React, { useEffect, useState, useRef } from 'react'
import { Search, ArrowLeft, Send, MessageCircle, Users, Plus, Settings, X, LogOut } from 'lucide-react'
import { supabase } from '../../services/supabase'
import ReportButton from '../../components/ReportButton'
import MediaUploader from '../../components/common/MediaUploader'
import { ImageKitService } from '../../services/imageKitService'
import { WordFilter } from '../../services/wordFilter'

export default function TEBtalk() {
    const [view, setView] = useState('list') // 'list', 'chat', 'search'
    const [recentChats, setRecentChats] = useState([])
    const [searchResults, setSearchResults] = useState([])
    const [searchQuery, setSearchQuery] = useState('')
    const [activeChatUser, setActiveChatUser] = useState(null)
    const [messages, setMessages] = useState([])
    const [newMessage, setNewMessage] = useState('')
    const [myId, setMyId] = useState(null)
    const [loading, setLoading] = useState(true)
    const [isCreatingGroup, setIsCreatingGroup] = useState(false)
    const [groupName, setGroupName] = useState('')
    const [isGroupSettingsOpen, setIsGroupSettingsOpen] = useState(false)

    const messagesEndRef = useRef(null)

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                setMyId(session.user.id)
                fetchRecentChats(session.user.id)
            }
        })
    }, [])

    useEffect(() => {
        if (view === 'chat' && activeChatUser && myId) {
            fetchMessages(activeChatUser.id)
            const channel = supabase.channel('direct_messages')
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, payload => {
                    const msg = payload.new
                    if ((msg.sender_id === myId && msg.receiver_id === activeChatUser.id) ||
                        (msg.sender_id === activeChatUser.id && msg.receiver_id === myId)) {
                        setMessages(prev => [...prev, msg])
                        scrollToBottom()
                    }
                })
                .subscribe()

            return () => { supabase.removeChannel(channel) }
        }
    }, [view, activeChatUser, myId])

    const scrollToBottom = () => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }, 100)
    }

    async function fetchRecentChats(userId) {
        // Pobieramy prywatne wiadomości
        const { data: sentMsg } = await supabase.from('direct_messages').select('receiver_id').eq('sender_id', userId)
        const { data: recvMsg } = await supabase.from('direct_messages').select('sender_id').eq('receiver_id', userId)

        const userIds = new Set([
            ...(sentMsg || []).map(m => m.receiver_id).filter(id => id && id.length > 20), // Proste sprawdzenie UUID
            ...(recvMsg || []).map(m => m.sender_id).filter(id => id && id.length > 20)
        ])

        let chats = []
        if (userIds.size > 0) {
            const { data: users } = await supabase.from('profiles').select('id, full_name, role, avatar_url').in('id', Array.from(userIds))
            if (users) chats = users.map(u => ({ ...u, type: 'private' }))
        }

        // Pobieramy wiadomości grupowe (gdzie receiver_id zaczyna się od 'group_')
        const { data: groupMsg } = await supabase.from('direct_messages').select('receiver_id').ilike('receiver_id', 'group_%')
        const groupIds = new Set((groupMsg || []).map(m => m.receiver_id))

        if (groupIds.size > 0) {
            const groups = Array.from(groupIds).map(id => ({
                id,
                full_name: id.replace('group_', '').split('_')[0] || 'Grupa',
                type: 'group',
                role: 'room'
            }))
            chats = [...chats, ...groups]
        }

        setRecentChats(chats)
        setLoading(false)
    }

    async function handleSearch(e) {
        setSearchQuery(e.target.value)
        if (e.target.value.length < 3) {
            setSearchResults([])
            return
        }
        // Pracuj mądrze: nie pokazujemy kont prywatnych w wyszukiwarce publicznej
        const { data } = await supabase.from('profiles')
            .select('id, full_name, role, avatar_url, is_private')
            .ilike('full_name', `%${e.target.value}%`)
            .eq('is_private', false)
            .neq('id', myId)
            .limit(10)
        if (data) setSearchResults(data)
    }

    async function fetchMessages(partnerId) {
        setLoading(true)
        const { data, error } = await supabase.from('direct_messages')
            .select('*')
            .or(`and(sender_id.eq.${myId},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${myId})`)
            .order('created_at', { ascending: true })

        if (error) {
            console.error("Błąd pobierania wiadomości:", error)
        } else if (data) {
            setMessages(data)
            scrollToBottom()
        }
        setLoading(false)
    }

    async function sendMessage(e) {
        e.preventDefault()
        if (!newMessage.trim() || !activeChatUser) return

        const msgText = newMessage.trim()
        const tempId = Math.random().toString(36).substring(7)

        // Optimistic UI - dodaj lokalnie natychmiast
        const optimisticMsg = {
            id: tempId,
            sender_id: myId,
            receiver_id: activeChatUser.id,
            content: WordFilter.clean(msgText),
            created_at: new Date().toISOString(),
            status: 'sending'
        }

        setMessages(prev => [...prev, optimisticMsg])
        setNewMessage('')
        scrollToBottom()

        const { data, error } = await supabase.from('direct_messages').insert([{
            sender_id: myId,
            receiver_id: activeChatUser.id,
            content: WordFilter.clean(msgText)
        }]).select().single()

        if (error) {
            console.error("Błąd wysyłania:", error)
            // Oznacz jako błąd lub usuń z listy
            setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'error' } : m))
        } else if (data) {
            // Zamień tymczasową wiadomość na tę z bazy
            setMessages(prev => prev.map(m => m.id === tempId ? data : m))
        }
    }

    async function sendImage(url) {
        if (!activeChatUser) return

        const { data, error } = await supabase.from('direct_messages').insert([{
            sender_id: myId,
            receiver_id: activeChatUser.id,
            content: url // Link z ImageKit
        }]).select().single()

        if (error) {
            console.error("Błąd wysyłania zdjęcia:", error)
        }
    }

    const openChat = (target) => {
        setActiveChatUser(target)
        setView('chat')
    }

    async function createGroup() {
        if (!groupName.trim()) return
        const groupId = `group_${groupName.trim()}_${Math.random().toString(36).substring(7)}`

        // Wyślij pierwszą wiadomość powitalną, aby grupa się pojawiła w liście
        await supabase.from('direct_messages').insert([{
            sender_id: myId,
            receiver_id: groupId,
            content: `Witajcie w grupie: ${groupName.trim()}!`
        }])

        setIsCreatingGroup(false)
        setGroupName('')
        fetchRecentChats(myId)
    }

    if (view === 'chat' && activeChatUser) {
        return (
            <div className="flex flex-col h-[calc(100vh-140px)] bg-background -mx-4 -mt-4 rounded-xl overflow-hidden border border-gray-800 relative z-10">
                {/* Header Czatu */}
                <div className="bg-[#1a1a1a] px-4 py-3 border-b border-gray-800 flex items-center gap-3 shrink-0">
                    <button onClick={() => setView('list')} className="p-2 -ml-2 text-gray-400 hover:text-white transition">
                        <ArrowLeft size={20} />
                    </button>
                    <div className="w-10 h-10 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center font-bold overflow-hidden shadow-sm">
                        {activeChatUser.type === 'group' ? (
                            <Users size={20} className="text-secondary" />
                        ) : activeChatUser.avatar_url ? (
                            <img src={ImageKitService.getOptimizedUrl(activeChatUser.avatar_url, 100)} alt="Av" className="w-full h-full object-cover" />
                        ) : (
                            activeChatUser.full_name.charAt(0).toUpperCase()
                        )}
                    </div>
                    <div className="flex-1">
                        <div className="font-bold text-white leading-tight flex items-center gap-1.5">
                            {activeChatUser.full_name}
                            {activeChatUser.role === 'admin' && <span className="bg-red-500 w-2 h-2 rounded-full shadow-[0_0_5px_red]"></span>}
                        </div>
                        <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                            {activeChatUser.type === 'group' ? 'Pokój Grupowy' : (activeChatUser.role === 'student' ? 'Uczeń' : activeChatUser.role)}
                        </div>
                    </div>
                    {activeChatUser.type === 'group' && (
                        <button onClick={() => setIsGroupSettingsOpen(true)} className="p-2 text-gray-500 hover:text-white">
                            <Settings size={20} />
                        </button>
                    )}
                </div>

                {/* Pole Wiadomości */}
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 scrollbar-none">
                    {messages.length === 0 ? (
                        <div className="m-auto text-center text-gray-500 flex flex-col items-center gap-2">
                            <MessageCircle size={32} className="opacity-50" />
                            <p className="text-sm">Brak wiadomości.<br />Napisz jako pierwszy!</p>
                        </div>
                    ) : (
                        messages.map(msg => {
                            const isMe = msg.sender_id === myId
                            return (
                                <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} items-center gap-2 group`}>
                                    {!isMe && (
                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                            <ReportButton entityType="user_message" entityId={msg.id} subtle={true} />
                                        </div>
                                    )}
                                    <div className={`max-w-[75%] p-3 rounded-2xl text-sm ${isMe ? 'bg-primary text-white rounded-tr-sm' : 'bg-surface border border-gray-800 text-gray-200 rounded-tl-sm'}`}>
                                        {msg.content.startsWith('http') ? (
                                            <img
                                                src={ImageKitService.getOptimizedUrl(msg.content, 400)}
                                                alt="Przesłane zdjęcie"
                                                className="rounded-lg cursor-pointer hover:opacity-90 transition"
                                                onClick={() => window.open(msg.content, '_blank')}
                                                loading="lazy"
                                            />
                                        ) : (
                                            msg.content
                                        )}
                                    </div>
                                </div>
                            )
                        })
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Pole Wprowadzania */}
                <div className="p-3 bg-[#1a1a1a] border-t border-gray-800 flex flex-col gap-2 shrink-0 pb-6">
                    <form onSubmit={sendMessage} className="flex gap-2">
                        <MediaUploader module="tebtalk" onUploadSuccess={sendImage} />
                        <input
                            type="text"
                            placeholder="Napisz wiadomość..."
                            value={newMessage}
                            onChange={e => setNewMessage(e.target.value)}
                            className="flex-1 bg-background border border-gray-700 rounded-full px-4 text-white outline-none focus:border-primary text-sm"
                        />
                        <button type="submit" disabled={!newMessage.trim()} className="bg-primary hover:bg-primary-dark disabled:opacity-50 text-white w-10 h-10 rounded-full flex items-center justify-center transition">
                            <Send size={18} className="translate-x-[1px]" />
                        </button>
                    </form>
                </div>

                {/* Modal Ustawień Grupy */}
                {isGroupSettingsOpen && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
                        <div className="bg-surface border border-gray-700 w-full max-w-sm rounded-2xl p-6 shadow-2xl relative">
                            <button onClick={() => setIsGroupSettingsOpen(false)} className="absolute top-4 right-4 text-gray-500"><X size={20} /></button>
                            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2"><Settings className="text-secondary" /> Ustawienia Grupy</h3>
                            <div className="space-y-4 text-sm text-gray-400">
                                <p>To jest tymczasowy pokój. Możesz dodać do 5 osób (limit testowy).</p>
                                <div className="p-3 bg-background border border-red-900/30 rounded-lg text-red-400 text-xs flex items-center gap-2">
                                    <LogOut size={14} />
                                    <span>Opuść grupę (Wkrótce)</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        )
    }

    return (
        <div className="pb-10">
            <div className="flex justify-between items-center mb-6 px-2">
                <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight">TEBtalk</h2>
                    <div className="text-xs text-gray-500 font-bold">Prywatny komunikator</div>
                </div>
                {view === 'list' && (
                    <div className="flex gap-2">
                        <button onClick={() => setIsCreatingGroup(true)} className="p-2.5 bg-surface border border-gray-700 rounded-full text-secondary cursor-pointer active:scale-95 transition">
                            <Users size={18} />
                        </button>
                        <button onClick={() => setView('search')} className="p-2.5 bg-surface border border-gray-700 rounded-full text-white cursor-pointer active:scale-95 transition">
                            <Search size={18} />
                        </button>
                    </div>
                )}
            </div>

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
                            className="flex-1 p-3 bg-surface border border-gray-700 rounded-xl text-white outline-none focus:border-primary"
                        />
                    </div>
                    {searchResults.length > 0 ? (
                        <div className="flex flex-col gap-2">
                            {searchResults.map(user => (
                                <div key={user.id} onClick={() => openChat(user)} className="bg-surface border border-gray-800 p-3 rounded-xl flex items-center gap-3 cursor-pointer hover:border-primary transition">
                                    <div className="w-10 h-10 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center font-bold overflow-hidden">
                                        {user.avatar_url ? (
                                            <img src={ImageKitService.getOptimizedUrl(user.avatar_url, 100)} alt="Av" className="w-full h-full object-cover" />
                                        ) : (
                                            user.full_name.charAt(0).toUpperCase()
                                        )}
                                    </div>
                                    <div className="font-bold text-white text-sm">{user.full_name}</div>
                                </div>
                            ))}
                        </div>
                    ) : searchQuery.length >= 3 ? (
                        <div className="text-center text-sm text-gray-500 mt-4">Nie znaleziono takich osób.</div>
                    ) : (
                        <div className="text-center text-sm text-gray-500 mt-4">Wpisz min. 3 znaki...</div>
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
                                    <div className="w-12 h-12 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center font-bold text-lg relative overflow-hidden">
                                        {user.type === 'group' ? (
                                            <Users size={24} className="text-secondary" />
                                        ) : user.avatar_url ? (
                                            <img src={ImageKitService.getOptimizedUrl(user.avatar_url, 120)} alt="Av" className="w-full h-full object-cover" />
                                        ) : (
                                            user.full_name.charAt(0).toUpperCase()
                                        )}
                                        {user.type !== 'group' && <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-surface rounded-full z-10"></div>}
                                    </div>
                                    <div className="flex-1">
                                        <div className="font-bold text-white leading-tight">{user.full_name}</div>
                                        <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">Kliknij, aby otworzyć czat...</div>
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
                                    onChange={e => setGroupName(e.target.value)}
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
