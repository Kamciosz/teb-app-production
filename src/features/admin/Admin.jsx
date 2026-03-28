import React, { useEffect, useState } from 'react'
import { ShieldAlert, Search, UserMinus, UserCheck, CheckCircle, XCircle, AlertOctagon, Hash, Trash2, Loader2 } from 'lucide-react'
import { supabase } from '../../services/supabase'
import { CleanupService } from '../../services/cleanupService'

export default function Admin() {
    const [view, setView] = useState('users') // 'users', 'reports', 'groups', 'system'
    const [users, setUsers] = useState([])
    const [reports, setReports] = useState([])
    const [pendingGroups, setPendingGroups] = useState([])

    const [loading, setLoading] = useState(true)
    const [cleanupLoading, setCleanupLoading] = useState(false)
    const [cleanupResult, setCleanupResult] = useState(null)
    const [myRoles, setMyRoles] = useState([])
    const [myId, setMyId] = useState(null)
    const [banDuration, setBanDuration] = useState('1440') // 1 day in minutes

    const ROLES = ['student', 'teacher', 'admin', 'editor', 'moderator_content', 'moderator_users', 'su_member']

    useEffect(() => {
        checkAccessAndFetch()
    }, [view])

    async function handleCleanup() {
        if (!window.confirm("Czy na pewno chcesz uruchomić Śmieciarkę? Ta operacja trwale usunie stare media i wpisy zgodnie z polityką prywatności.")) return
        
        setCleanupLoading(true)
        setCleanupResult(null)
        const result = await CleanupService.runCleanup()
        setCleanupLoading(false)
        setCleanupResult(result)
        
        if (result.success) {
            alert(`🚛 Sprzątanie zakończone!\nUsunięto:\n- ${result.deleted.chat} wiadomości\n- ${result.deleted.rewear} ofert giełdy\n- ${result.deleted.reports} raportów`)
        } else {
            alert("❌ Błąd podczas sprzątania: " + result.error)
        }
    }

    async function checkAccessAndFetch() {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        setMyId(session.user.id)

        const { data: profile } = await supabase
            .from('profiles')
            .select('role, roles')
            .eq('id', session.user.id)
            .single()

        // Obsługa wsteczna: jesli roles jest puste, uzywamy starego role
        const roles = profile?.roles || (profile?.role ? [profile.role] : ['student'])
        setMyRoles(roles)
        const myRole = roles[0] || 'student'

        const canManageUsers = roles.includes('admin') || roles.includes('moderator_users')
        const canManageContent = roles.includes('admin') || roles.includes('moderator_content')

        if (canManageUsers || canManageContent) {
            if (view === 'users' && canManageUsers) {
                const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
                if (data) setUsers(data)
            }
            if (view === 'reports' && (canManageUsers || canManageContent)) {
                const { data } = await supabase.from('reports')
                    .select('*, reporter:profiles!reporter_id(full_name)')
                    .eq('status', 'pending')
                    .order('created_at', { ascending: false })
                if (data) setReports(data)
            }
            if (view === 'groups' && canManageUsers) {
                const { data } = await supabase.from('groups')
                    .select('*, creator:profiles!creator_id(full_name)')
                    .eq('is_approved', false)
                    .order('created_at', { ascending: false })
                if (data) setPendingGroups(data)
            }
        }
        setLoading(false)
    }

    async function toggleRank(userId, currentRoles, rank) {
        if (!myRoles.includes('admin')) {
            alert('Tylko Admin Główny może nadawać rangi.')
            return
        }
        // Zabezpieczenie: admin nie może odebrać sobie roli 'admin'
        if (userId === myId && rank === 'admin' && currentRoles.includes('admin')) {
            alert('Nie możesz odebrać sobie uprawnień Administratora. Poproś innego admina.')
            return
        }
        let newRoles = [...(currentRoles || ['student'])]
        if (newRoles.includes(rank)) {
            newRoles = newRoles.filter(r => r !== rank)
        } else {
            newRoles.push(rank)
        }
        if (newRoles.length === 0) newRoles = ['student']

        await supabase.from('profiles').update({ roles: newRoles, role: newRoles[0] }).eq('id', userId)
        checkAccessAndFetch()
    }

    async function handleBan(userId, isBanned) {
        if (!myRoles.includes('admin') && !myRoles.includes('moderator_users')) {
            alert('Brak uprawnień do moderacji uczniów.')
            return
        }

        const banUntil = isBanned ? null : new Date(Date.now() + parseInt(banDuration) * 60000).toISOString()

        await supabase.from('profiles').update({
            is_banned: !isBanned,
            banned_until: banUntil
        }).eq('id', userId)

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

    const myRole = myRoles[0] || 'student'

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
        <div className="pb-10 fade-in max-w-4xl mx-auto">
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
                <button
                    onClick={() => setView('system')}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex justify-center items-center gap-1 ${view === 'system' ? 'bg-red-500 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                >
                    <Trash2 size={14} /> System
                </button>
            </div>

            {/* Widok: System / Śmieciarka */}
            {view === 'system' && (
                <div className="flex flex-col gap-6 fade-in px-2">
                    <div className="bg-surface border border-gray-800 p-6 rounded-2xl shadow-xl">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="w-14 h-14 rounded-2xl bg-red-500/20 text-red-500 flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.2)]">
                                <Trash2 size={30} />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-white">Śmieciarka (GC)</h3>
                                <p className="text-xs text-gray-500 uppercase font-bold tracking-widest mt-1">Utrzymanie darmowych limitów</p>
                            </div>
                        </div>

                        <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-4 mb-6">
                            <h4 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2">
                                <ShieldAlert size={16} className="text-red-500" /> Zasady sprzątania:
                            </h4>
                            <ul className="space-y-2 text-xs text-gray-400">
                                <li className="flex justify-between border-b border-gray-800/50 pb-1">
                                    <span>Czaty (P2P & Grupy)</span>
                                    <span className="text-red-400 font-bold">starsze niż 8 dni</span>
                                </li>
                                <li className="flex justify-between border-b border-gray-800/50 pb-1">
                                    <span>Giełda Re-Wear</span>
                                    <span className="text-red-400 font-bold">starsze niż 21 dni</span>
                                </li>
                                <li className="flex justify-between">
                                    <span>Raporty i zgłoszenia</span>
                                    <span className="text-red-400 font-bold">starsze niż 30 dni</span>
                                </li>
                            </ul>
                        </div>

                        <button
                            onClick={handleCleanup}
                            disabled={cleanupLoading}
                            className={`w-full py-4 rounded-xl font-bold text-sm transition flex items-center justify-center gap-3 shadow-lg ${cleanupLoading ? 'bg-gray-800 text-gray-500' : 'bg-red-500 text-white hover:bg-red-600 active:scale-95 shadow-red-500/20'}`}
                        >
                            {cleanupLoading ? (
                                <><Loader2 size={20} className="animate-spin" /> Trwa sprzątanie...</>
                            ) : (
                                <><Trash2 size={20} /> Uruchom Śmieciarkę</>
                            )}
                        </button>
                    </div>

                    {cleanupResult && cleanupResult.success && (
                        <div className="bg-green-500/10 border border-green-500/30 p-4 rounded-xl animate-in fade-in slide-in-from-top-4">
                            <div className="flex items-center gap-2 text-green-500 font-bold text-sm mb-2">
                                <CheckCircle size={18} /> Raport ze sprzątania:
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="bg-background/50 p-2 rounded-lg text-center">
                                    <div className="text-lg font-black text-white">{cleanupResult.deleted.chat}</div>
                                    <div className="text-[9px] text-gray-500 uppercase">Wiadomości</div>
                                </div>
                                <div className="bg-background/50 p-2 rounded-lg text-center">
                                    <div className="text-lg font-black text-white">{cleanupResult.deleted.rewear}</div>
                                    <div className="text-[9px] text-gray-500 uppercase">Oferty</div>
                                </div>
                                <div className="bg-background/50 p-2 rounded-lg text-center">
                                    <div className="text-lg font-black text-white">{cleanupResult.deleted.reports}</div>
                                    <div className="text-[9px] text-gray-500 uppercase">Raporty</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Widok: Użytkownicy */}
            {view === 'users' && (
                <div className="flex flex-col gap-3 fade-in">
                    <div className="flex bg-surface border border-gray-800 rounded-xl p-2 mb-2 max-w-md">
                        <input type="text" placeholder="Szukaj ucznia do moderacji..." className="bg-transparent text-white pl-2 outline-none w-full text-sm font-bold" />
                        <button className="p-2 text-gray-400"><Search size={18} /></button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {users.map(u => {
                        const userRoles = u.roles || [u.role] || ['student']
                        return (
                            <div key={u.id} className={`bg-surface border p-4 rounded-xl flex flex-col gap-3 transition ${u.is_banned ? 'border-red-500/50 bg-red-500/5' : 'border-gray-800'}`}>
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className={`font-bold text-sm ${u.is_banned ? 'text-red-500' : 'text-white'}`}>
                                            {u.full_name}
                                            {u.is_banned && <span className="text-[10px] ml-2 px-1 bg-red-500 text-white rounded">ZBANOWANY</span>}
                                        </div>
                                        <div className="text-[10px] text-gray-500 font-mono mt-0.5">{u.email}</div>
                                        {u.is_banned && u.banned_until && (
                                            <div className="text-[10px] text-red-400 font-bold mt-1">Ban do: {new Date(u.banned_until).toLocaleString()}</div>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-1 max-w-[150px] justify-end">
                                        {userRoles.map(r => (
                                            <span key={r} className="text-[9px] px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-400 font-bold uppercase">
                                                {r}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <div className="border-t border-gray-800/50 pt-3 flex flex-col gap-2">
                                    <div className="text-[9px] text-gray-500 font-bold uppercase mb-1">Zarządzaj Rangami (Multi-Rank)</div>
                                    <div className="flex flex-wrap gap-1">
                                        {ROLES.map(rank => (
                                            <button
                                                key={rank}
                                                onClick={() => toggleRank(u.id, userRoles, rank)}
                                                className={`text-[9px] px-2 py-1 rounded transition border ${userRoles.includes(rank) ? 'bg-primary/20 border-primary text-primary' : 'bg-[#121212] border-gray-800 text-gray-600 hover:border-gray-600'}`}
                                            >
                                                {rank.toUpperCase()}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex gap-2 mt-2 items-center">
                                    <select
                                        className="bg-background border border-gray-700 rounded text-[10px] text-gray-400 p-1 outline-none"
                                        value={banDuration}
                                        onChange={(e) => setBanDuration(e.target.value)}
                                        disabled={u.is_banned}
                                    >
                                        <option value="60">1h</option>
                                        <option value="1440">24h</option>
                                        <option value="4320">3 dni</option>
                                        <option value="10080">7 dni</option>
                                        <option value="52560000">Permanentny</option>
                                    </select>
                                    <button
                                        onClick={() => handleBan(u.id, u.is_banned)}
                                        className={`flex-1 py-1.5 rounded text-[10px] font-bold transition flex justify-center items-center gap-1 ${u.is_banned ? 'bg-green-500/10 text-green-500 border border-green-500/30' : 'bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500/20'}`}
                                    >
                                        {u.is_banned ? <><UserCheck size={14} /> Odbanuj</> : <><UserMinus size={14} /> Nałóż karę</>}
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                    </div>
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
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {reports.map(r => (
                            <div key={r.id} className="bg-surface border border-red-500/30 p-4 rounded-xl flex flex-col gap-3 shadow-[0_0_15px_rgba(239,68,68,0.1)] relative overflow-hidden">
                                <div className="absolute top-0 right-0 bg-red-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-bl-lg">NOWE ZGŁOSZENIE</div>

                                <div>
                                        <div className="text-xs text-gray-400 font-bold mb-1">MIEJSCE: <span className="text-white uppercase px-1 rounded bg-[#1a1a1a]">{r.reported_entity_type.replace('_', ' ')}</span></div>
                                        <div className="text-sm font-bold text-red-400 mb-1 flex items-center gap-2">
                                            Powód: {r.reason.toUpperCase()}
                                        </div>
                                        <div className="text-[10px] text-gray-500 mb-2">Zgłaszający: {r.reporter?.full_name || 'Nieznany'} • {new Date(r.created_at).toLocaleString()}</div>
                                        <div className="text-[9px] text-gray-600 font-mono bg-background p-2 rounded mb-2">ID TREŚCI: {r.reported_entity_id}</div>
                                        
                                        {/* Wyświetlanie Kontekstu (release-0.1) */}
                                        {r.context && (
                                            <div className="mt-3 bg-black/40 border border-gray-800 rounded-lg p-3">
                                                <div className="text-[9px] text-gray-500 uppercase font-black mb-2 flex items-center gap-1">
                                                    <ShieldAlert size={10} /> Kontekst Rozmowy (±5 wiadomości):
                                                </div>
                                                <div className="flex flex-col gap-1.5">
                                                    {JSON.parse(r.context).map((ctx, i) => (
                                                        <div key={i} className={`text-[10px] leading-tight ${ctx.t.includes(r.reported_entity_id) ? 'bg-red-500/10 p-1 rounded' : ''}`}>
                                                            <span className="font-bold text-gray-300">{ctx.u}: </span>
                                                            <span className="text-gray-400">{ctx.t}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
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
                        ))}
                        </div>
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
