import React, { useEffect, useState } from 'react'
import { ShieldAlert, Search, UserMinus, UserCheck, CheckCircle, XCircle, AlertOctagon, Hash } from 'lucide-react'
import { supabase } from '../../services/supabase'

export default function Admin() {
    const [view, setView] = useState('users') // 'users', 'reports', 'groups'
    const [users, setUsers] = useState([])
    const [reports, setReports] = useState([])
    const [pendingGroups, setPendingGroups] = useState([])

    const [loading, setLoading] = useState(true)
    const [myRole, setMyRole] = useState('student')

    const ROLES = ['student', 'tutor', 'freelancer', 'editor', 'moderator_content', 'moderator_users', 'admin']

    useEffect(() => {
        checkAccessAndFetch()
    }, [view])

    async function checkAccessAndFetch() {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .single()

        const role = profile?.role || 'student'
        setMyRole(role)

        if (role === 'admin' || role.includes('moderator')) {
            if (view === 'users' && (role === 'admin' || role === 'moderator_users')) {
                const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
                if (data) setUsers(data)
            }
            if (view === 'reports' && (role === 'admin' || role === 'moderator_users' || role === 'moderator_content')) {
                // Relacja pozwala pobrac dane zgłaszanego uzytkownika i zglaszajacego
                const { data } = await supabase.from('reports')
                    .select('*, reporter:profiles!reporter_id(full_name)')
                    .eq('status', 'pending')
                    .order('created_at', { ascending: false })
                if (data) setReports(data)
            }
            if (view === 'groups' && (role === 'admin' || role === 'moderator_users')) {
                const { data } = await supabase.from('groups')
                    .select('*, creator:profiles!creator_id(full_name)')
                    .eq('is_approved', false)
                    .order('created_at', { ascending: false })
                if (data) setPendingGroups(data)
            }
        }
        setLoading(false)
    }

    async function handleRoleChange(userId, currentRole) {
        if (myRole !== 'admin') {
            alert('Tylko Super-Admin może modyfikować główne role platformy.')
            return
        }
        const currentIndex = ROLES.indexOf(currentRole)
        const nextRole = ROLES[(currentIndex + 1) % ROLES.length]

        await supabase.from('profiles').update({ role: nextRole }).eq('id', userId)
        checkAccessAndFetch()
    }

    async function toggleBan(userId, isBanned) {
        if (myRole !== 'admin' && myRole !== 'moderator_users') {
            alert('Nie masz uprawnień do blokady szkolnej.')
            return
        }
        await supabase.from('profiles').update({ is_banned: !isBanned }).eq('id', userId)
        checkAccessAndFetch()
    }

    async function resolveReport(reportId, status) {
        // status: 'resolved' lub 'dismissed'
        await supabase.from('reports').update({ status }).eq('id', reportId)
        checkAccessAndFetch()
    }

    async function handleGroupApproval(groupId, isApproved) {
        if (isApproved) {
            await supabase.from('groups').update({ is_approved: true }).eq('id', groupId)
        } else {
            await supabase.from('groups').delete().eq('id', groupId)
        }
        checkAccessAndFetch()
    }

    if (loading) return <div className="text-center text-primary mt-10 animate-pulse">Weryfikacja Modeli Bezpieczeństwa (RLS)...</div>

    if (myRole === 'student' || myRole === 'editor' || myRole === 'tutor' || myRole === 'freelancer') {
        return (
            <div className="flex flex-col items-center justify-center mt-20 text-center fade-in">
                <ShieldAlert size={60} className="text-red-500 mb-4 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]" />
                <h2 className="text-xl font-bold text-red-500 mb-2">Brak Dostępu i Uprawnień (RBAC)</h2>
                <p className="text-gray-400 text-sm max-w-xs">Twoja rola <strong>{myRole.toUpperCase()}</strong> na chmurze Supabase odrzuca wejście. Ten panel wymaga rangi przynajmniej Młodszego Moderatora.</p>
            </div>
        )
    }

    return (
        <div className="pb-10 fade-in">
            <div className="flex justify-between items-center mb-6 px-1">
                <div>
                    <h2 className="text-2xl font-bold text-red-500 tracking-tight flex items-center gap-2">
                        <ShieldAlert size={24} /> Zarząd (SU)
                    </h2>
                    <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Moja Rola: <span className="text-white">{myRole}</span></span>
                </div>
            </div>

            {/* Pasek Zakładek RBAC */}
            <div className="flex bg-[#1a1a1a] rounded-xl p-1 mb-6 border border-gray-800">
                <button
                    onClick={() => setView('reports')}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex justify-center items-center gap-1 ${view === 'reports' ? 'bg-red-500 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                >
                    <AlertOctagon size={14} /> Tickety
                </button>
                <button
                    onClick={() => setView('users')}
                    disabled={myRole === 'moderator_content'}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex justify-center items-center gap-1 ${view === 'users' ? 'bg-red-500 text-white shadow-lg' : myRole === 'moderator_content' ? 'opacity-30 cursor-not-allowed' : 'text-gray-400 hover:text-white'}`}
                >
                    <UserCheck size={14} /> Uczniowie
                </button>
                <button
                    onClick={() => setView('groups')}
                    disabled={myRole === 'moderator_content'}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex justify-center items-center gap-1 ${view === 'groups' ? 'bg-red-500 text-white shadow-lg' : myRole === 'moderator_content' ? 'opacity-30 cursor-not-allowed' : 'text-gray-400 hover:text-white'}`}
                >
                    <Hash size={14} /> Grupy
                </button>
            </div>

            {/* Widok: Użytkownicy */}
            {view === 'users' && (
                <div className="flex flex-col gap-3 fade-in">
                    <div className="flex bg-surface border border-gray-800 rounded-xl p-2 mb-2">
                        <input type="text" placeholder="Szukaj ucznia do moderacji..." className="bg-transparent text-white pl-2 outline-none w-full text-sm font-bold" />
                        <button className="p-2 text-gray-400"><Search size={18} /></button>
                    </div>

                    {users.map(u => (
                        <div key={u.id} className={`bg-surface border p-4 rounded-xl flex flex-col gap-3 transition ${u.is_banned ? 'border-red-500/50 bg-red-500/5' : 'border-gray-800'}`}>
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className={`font-bold text-sm ${u.is_banned ? 'text-red-500 line-through' : 'text-white'}`}>{u.full_name}</div>
                                    <div className="text-[10px] text-gray-500 font-mono mt-0.5">{u.email}</div>
                                </div>
                                <button
                                    onClick={() => handleRoleChange(u.id, u.role)}
                                    className={`text-[10px] px-2 py-1 rounded-sm font-bold border ${u.role === 'admin' ? 'border-red-500 bg-red-500/20 text-red-500' : u.role.includes('moderator') ? 'border-orange-500 bg-orange-500/20 text-orange-500' : 'border-gray-600 text-gray-300 bg-[#1a1a1a]'} hover:border-white transition`}
                                >
                                    Ranga: {u.role.toUpperCase()}
                                </button>
                            </div>

                            <div className="flex gap-2 mt-2">
                                <button
                                    onClick={() => toggleBan(u.id, u.is_banned)}
                                    className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition flex justify-center items-center gap-1 ${u.is_banned ? 'bg-orange-500/20 text-orange-500 border border-orange-500/50' : 'bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500/20'}`}
                                >
                                    {u.is_banned ? <><UserCheck size={14} /> Odbanuj ucznia</> : <><UserMinus size={14} /> Zablokuj całkowicie</>}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Widok: Zgłoszenia */}
            {view === 'reports' && (
                <div className="flex flex-col gap-3 fade-in">
                    {reports.length === 0 ? (
                        <div className="text-center text-gray-500 mt-6 p-8 border border-gray-800 border-dashed rounded-2xl">
                            <AlertOctagon size={40} className="mx-auto mb-3 opacity-20" />
                            Szkoła jest czysta. Brak otwartych ticketów z incydentami.
                        </div>
                    ) : (
                        reports.map(r => (
                            <div key={r.id} className="bg-surface border border-red-500/30 p-4 rounded-xl flex flex-col gap-3 shadow-[0_0_15px_rgba(239,68,68,0.1)] relative overflow-hidden">
                                <div className="absolute top-0 right-0 bg-red-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-bl-lg">NOWE ZGŁOSZENIE</div>

                                <div>
                                    <div className="text-xs text-gray-400 font-bold mb-1">MIEJSCE: <span className="text-white uppercase px-1 rounded bg-[#1a1a1a]">{r.reported_entity_type.replace('_', ' ')}</span></div>
                                    <div className="text-sm font-bold text-red-400 mb-1 flex items-center gap-2">
                                        Powód: {r.reason.toUpperCase()}
                                    </div>
                                    <div className="text-[10px] text-gray-500 mb-2">Zgłaszający: {r.reporter?.full_name || 'Nieznany'} • {new Date(r.created_at).toLocaleString()}</div>
                                    <div className="text-[9px] text-gray-600 font-mono bg-background p-2 rounded">ID TREŚCI: {r.reported_entity_id}</div>
                                </div>

                                <div className="flex gap-2 mt-1">
                                    <button onClick={() => resolveReport(r.id, 'resolved')} className="flex-1 bg-green-500 text-white py-2 rounded-lg text-[10px] font-bold transition flex justify-center items-center gap-1 active:scale-95 shadow-lg shadow-green-500/20">
                                        <CheckCircle size={14} /> Zamknij (Rozwiązany)
                                    </button>
                                    <button onClick={() => resolveReport(r.id, 'dismissed')} className="flex-1 bg-surface border border-gray-700 hover:bg-gray-800 text-gray-400 py-2 rounded-lg text-[10px] font-bold transition flex justify-center items-center gap-1">
                                        <XCircle size={14} /> Odrzuć (Skasuj)
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Widok: Grupy publiczne oczekujące na akceptację */}
            {view === 'groups' && (
                <div className="flex flex-col gap-3 fade-in">
                    {pendingGroups.length === 0 ? (
                        <div className="text-center text-gray-500 mt-6 p-8 border border-gray-800 border-dashed rounded-2xl">
                            <Hash size={40} className="mx-auto mb-3 opacity-20" />
                            Brak kółek szkolnych oczekujących na zatwierdzenie.
                        </div>
                    ) : (
                        pendingGroups.map(g => (
                            <div key={g.id} className="bg-surface border border-purple-500/30 p-4 rounded-xl flex flex-col gap-3">
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-500 flex items-center justify-center">
                                            <Hash size={16} />
                                        </div>
                                        <div>
                                            <div className="font-bold text-white text-sm leading-tight">{g.name}</div>
                                            <div className="text-[10px] text-gray-500">Twórca: {g.creator?.full_name || 'Nieznany'}</div>
                                        </div>
                                    </div>
                                </div>
                                <div className="text-xs text-gray-300 bg-[#1a1a1a] p-3 rounded-lg border border-gray-800 mt-1">
                                    {g.description}
                                </div>

                                <div className="flex justify-between items-center mt-2 border-t border-gray-800 pt-3">
                                    <span className="text-[10px] text-gray-500 font-bold uppercase">Prośba o rejestrację grupy</span>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleGroupApproval(g.id, false)} className="w-8 h-8 rounded-lg bg-surface border border-red-500/50 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition">
                                            <XCircle size={16} />
                                        </button>
                                        <button onClick={() => handleGroupApproval(g.id, true)} className="px-4 py-1.5 rounded-lg bg-green-500 text-white text-xs font-bold hover:bg-green-600 transition shadow-lg shadow-green-500/20">
                                            ZATOERDŹ
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    )
}
