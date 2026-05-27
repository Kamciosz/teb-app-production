import React, { useEffect, useMemo, useState } from 'react'
import { ShieldAlert, Search, UserMinus, UserCheck, CheckCircle, XCircle, AlertOctagon, Hash, Trash2, Loader2, Scale, ScrollText, BarChart3, Bug, Activity, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../../services/supabase'
import { CleanupService } from '../../services/cleanupService'
import { sanitizePlainText } from '../../utils/safeContent'

export default function Admin() {
    const [view, setView] = useState('users') // 'users', 'reports', 'groups', 'appeals', 'audit', 'system'
    const [users, setUsers] = useState([])
    const [reports, setReports] = useState([])
    const [pendingGroups, setPendingGroups] = useState([])
    const [appeals, setAppeals] = useState([])
    const [auditEntries, setAuditEntries] = useState([])

    const [loading, setLoading] = useState(true)
    const [cleanupLoading, setCleanupLoading] = useState(false)
    const [cleanupResult, setCleanupResult] = useState(null)
    const [myRoles, setMyRoles] = useState([])
    const [myId, setMyId] = useState(null)
    const [banDuration, setBanDuration] = useState('1440') // 1 day in minutes
    const [pageError, setPageError] = useState('')
    const [userSearch, setUserSearch] = useState('')
    const [reportSearch, setReportSearch] = useState('')

    // --- Dashboard & Logs state ---
    const [dashboardStats, setDashboardStats] = useState(null)
    const [dashboardLoading, setDashboardLoading] = useState(false)
    const [errorLogs, setErrorLogs] = useState([])
    const [logsLoading, setLogsLoading] = useState(false)
    const [logsPage, setLogsPage] = useState(1)
    const [logsTotal, setLogsTotal] = useState(0)
    const LOGS_PER_PAGE = 20

    const ROLES = ['student', 'teacher', 'admin', 'editor', 'moderator_content', 'moderator_users', 'su_member']

    useEffect(() => {
        checkAccessAndFetch()
    }, [])

    useEffect(() => {
        if (myRoles.length === 0) return
        fetchViewData(view, myRoles)

        // Fetch dashboard / logs on tab switch
        if (view === 'dashboard') fetchDashboardStats()
        if (view === 'logs') fetchErrorLogs(1)
    }, [view, myRoles])

    async function fetchDashboardStats() {
        setDashboardLoading(true)
        try {
            const res = await fetch('/api/stats')
            const data = await res.json()
            setDashboardStats(data)
        } catch {
            setDashboardStats(null)
        } finally {
            setDashboardLoading(false)
        }
    }

    async function fetchErrorLogs(page = 1) {
        setLogsLoading(true)
        try {
            const res = await fetch(`/api/logs?page=${page}&limit=${LOGS_PER_PAGE}`)
            const data = await res.json()
            setErrorLogs(data.logs || [])
            setLogsTotal(data.total || 0)
            setLogsPage(page)
        } catch {
            setErrorLogs([])
            setLogsTotal(0)
        } finally {
            setLogsLoading(false)
        }
    }

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

    async function fetchViewData(targetView, roles) {
        const canManageUsers = roles.includes('admin') || roles.includes('moderator_users')
        const canManageContent = roles.includes('admin') || roles.includes('moderator_content')
        const canOpenAudit = canManageUsers || canManageContent

        if (targetView === 'users' && canManageUsers) {
            const primaryUsers = await supabase
                .from('profiles')
                .select('id, full_name, roles, role, is_banned, banned_until, ban_reason, created_at')
                .order('created_at', { ascending: false })
                .limit(100)

            if (primaryUsers.data) {
                setUsers(primaryUsers.data)
            } else {
                const fallbackUsers = await supabase
                    .from('profiles')
                    .select('id, full_name, roles, role, is_banned, banned_until, created_at')
                    .order('created_at', { ascending: false })
                    .limit(100)

                if (fallbackUsers.data) {
                    setUsers(fallbackUsers.data.map(user => ({ ...user, ban_reason: null })))
                }
            }
        }

        if (targetView === 'reports' && (canManageUsers || canManageContent)) {
            const { data } = await supabase.from('reports')
                .select('*, reporter:profiles!reporter_id(full_name)')
                .eq('status', 'pending')
                .order('created_at', { ascending: false })
                .limit(50)
            if (data) setReports(data)
        }

        if (targetView === 'groups' && canManageUsers) {
            const { data } = await supabase.from('groups')
                .select('*, creator:profiles!creator_id(full_name)')
                .eq('is_approved', false)
                .order('created_at', { ascending: false })
                .limit(100)
            if (data) setPendingGroups(data)
        }

        if (targetView === 'appeals' && canManageUsers) {
            const { data } = await supabase.from('punishment_appeals')
                .select('id, status, punishment_type, message, resolution_note, created_at, appellant:profiles!appellant_user_id(full_name), audit:moderation_audit_log!audit_log_id(action_type, reason, metadata, created_at)')
                .eq('status', 'pending')
                .order('created_at', { ascending: false })
                .limit(50)

            setAppeals(data || [])
        }

        if (targetView === 'audit' && canOpenAudit) {
            const { data } = await supabase.from('moderation_audit_log')
                .select('id, action_type, reason, metadata, created_at, actor:profiles!actor_user_id(full_name), target:profiles!target_user_id(full_name)')
                .order('created_at', { ascending: false })
                .limit(100)

            setAuditEntries(data || [])
        }
    }

    async function checkAccessAndFetch() {
        setLoading(true)
        setPageError('')

        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                setLoading(false)
                return
            }
            setMyId(session.user.id)

            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('role, roles')
                .eq('id', session.user.id)
                .single()

            if (profileError) {
                setPageError(profileError.message)
            }

            const roles = profile?.roles || (profile?.role ? [profile.role] : ['student'])
            setMyRoles(roles)
            await fetchViewData(view, roles)
        } finally {
            setLoading(false)
        }
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

        const { error } = await supabase.from('profiles').update({ roles: newRoles, role: newRoles[0] }).eq('id', userId)
        if (error) {
            alert(`Nie udało się zaktualizować rang: ${error.message}`)
            return
        }

        setUsers(prev => prev.map(user => {
            if (user.id !== userId) return user
            return { ...user, roles: newRoles, role: newRoles[0] }
        }))
    }

    async function handleBan(userId, isBanned) {
        if (!myRoles.includes('admin') && !myRoles.includes('moderator_users')) {
            alert('Brak uprawnień do moderacji uczniów.')
            return
        }

        let banReason = null
        if (!isBanned) {
            banReason = sanitizePlainText(window.prompt('Podaj powód kary. Użytkownik zobaczy ten powód przy apelacji.') || '', { maxLength: 240, preserveLineBreaks: true })
            if (!banReason) return
        }

        const banUntil = isBanned ? null : new Date(Date.now() + parseInt(banDuration) * 60000).toISOString()

        const { error } = await supabase.from('profiles').update({
            is_banned: !isBanned,
            banned_until: banUntil,
            ban_reason: isBanned ? null : banReason
        }).eq('id', userId)
        if (error) {
            alert(`Nie udało się zmienić statusu bana: ${error.message}`)
            return
        }

        setUsers(prev => prev.map(user => {
            if (user.id !== userId) return user
            return {
                ...user,
                is_banned: !isBanned,
                banned_until: banUntil,
                ban_reason: isBanned ? null : banReason
            }
        }))
    }

    async function resolveReport(reportId, status) {
        // status: 'resolved' lub 'dismissed'
        const { error } = await supabase.from('reports').update({ status }).eq('id', reportId)
        if (error) {
            alert(`Nie udało się zaktualizować zgłoszenia: ${error.message}`)
            return
        }
        setReports(prev => prev.filter(report => report.id !== reportId))
    }

    async function handleGroupApproval(groupId, isApproved) {
        if (isApproved) {
            const { error } = await supabase.from('groups').update({ is_approved: true }).eq('id', groupId)
            if (error) {
                alert(`Nie udało się zatwierdzić grupy: ${error.message}`)
                return
            }
        } else {
            const { error } = await supabase.from('groups').delete().eq('id', groupId)
            if (error) {
                alert(`Nie udało się odrzucić grupy: ${error.message}`)
                return
            }
        }
        setPendingGroups(prev => prev.filter(group => group.id !== groupId))
    }

    async function resolveAppeal(appealId, status) {
        const resolutionNote = sanitizePlainText(window.prompt(
            status === 'approved'
                ? 'Dodaj krótkie uzasadnienie cofnięcia kary.'
                : 'Dodaj krótkie uzasadnienie odrzucenia apelacji.'
        ) || '', { maxLength: 240, preserveLineBreaks: true })

        if (!resolutionNote) return

        const { error } = await supabase.rpc('resolve_punishment_appeal', {
            p_appeal_id: appealId,
            p_new_status: status,
            p_resolution_note: resolutionNote
        })

        if (error) {
            alert(`Nie udało się rozpatrzyć apelacji: ${error.message}`)
            return
        }

        setAppeals(prev => prev.filter(appeal => appeal.id !== appealId))
    }

    const canManageUsers = useMemo(() => myRoles.includes('admin') || myRoles.includes('moderator_users'), [myRoles])
    const canManageContent = useMemo(() => myRoles.includes('admin') || myRoles.includes('moderator_content'), [myRoles])
    const filteredUsers = useMemo(() => {
        const q = sanitizePlainText(userSearch, { maxLength: 80 }).toLowerCase()
        if (!q) return users
        return users.filter(user => {
            const roles = (user.roles || [user.role] || []).join(' ').toLowerCase()
            return (user.full_name || '').toLowerCase().includes(q) || (user.id || '').toLowerCase().includes(q) || roles.includes(q)
        })
    }, [users, userSearch])

    const filteredReports = useMemo(() => {
        const q = sanitizePlainText(reportSearch, { maxLength: 80 }).toLowerCase()
        if (!q) return reports
        return reports.filter(report => {
            const reporter = report.reporter?.full_name || ''
            return reporter.toLowerCase().includes(q)
                || (report.reason || '').toLowerCase().includes(q)
                || (report.reported_entity_type || '').toLowerCase().includes(q)
                || (report.reported_entity_id || '').toLowerCase().includes(q)
        })
    }, [reports, reportSearch])

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

    const adminTabs = [
        { id: 'dashboard', label: 'Dashboard', icon: BarChart3, disabled: false },
        { id: 'reports', label: 'Tickety', icon: AlertOctagon, disabled: false },
        { id: 'users', label: 'Uczniowie', icon: UserCheck, disabled: myRole === 'moderator_content' },
        { id: 'groups', label: 'Grupy', icon: Hash, disabled: myRole === 'moderator_content' },
        { id: 'appeals', label: 'Apelacje', icon: Scale, disabled: myRole === 'moderator_content' },
        { id: 'audit', label: 'Audit', icon: ScrollText, disabled: false },
        { id: 'logs', label: 'Logi', icon: Bug, disabled: false },
        { id: 'system', label: 'System', icon: Trash2, disabled: false }
    ]

    return (
        <div className="pb-10 fade-in max-w-4xl mx-auto lg:max-w-none lg:min-h-full lg:pb-0">
            <div className="flex justify-between items-center mb-6 px-1">
                <div>
                    <h2 className="text-2xl font-bold text-red-500 tracking-tight flex items-center gap-2">
                        <ShieldAlert size={24} /> Zarząd (SU)
                    </h2>
                    <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Moja Rola: <span className="text-white">{myRole}</span></span>
                </div>
            </div>

            {pageError && (
                <div className="mb-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-200">
                    Część danych administracyjnych nie załadowała się w pełni: {pageError}
                </div>
            )}

            <div className="lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-6 lg:items-start lg:min-h-[calc(100vh-11rem)]">
                <aside className="hidden lg:flex lg:flex-col lg:gap-2 lg:rounded-3xl lg:border lg:border-gray-800 lg:bg-[#171717] lg:p-3 lg:sticky lg:top-0">
                    <div className="px-3 pt-2 pb-3 border-b border-gray-800/80">
                        <div className="text-[10px] uppercase tracking-[0.26em] font-bold text-gray-500">Panel desktop</div>
                        <div className="mt-2 text-xl font-black text-white">Zarządzanie szkołą</div>
                        <div className="mt-2 text-sm text-gray-400 leading-relaxed">Na komputerze panel działa jako pełnoekranowy workspace z boczną nawigacją i szeroką przestrzenią roboczą.</div>
                    </div>

                    {adminTabs.map(tab => {
                        const Icon = tab.icon
                        const active = view === tab.id
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setView(tab.id)}
                                disabled={tab.disabled}
                                className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition border ${active ? 'bg-red-500 text-white border-red-500 shadow-lg shadow-red-500/10' : tab.disabled ? 'opacity-30 cursor-not-allowed border-transparent text-gray-600' : 'border-transparent text-gray-400 hover:text-white hover:bg-white/[0.04]'}`}
                            >
                                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${active ? 'bg-white/10' : 'bg-black/20'}`}>
                                    <Icon size={18} />
                                </div>
                                <div>
                                    <div className="text-sm font-bold leading-tight">{tab.label}</div>
                                    <div className={`text-[11px] mt-0.5 ${active ? 'text-red-100' : 'text-gray-500'}`}>{tab.id === 'system' ? 'Utrzymanie i cleanup' : tab.id === 'audit' ? 'Historia działań' : 'Sekcja operacyjna'}</div>
                                </div>
                            </button>
                        )
                    })}
                </aside>

                <div className="min-w-0">

            {/* Pasek Zakładek RBAC */}
            <div className="grid grid-cols-4 md:grid-cols-8 bg-[#1a1a1a] rounded-xl p-1 mb-6 border border-gray-800 gap-1 lg:hidden">
                {adminTabs.map(tab => {
                    const Icon = tab.icon
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setView(tab.id)}
                            disabled={tab.disabled}
                            className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex justify-center items-center gap-1 ${view === tab.id ? 'bg-red-500 text-white shadow-lg' : tab.disabled ? 'opacity-30 cursor-not-allowed' : 'text-gray-400 hover:text-white'}`}
                        >
                            <Icon size={14} /> {tab.label}
                        </button>
                    )
                })}
            </div>

            {/* Widok: Dashboard / Statystyki */}
            {view === 'dashboard' && (
                <div className="flex flex-col gap-6 fade-in px-2">
                    {dashboardLoading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 size={32} className="animate-spin text-red-500" />
                        </div>
                    ) : dashboardStats ? (
                        <>
                            {/* Karty statystyk */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="bg-surface border border-gray-800 rounded-2xl p-5">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-500 flex items-center justify-center">
                                            <UserCheck size={20} />
                                        </div>
                                        <span className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Total Users</span>
                                    </div>
                                    <div className="text-3xl font-black text-white">{dashboardStats.total_users ?? '—'}</div>
                                </div>
                                <div className="bg-surface border border-gray-800 rounded-2xl p-5">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-10 h-10 rounded-xl bg-green-500/20 text-green-500 flex items-center justify-center">
                                            <CheckCircle size={20} />
                                        </div>
                                        <span className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Confirmed</span>
                                    </div>
                                    <div className="text-3xl font-black text-white">{dashboardStats.confirmed ?? '—'}</div>
                                </div>
                                <div className="bg-surface border border-gray-800 rounded-2xl p-5">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center">
                                            <Activity size={20} />
                                        </div>
                                        <span className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Ostatnie 24h</span>
                                    </div>
                                    <div className="text-3xl font-black text-white">{dashboardStats.last_24h ?? '—'}</div>
                                </div>
                            </div>

                            {/* Wykres 7-dniowy */}
                            <div className="bg-surface border border-gray-800 rounded-2xl p-5">
                                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                                    <BarChart3 size={16} className="text-red-500" />
                                    Aktywność w ostatnich 7 dniach
                                </h3>
                                {dashboardStats.chart_data && dashboardStats.chart_data.length > 0 ? (
                                    <div className="flex items-end gap-2 h-28">
                                        {dashboardStats.chart_data.map((day, i) => {
                                            const maxVal = Math.max(...dashboardStats.chart_data.map(d => d.value), 1)
                                            const heightPct = (day.value / maxVal) * 100
                                            return (
                                                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                                    <span className="text-[9px] text-gray-500 font-bold">{day.value}</span>
                                                    <div
                                                        className="w-full rounded-md bg-gradient-to-t from-red-600 to-red-400 transition-all hover:opacity-80"
                                                        style={{ height: `${Math.max(heightPct, 2)}%` }}
                                                        title={`${day.label}: ${day.value}`}
                                                    />
                                                    <span className="text-[8px] text-gray-600 uppercase">{day.label}</span>
                                                </div>
                                            )
                                        })}
                                    </div>
                                ) : (
                                    <div className="text-center text-gray-500 text-sm py-8 border border-dashed border-gray-800 rounded-xl">
                                        Brak danych do wyświetlenia wykresu.
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="text-center text-gray-500 mt-6 p-8 border border-gray-800 border-dashed rounded-2xl">
                            <BarChart3 size={40} className="mx-auto mb-3 opacity-20" />
                            Nie udało się załadować statystyk. Sprawdź czy endpoint <code className="text-red-400 bg-background px-1 rounded">/api/stats</code> jest dostępny.
                        </div>
                    )}
                </div>
            )}

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
                        <input
                            type="text"
                            placeholder="Szukaj ucznia po nazwie, ID lub roli..."
                            value={userSearch}
                            onChange={event => setUserSearch(event.target.value)}
                            className="bg-transparent text-white pl-2 outline-none w-full text-sm font-bold"
                        />
                        <button className="p-2 text-gray-400"><Search size={18} /></button>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-1">
                        <div className="bg-surface border border-gray-800 rounded-xl p-3">
                            <div className="text-[10px] uppercase text-gray-500 font-bold">Wszyscy</div>
                            <div className="text-xl font-black text-white mt-1">{users.length}</div>
                        </div>
                        <div className="bg-surface border border-gray-800 rounded-xl p-3">
                            <div className="text-[10px] uppercase text-gray-500 font-bold">Filtrowani</div>
                            <div className="text-xl font-black text-primary mt-1">{filteredUsers.length}</div>
                        </div>
                        <div className="bg-surface border border-gray-800 rounded-xl p-3">
                            <div className="text-[10px] uppercase text-gray-500 font-bold">Zbanowani</div>
                            <div className="text-xl font-black text-red-400 mt-1">{users.filter(user => user.is_banned).length}</div>
                        </div>
                        <div className="bg-surface border border-gray-800 rounded-xl p-3">
                            <div className="text-[10px] uppercase text-gray-500 font-bold">Moderatorzy/Admin</div>
                            <div className="text-xl font-black text-orange-300 mt-1">{users.filter(user => (user.roles || [user.role] || []).some(role => ['admin', 'moderator_users', 'moderator_content'].includes(role))).length}</div>
                        </div>
                    </div>

                    <div className="hidden lg:block bg-surface border border-gray-800 rounded-xl overflow-hidden">
                        <div className="grid grid-cols-[1.2fr_1.1fr_0.8fr_1fr] gap-3 px-4 py-3 text-[10px] uppercase tracking-widest font-bold text-gray-500 border-b border-gray-800 bg-[#171717]">
                            <span>Użytkownik</span>
                            <span>Role</span>
                            <span>Status</span>
                            <span>Akcje</span>
                        </div>
                        <div className="max-h-[55vh] overflow-y-auto">
                            {filteredUsers.map(u => {
                                const userRoles = u.roles || [u.role] || ['student']
                                return (
                                    <div key={u.id} className="grid grid-cols-[1.2fr_1.1fr_0.8fr_1fr] gap-3 px-4 py-3 border-b border-gray-800/70 hover:bg-white/[0.02]">
                                        <div>
                                            <div className="font-bold text-white text-sm">{u.full_name}</div>
                                            <div className="text-[10px] text-gray-500 font-mono mt-1">{u.id}</div>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {ROLES.map(rank => (
                                                <button
                                                    key={rank}
                                                    onClick={() => toggleRank(u.id, userRoles, rank)}
                                                    className={`text-[9px] px-2 py-1 rounded border transition ${userRoles.includes(rank) ? 'bg-primary/20 border-primary text-primary' : 'bg-[#121212] border-gray-800 text-gray-500 hover:border-gray-600'}`}
                                                >
                                                    {rank}
                                                </button>
                                            ))}
                                        </div>
                                        <div>
                                            {u.is_banned ? (
                                                <div className="text-[11px] font-bold text-red-400">BAN</div>
                                            ) : (
                                                <div className="text-[11px] font-bold text-green-400">AKTYWNY</div>
                                            )}
                                            {u.banned_until ? <div className="text-[10px] text-gray-500 mt-1">do {new Date(u.banned_until).toLocaleString()}</div> : null}
                                        </div>
                                        <div className="flex gap-2 items-center">
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:hidden">
                        {filteredUsers.map(u => {
                        const userRoles = u.roles || [u.role] || ['student']
                        return (
                            <div key={u.id} className={`bg-surface border p-4 rounded-xl flex flex-col gap-3 transition ${u.is_banned ? 'border-red-500/50 bg-red-500/5' : 'border-gray-800'}`}>
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className={`font-bold text-sm ${u.is_banned ? 'text-red-500' : 'text-white'}`}>
                                            {u.full_name}
                                            {u.is_banned && <span className="text-[10px] ml-2 px-1 bg-red-500 text-white rounded">ZBANOWANY</span>}
                                        </div>
                                        <div className="text-[10px] text-gray-500 font-mono mt-0.5">ID: {u.id?.slice(0, 8)}...</div>
                                        {u.is_banned && u.banned_until && (
                                            <div className="text-[10px] text-red-400 font-bold mt-1">Ban do: {new Date(u.banned_until).toLocaleString()}</div>
                                        )}
                                        {u.ban_reason && (
                                            <div className="text-[10px] text-gray-400 mt-1 max-w-[220px] leading-relaxed">Powód: {u.ban_reason}</div>
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

            {view === 'appeals' && (
                <div className="flex flex-col gap-3 fade-in">
                    {appeals.length === 0 ? (
                        <div className="text-center text-gray-500 mt-6 p-8 border border-gray-800 border-dashed rounded-2xl">
                            <Scale size={40} className="mx-auto mb-3 opacity-20" />
                            Brak aktywnych apelacji do rozpatrzenia.
                        </div>
                    ) : (
                        appeals.map(appeal => (
                            <div key={appeal.id} className="bg-surface border border-gray-800 p-4 rounded-xl flex flex-col gap-3">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <div className="text-sm font-bold text-white">{appeal.appellant?.full_name || 'Nieznany użytkownik'}</div>
                                        <div className="text-[10px] text-gray-500 uppercase mt-1">{appeal.punishment_type} • {new Date(appeal.created_at).toLocaleString()}</div>
                                    </div>
                                    <div className="text-[10px] font-bold uppercase text-yellow-400">{appeal.status}</div>
                                </div>

                                {appeal.audit && (
                                    <div className="bg-background border border-gray-800 rounded-xl p-3 text-xs text-gray-300">
                                        <div className="text-[10px] uppercase text-gray-500 mb-1">Pierwotna kara</div>
                                        <div>{appeal.audit.reason || 'Brak uzasadnienia.'}</div>
                                    </div>
                                )}

                                <div className="bg-background border border-gray-800 rounded-xl p-3 text-sm text-white whitespace-pre-wrap">
                                    {appeal.message}
                                </div>

                                <div className="flex gap-2">
                                    <button onClick={() => resolveAppeal(appeal.id, 'approved')} className="flex-1 bg-green-500 text-white py-2 rounded-lg text-[10px] font-bold transition flex justify-center items-center gap-1 active:scale-95 shadow-lg shadow-green-500/20">
                                        <CheckCircle size={14} /> Uznaj apelację
                                    </button>
                                    <button onClick={() => resolveAppeal(appeal.id, 'rejected')} className="flex-1 bg-surface border border-red-500/40 text-red-400 py-2 rounded-lg text-[10px] font-bold transition flex justify-center items-center gap-1 hover:bg-red-500/10">
                                        <XCircle size={14} /> Odrzuć apelację
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {view === 'audit' && (
                <div className="flex flex-col gap-3 fade-in">
                    {auditEntries.length === 0 ? (
                        <div className="text-center text-gray-500 mt-6 p-8 border border-gray-800 border-dashed rounded-2xl">
                            <ScrollText size={40} className="mx-auto mb-3 opacity-20" />
                            Brak wpisów audit logu.
                        </div>
                    ) : (
                        auditEntries.map(entry => (
                            <div key={entry.id} className="bg-surface border border-gray-800 rounded-xl p-4">
                                <div className="flex items-start justify-between gap-4 mb-2">
                                    <div>
                                        <div className="text-sm font-bold text-white uppercase">{entry.action_type.replaceAll('_', ' ')}</div>
                                        <div className="text-[10px] text-gray-500 uppercase mt-1">
                                            {entry.actor?.full_name || 'System'} → {entry.target?.full_name || 'Obiekt systemowy'}
                                        </div>
                                    </div>
                                    <div className="text-[10px] text-gray-500">{new Date(entry.created_at).toLocaleString()}</div>
                                </div>

                                {entry.reason && (
                                    <div className="text-sm text-gray-300 mb-2">{entry.reason}</div>
                                )}

                                {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                                    <pre className="text-[10px] text-gray-400 bg-background border border-gray-800 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(entry.metadata, null, 2)}</pre>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Widok: Zgłoszenia */}
            {view === 'reports' && (
                <div className="flex flex-col gap-3 fade-in">
                    <div className="flex bg-surface border border-gray-800 rounded-xl p-2 mb-1 max-w-lg">
                        <input
                            type="text"
                            placeholder="Filtruj tickety po zgłaszającym, typie i powodzie..."
                            value={reportSearch}
                            onChange={event => setReportSearch(event.target.value)}
                            className="bg-transparent text-white pl-2 outline-none w-full text-sm font-bold"
                        />
                        <button className="p-2 text-gray-400"><Search size={18} /></button>
                    </div>
                    {reports.length === 0 ? (
                        <div className="text-center text-gray-500 mt-6 p-8 border border-gray-800 border-dashed rounded-2xl">
                            <AlertOctagon size={40} className="mx-auto mb-3 opacity-20" />
                            Szkoła jest czysta. Brak otwartych ticketów z incydentami.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {filteredReports.map(r => (
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
                                                {(() => {
                                                    const context = typeof r.context === 'string' ? (() => {
                                                        try { return JSON.parse(r.context) } catch { return null }
                                                    })() : r.context

                                                    if (!context) {
                                                        return <div className="text-[10px] text-gray-500 italic">Brak dostępnego kontekstu</div>
                                                    }

                                                    const relatedMessages = Array.isArray(context)
                                                        ? context
                                                        : (Array.isArray(context.related_message_ids) ? context.related_message_ids.map(id => ({ id })) : [])

                                                    return (
                                                        <div className="flex flex-col gap-1.5">
                                                            {context.details ? (
                                                                <div className="text-[11px] text-red-200 bg-red-500/10 border border-red-500/20 rounded p-2 whitespace-pre-wrap">
                                                                    {context.details}
                                                                </div>
                                                            ) : null}
                                                            {relatedMessages.length > 0 ? relatedMessages.map((ctx, i) => (
                                                                <div key={`${ctx.id || i}-${i}`} className="text-[10px] leading-tight bg-background/70 p-1 rounded">
                                                                    <span className="font-bold text-gray-300">Msg ID: </span>
                                                                    <span className="text-gray-400">{ctx.id || ctx}</span>
                                                                </div>
                                                            )) : (
                                                                <div className="text-[10px] text-gray-500 italic">Brak załączonych wiadomości kontekstowych</div>
                                                            )}
                                                        </div>
                                                    )
                                                })()}
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

            {/* Widok: Logi błędów */}
            {view === 'logs' && (
                <div className="flex flex-col gap-4 fade-in px-2">
                    <div className="bg-surface border border-gray-800 rounded-2xl p-5">
                        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                            <Bug size={16} className="text-red-500" />
                            Logi błędów aplikacji
                            {logsTotal > 0 && (
                                <span className="text-[10px] text-gray-500 font-normal ml-1">
                                    (łącznie {logsTotal})
                                </span>
                            )}
                        </h3>

                        {logsLoading ? (
                            <div className="flex items-center justify-center py-16">
                                <Loader2 size={24} className="animate-spin text-red-500" />
                            </div>
                        ) : errorLogs.length === 0 ? (
                            <div className="text-center text-gray-500 py-12 border border-dashed border-gray-800 rounded-xl">
                                <Bug size={36} className="mx-auto mb-3 opacity-20" />
                                Brak logów błędów do wyświetlenia.
                            </div>
                        ) : (
                            <>
                                {/* Tabela desktop */}
                                <div className="hidden lg:block overflow-x-auto">
                                    <div className="grid grid-cols-[80px_1.2fr_1.8fr_140px] gap-3 px-4 py-3 text-[10px] uppercase tracking-widest font-bold text-gray-500 border-b border-gray-800 bg-[#171717] rounded-t-xl">
                                        <span>Poziom</span>
                                        <span>Źródło</span>
                                        <span>Wiadomość</span>
                                        <span>Data</span>
                                    </div>
                                    <div className="max-h-[55vh] overflow-y-auto">
                                        {errorLogs.map((log, i) => {
                                            let levelColor = ''
                                            if (log.level === 'error' || log.level === 'critical') levelColor = 'text-red-400 bg-red-500/10 border-red-500/30'
                                            else if (log.level === 'warn' || log.level === 'warning') levelColor = 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                                            else levelColor = 'text-blue-400 bg-blue-500/10 border-blue-500/30'
                                            return (
                                                <div key={log.id || i} className="grid grid-cols-[80px_1.2fr_1.8fr_140px] gap-3 px-4 py-3 border-b border-gray-800/70 hover:bg-white/[0.02] items-center">
                                                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${levelColor} inline-block text-center`}>
                                                        {log.level}
                                                    </span>
                                                    <span className="text-xs text-gray-300 font-mono truncate">{log.source || '—'}</span>
                                                    <span className="text-xs text-gray-400 truncate" title={log.message}>{log.message}</span>
                                                    <span className="text-[10px] text-gray-500">{log.created_at ? new Date(log.created_at).toLocaleString() : '—'}</span>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>

                                {/* Karty mobile */}
                                <div className="lg:hidden grid grid-cols-1 gap-3">
                                    {errorLogs.map((log, i) => {
                                        let levelBadge = 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                                        if (log.level === 'error' || log.level === 'critical') levelBadge = 'bg-red-500/10 text-red-400 border-red-500/30'
                                        else if (log.level === 'warn' || log.level === 'warning') levelBadge = 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                        return (
                                            <div key={log.id || i} className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-4">
                                                <div className="flex justify-between items-start mb-2">
                                                    <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border ${levelBadge}`}>
                                                        {log.level}
                                                    </span>
                                                    <span className="text-[10px] text-gray-500">{log.created_at ? new Date(log.created_at).toLocaleString() : '—'}</span>
                                                </div>
                                                <div className="text-[11px] font-mono text-gray-400 truncate mb-1">{log.source || '—'}</div>
                                                <div className="text-xs text-gray-200 leading-relaxed">{log.message}</div>
                                            </div>
                                        )
                                    })}
                                </div>

                                {/* Paginacja */}
                                {logsTotal > LOGS_PER_PAGE && (
                                    <div className="flex items-center justify-between pt-3 border-t border-gray-800">
                                        <span className="text-[11px] text-gray-500">
                                            Strona {logsPage} z {Math.ceil(logsTotal / LOGS_PER_PAGE)}
                                        </span>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => fetchErrorLogs(logsPage - 1)}
                                                disabled={logsPage <= 1}
                                                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition ${logsPage <= 1 ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : 'bg-surface border border-gray-700 text-gray-300 hover:border-gray-500'}`}
                                            >
                                                <ChevronLeft size={14} /> Prev
                                            </button>
                                            <button
                                                onClick={() => fetchErrorLogs(logsPage + 1)}
                                                disabled={logsPage >= Math.ceil(logsTotal / LOGS_PER_PAGE)}
                                                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition ${logsPage >= Math.ceil(logsTotal / LOGS_PER_PAGE) ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : 'bg-surface border border-gray-700 text-gray-300 hover:border-gray-500'}`}
                                            >
                                                Next <ChevronRight size={14} />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
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
                                            ZATWIERDŹ
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
                </div>
            </div>
        </div>
    )
}
