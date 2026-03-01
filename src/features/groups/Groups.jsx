import React, { useEffect, useState, useRef } from 'react'
import { Users, Plus, Hash, ArrowLeft, Send, Search } from 'lucide-react'
import { supabase } from '../../services/supabase'
import ReportButton from '../../components/ReportButton'

export default function Groups() {
    const [view, setView] = useState('list') // 'list', 'new', 'chat'
    const [groups, setGroups] = useState([])
    const [userGroups, setUserGroups] = useState([]) // ID grup do których należę
    const [activeGroup, setActiveGroup] = useState(null)
    const [messages, setMessages] = useState([])
    const [newMessage, setNewMessage] = useState('')
    const [myId, setMyId] = useState(null)
    const [loading, setLoading] = useState(true)
    const [membersCount, setMembersCount] = useState(0)

    // Formularz nowej grupy
    const [newGroupName, setNewGroupName] = useState('')
    const [newGroupDesc, setNewGroupDesc] = useState('')

    const messagesEndRef = useRef(null)

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                setMyId(session.user.id)
                fetchGroupsAndMemberships(session.user.id)
            }
        })
    }, [])

    useEffect(() => {
        if (view === 'chat' && activeGroup && myId) {
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
                                    setMessages(current => [...current, { ...msg, profiles: data }])
                                    scrollToBottom()
                                })
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
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }, 100)
    }

    async function fetchGroupsAndMemberships(userId) {
        // Obie tabele są publicznie widoczne pod RLS uwarunkowanym w schema_v4_social
        const { data: allGroups } = await supabase.from('groups').select('*').order('created_at', { ascending: false })
        const { data: myMemberships } = await supabase.from('group_members').select('group_id').eq('user_id', userId)

        if (allGroups) setGroups(allGroups)
        if (myMemberships) setUserGroups(myMemberships.map(m => m.group_id))
        setLoading(false)
    }

    async function fetchMembersCount(groupId) {
        const { count } = await supabase.from('group_members').select('*', { count: 'exact', head: true }).eq('group_id', groupId)
        setMembersCount(count || 0)
    }

    async function handleCreateGroup(e) {
        e.preventDefault()
        if (!newGroupName) return

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
            setUserGroups(prev => prev.filter(id => id !== groupId))
            setView('list')
        } else {
            await supabase.from('group_members').insert([{ user_id: myId, group_id: groupId }])
            setUserGroups(prev => [...prev, groupId])
        }
    }

    async function fetchMessages(groupId) {
        const { data } = await supabase.from('group_messages')
            .select('*, profiles(full_name, role)')
            .eq('group_id', groupId)
            .order('created_at', { ascending: true })
        if (data) {
            setMessages(data)
            scrollToBottom()
        }
    }

    async function sendMessage(e) {
        e.preventDefault()
        if (!newMessage.trim() || !activeGroup || activeGroup.is_locked) return

        const msgText = newMessage.trim()
        setNewMessage('')

        const { error } = await supabase.from('group_messages').insert([{
            group_id: activeGroup.id,
            sender_id: myId,
            content: msgText
        }])

        if (error) alert("Błąd - czat został zablokowany lub nie należysz do grupy.")
    }

    if (view === 'chat' && activeGroup) {
        const isMember = userGroups.includes(activeGroup.id)

        return (
            <div className="flex flex-col h-[calc(100vh-140px)] bg-background -mx-4 -mt-4 rounded-xl overflow-hidden border border-gray-800 relative z-10">
                <div className="bg-[#1a1a1a] px-4 py-3 border-b border-gray-800 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setView('list')} className="p-2 -ml-2 text-gray-400 hover:text-white transition">
                            <ArrowLeft size={20} />
                        </button>
                        <div className="w-10 h-10 rounded-full bg-secondary/20 text-secondary flex items-center justify-center font-bold">
                            <Hash size={20} />
                        </div>
                        <div>
                            <div className="font-bold text-white leading-tight">{activeGroup.name}</div>
                            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{membersCount} Członków</div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 scrollbar-none">
                    {!isMember ? (
                        <div className="m-auto text-center flex flex-col items-center gap-4">
                            <h3 className="text-xl font-bold text-white mb-1">{activeGroup.name}</h3>
                            <p className="text-sm text-gray-400 mb-6 max-w-xs">{activeGroup.description}</p>
                            <button onClick={() => toggleMembership(activeGroup.id)} className="bg-primary text-white font-bold px-8 py-3 rounded-full shadow-[0_4_15px_rgba(59,130,246,0.5)] active:scale-95 transition">
                                Dołącz do grupy
                            </button>
                        </div>
                    ) : (
                        <>
                            {messages.length === 0 ? (
                                <div className="text-center text-gray-500 my-auto text-sm">Rozpocznij dyskusję z innymi...</div>
                            ) : (
                                messages.map(msg => {
                                    const isMe = msg.sender_id === myId
                                    return (
                                        <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} mb-2 group relative`}>
                                            {!isMe && <span className="text-[10px] text-gray-500 font-bold ml-1 mb-0.5">{msg.profiles?.full_name}</span>}
                                            <div className="flex items-center gap-2">
                                                {!isMe && (
                                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <ReportButton entityType="group_message" entityId={msg.id} subtle={true} />
                                                    </div>
                                                )}
                                                <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${isMe ? 'bg-secondary text-white rounded-tr-sm' : 'bg-surface border border-gray-800 text-gray-200 rounded-tl-sm'}`}>
                                                    {msg.content}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                            <div ref={messagesEndRef} />
                        </>
                    )}
                </div>

                {isMember && (
                    <div className="bg-[#1a1a1a] border-t border-gray-800 flex flex-col shrink-0 pb-6">
                        {activeGroup.is_locked ? (
                            <div className="p-3 text-center text-red-500 text-xs font-bold">Ten kanał został wyciszony przez Moderatora rz. 2.</div>
                        ) : (
                            <form onSubmit={sendMessage} className="p-3 flex gap-2">
                                <input
                                    type="text" placeholder="Napisz do wszystkich..."
                                    value={newMessage} onChange={e => setNewMessage(e.target.value)}
                                    className="flex-1 bg-background border border-gray-700 rounded-full px-4 text-white outline-none focus:border-secondary text-sm"
                                />
                                <button type="submit" disabled={!newMessage.trim()} className="bg-secondary hover:bg-opacity-80 disabled:opacity-50 text-white w-10 h-10 rounded-full flex items-center justify-center transition">
                                    <Send size={18} className="translate-x-[1px]" />
                                </button>
                            </form>
                        )}
                        <button onClick={() => toggleMembership(activeGroup.id, true)} className="mt-1 text-xs text-red-500/70 hover:text-red-500 underline text-center pb-2">Opuść grupę</button>
                    </div>
                )}
            </div>
        )
    }

    return (
        <div className="pb-10">
            <div className="flex justify-between items-center mb-6 px-2">
                <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight">Kółka i Grupy</h2>
                    <div className="text-xs text-secondary font-bold">Wspólne tablice uczniów</div>
                </div>
                <button onClick={() => setView('new')} className="bg-secondary/20 hover:bg-secondary/30 text-secondary p-2.5 rounded-full font-bold shadow-[0_0_15px_rgba(34,197,94,0.3)] transition active:scale-95 flex items-center justify-center">
                    <Plus size={20} />
                </button>
            </div>

            {view === 'new' ? (
                <div className="bg-surface border border-gray-800 rounded-2xl p-5 shadow-xl fade-in">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-white">Zaproponuj Zespół</h3>
                        <button onClick={() => setView('list')} className="text-gray-400"><ArrowLeft size={18} /></button>
                    </div>
                    <form onSubmit={handleCreateGroup} className="flex flex-col gap-4">
                        <input
                            type="text" required placeholder="Nazwa kółka, np. Informatycy Kl. 2"
                            value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                            className="p-3 bg-background border border-gray-700 rounded-xl text-white outline-none focus:border-secondary"
                        />
                        <textarea
                            required rows={3} placeholder="Opisz cel tego pokoju..."
                            value={newGroupDesc} onChange={e => setNewGroupDesc(e.target.value)}
                            className="p-3 bg-background border border-gray-700 rounded-xl text-white outline-none focus:border-secondary resize-none text-sm"
                        />
                        <button type="submit" className="bg-secondary text-white font-bold py-3 rounded-xl mt-2">
                            Wyślij prośbę do Weryfikacji SU
                        </button>
                        <p className="text-[10px] text-gray-500 text-center uppercase tracking-wide">Według regulaminu nowa grupa wymaga akceptacji Głównego Moderatora.</p>
                    </form>
                </div>
            ) : (
                <div>
                    {loading ? (
                        <div className="text-center text-gray-500 mt-10 animate-pulse">Ładowanie tablic...</div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3">
                            {groups.map(group => {
                                const isMember = userGroups.includes(group.id)
                                return (
                                    <div key={group.id} onClick={() => setActiveGroup(group)} className="bg-surface border border-gray-800 p-4 rounded-xl flex items-center gap-4 cursor-pointer hover:border-secondary transition relative overflow-hidden">
                                        {/* Status Tag for Creator/Admin view if not approved */}
                                        {!group.is_approved && (
                                            <div className="absolute top-0 right-0 bg-yellow-500 text-black text-[9px] font-bold px-2 py-0.5 rounded-bl-lg">Weryfikacja</div>
                                        )}
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isMember ? 'bg-secondary/20 text-secondary' : 'bg-gray-800 text-gray-400'}`}>
                                            <Hash size={24} />
                                        </div>
                                        <div className="flex-1">
                                            <div className="font-bold text-white leading-tight flex items-center gap-2">
                                                {group.name}
                                                {group.is_locked && <span className="text-[10px] text-red-500 border border-red-500/50 px-1 rounded">ZABLOKOWANA</span>}
                                            </div>
                                            <div className="text-xs text-gray-400 mt-1 line-clamp-1">{group.description}</div>
                                        </div>
                                    </div>
                                )
                            })}
                            {groups.length === 0 && (
                                <div className="text-center text-gray-500 mt-6 border border-dashed border-gray-800 p-8 rounded-2xl">
                                    Brak zespołów w szkole. Pomyśl nad własnym stowarzyszeniem!
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
