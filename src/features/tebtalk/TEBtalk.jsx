import React, { useEffect, useState, useRef } from 'react'
import { Search, ArrowLeft, Send, MessageCircle } from 'lucide-react'
import { supabase } from '../../services/supabase'
import ReportButton from '../../components/ReportButton'

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
        // Ponieważ brak customowych widoków SQL - pobieramy wszystkich users z ktorymi pisalismy
        const { data: sentMsg } = await supabase.from('direct_messages').select('receiver_id').eq('sender_id', userId)
        const { data: recvMsg } = await supabase.from('direct_messages').select('sender_id').eq('receiver_id', userId)

        const ids = new Set([
            ...(sentMsg || []).map(m => m.receiver_id),
            ...(recvMsg || []).map(m => m.sender_id)
        ])

        if (ids.size > 0) {
            const { data } = await supabase.from('profiles').select('id, full_name, role').in('id', Array.from(ids))
            if (data) setRecentChats(data)
        }
        setLoading(false)
    }

    async function handleSearch(e) {
        setSearchQuery(e.target.value)
        if (e.target.value.length < 3) {
            setSearchResults([])
            return
        }
        const { data } = await supabase.from('profiles')
            .select('id, full_name, role')
            .ilike('full_name', `%${e.target.value}%`)
            .neq('id', myId)
            .limit(10)
        if (data) setSearchResults(data)
    }

    async function fetchMessages(partnerId) {
        const { data } = await supabase.from('direct_messages')
            .select('*')
            .or(`and(sender_id.eq.${myId},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${myId})`)
            .order('created_at', { ascending: true })
        if (data) {
            setMessages(data)
            scrollToBottom()
        }
    }

    async function sendMessage(e) {
        e.preventDefault()
        if (!newMessage.trim() || !activeChatUser) return

        const msgText = newMessage.trim()
        setNewMessage('')

        await supabase.from('direct_messages').insert([{
            sender_id: myId,
            receiver_id: activeChatUser.id,
            content: msgText
        }])
        scrollToBottom()
    }

    const openChat = (user) => {
        setActiveChatUser(user)
        setView('chat')
    }

    if (view === 'chat' && activeChatUser) {
        return (
            <div className="flex flex-col h-[calc(100vh-140px)] bg-background -mx-4 -mt-4 rounded-xl overflow-hidden border border-gray-800 relative z-10">
                {/* Header Czatu */}
                <div className="bg-[#1a1a1a] px-4 py-3 border-b border-gray-800 flex items-center gap-3 shrink-0">
                    <button onClick={() => setView('list')} className="p-2 -ml-2 text-gray-400 hover:text-white transition">
                        <ArrowLeft size={20} />
                    </button>
                    <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold">
                        {activeChatUser.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <div className="font-bold text-white leading-tight">{activeChatUser.full_name}</div>
                        <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{activeChatUser.role === 'student' ? 'Uczeń' : activeChatUser.role}</div>
                    </div>
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
                                        {msg.content}
                                    </div>
                                </div>
                            )
                        })
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Pole Wprowadzania */}
                <form onSubmit={sendMessage} className="p-3 bg-[#1a1a1a] border-t border-gray-800 flex gap-2 shrink-0 pb-6">
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
                    <button onClick={() => setView('search')} className="p-2.5 bg-surface border border-gray-700 rounded-full text-white cursor-pointer active:scale-95 transition">
                        <Search size={18} />
                    </button>
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
                                    <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold">
                                        {user.full_name.charAt(0).toUpperCase()}
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
                                    <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-lg relative">
                                        {user.full_name.charAt(0).toUpperCase()}
                                        {/* Green dot online indicator mock */}
                                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-surface rounded-full"></div>
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
        </div>
    )
}
