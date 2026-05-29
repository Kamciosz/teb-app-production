import React, { useEffect, useMemo, useState } from 'react'
import { ShieldAlert, Search, UserMinus, UserCheck, CheckCircle, XCircle, AlertOctagon, Hash, Trash2, Loader2, Scale, ScrollText, BarChart3, Bug, Activity, ChevronLeft, ChevronRight, Mail, X, Clock, ExternalLink, Send, Server, Wifi, AlertTriangle } from 'lucide-react'
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
    const [editingGroupId, setEditingGroupId] = useState(null)
    const [editGroupName, setEditGroupName] = useState('')
    const [editGroupDesc, setEditGroupDesc] = useState('')
    const [groupSearch, setGroupSearch] = useState('')
    const [groupsFilter, setGroupsFilter] = useState('all') // 'all', 'pending', 'approved'

    // --- Dashboard & Logs state ---
    const [dashboardStats, setDashboardStats] = useState(null)
    const [dashboardLoading, setDashboardLoading] = useState(false)
    const [resendingEmail, setResendingEmail] = useState(null) // email string or null
    const [resendMessage, setResendMessage] = useState('')
    const [errorLogs, setErrorLogs] = useState([])
    const [logsLoading, setLogsLoading] = useState(false)
    const [logsPage, setLogsPage] = useState(1)
    const [logsTotal, setLogsTotal] = useState(0)
    const LOGS_PER_PAGE = 20

    // --- System health check state ---
    const [healthStatus, setHealthStatus] = useState(null)
    const [healthLoading, setHealthLoading] = useState(false)
    const [healthLastUpdate, setHealthLastUpdate] = useState(null)
    const [testEmail, setTestEmail] = useState('')
    const [testEmailLoading, setTestEmailLoading] = useState(false)
    const [testEmailResult, setTestEmailResult] = useState(null)
    const [systemLogs, setSystemLogs] = useState([])
    const [systemLogsLoading, setSystemLogsLoading] = useState(false)

    // --- User details modal state ---
    const [selectedUserId, setSelectedUserId] = useState(null)
    const [showUserModal, setShowUserModal] = useState(false)
    const [selectedUserDetails, setSelectedUserDetails] = useState(null)
    const [fetchingDetails, setFetchingDetails] = useState(false)
    const [modalBanDuration, setModalBanDuration] = useState('1440')

    const ROLES = ['student', 'teacher', 'admin', 'editor', 'moderator_content', 'moderator_users', 'su_member']

    useEffect(() => {
        checkAccessAndFetch()
    }, [])

    useEffect(() => {
        if (myRoles.length === 0) return
        fetchViewData(view, myRoles)

        // Fetch dashboard / logs / health on tab switch
        if (view === 'dashboard') fetchDashboardStats()
        if (view === 'logs') fetchErrorLogs(1)
        if (view === 'system') {
            fetchHealthStatus()
            fetchSystemLogs()
        }
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

    async function handleResendConfirmation(email) {
        setResendingEmail(email)
        setResendMessage('')
        try {
            const res = await fetch('/api/auth/resend-confirmation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            })
            const data = await res.json()
            if (res.ok) {
                setResendMessage(`✅ Wysłano ponownie na ${email}`)
            } else {
                setResendMessage(`❌ ${data.error || 'Błąd wysyłania'}`)
            }
        } catch (err) {
            setResendMessage(`❌ Błąd sieci: ${err.message}`)
        } finally {
            setResendingEmail(null)
            setTimeout(() => setResendMessage(''), 4000)
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

    async function fetchHealthStatus() {
        setHealthLoading(true)
        try {
            const res = await fetch('/api/health')
            const data = await res.json()
            setHealthStatus(data)
        } catch {
            setHealthStatus(null)
        } finally {
            setHealthLoading(false)
            setHealthLastUpdate(new Date().toISOString())
        }
    }

    async function handleSendTestEmail() {
        if (!testEmail.trim()) {
            alert('Podaj adres email do testu.')
            return
        }
        setTestEmailLoading(true)
        setTestEmailResult(null)
        try {
            const res = await fetch(`/api/health?send=true&to=${encodeURIComponent(testEmail.trim())}`)
            const data = await res.json()
            setTestEmailResult(data)
        } catch (err) {
            setTestEmailResult({ error: err.message })
        } finally {
            setTestEmailLoading(false)
        }
    }

    async function fetchSystemLogs() {
        setSystemLogsLoading(true)
        try {
            const res = await fetch('/api/logs?limit=10')
            const data = await res.json()
            setSystemLogs(data.logs || [])
        } catch {
            setSystemLogs([])
        } finally {
            setSystemLogsLoading(false)
        }
    }

    async function fetchViewData(targetView, roles) {
        const canManageUsers = roles.includes('admin') || roles.includes('moderator_users')
        const canManageContent = roles.includes('admin') || roles.includes('moderator_content')
        const canOpenAudit = canManageUsers || canManageContent

        if (targetView === 'users' && canManageUsers) {
            const primaryUsers = await supabase
                .from('profiles')
                .select('id, full_name, roles, role, is_banned, banned_until, created_at')
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
                    setUsers(fallbackUsers.data || [])
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
                .order('created_at', { ascending: false })
                .limit(100)
            if (data) {
                // Fetch member counts for each group
                const groupsWithCounts = await Promise.all(data.map(async (g) => {
                    const { count } = await supabase.from('group_members')
                        .select('*', { count: 'exact', head: true })
                        .eq('group_id', g.id)
                    return { ...g, member_count: count || 0 }
                }))
                setPendingGroups(groupsWithCounts)
            }
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
            banned_until: banUntil
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
                banned_until: banUntil
            }
        }))
    }

    async function openUserModal(user) {
        setSelectedUserId(user.id)
        setShowUserModal(true)
        setFetchingDetails(true)
        setSelectedUserDetails(null)
        setModalBanDuration('1440')

        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, full_name, email, roles, role, is_banned, banned_until, created_at')
                .eq('id', user.id)
                .single()

            if (error) {
                console.error('Error fetching user details:', error)
                setSelectedUserDetails(user)
            } else {
                setSelectedUserDetails(data)
            }
        } catch (err) {
            console.error('Error:', err)
            setSelectedUserDetails(user)
        } finally {
            setFetchingDetails(false)
        }
    }

    function closeUserModal() {
        setShowUserModal(false)
        setSelectedUserId(null)
        setSelectedUserDetails(null)
    }

    // Handle Escape key to close modal
    useEffect(() => {
        function handleKeyDown(e) {
            if (e.key === 'Escape') closeUserModal()
        }
        if (showUserModal) {
            document.addEventListener('keydown', handleKeyDown)
            return () => document.removeEventListener('keydown', handleKeyDown)
        }
    }, [showUserModal])

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

    async function handleGroupDelete(groupId) {
        if (!window.confirm('Czy na pewno chcesz USUNĄĆ tę grupę? Wiadomości i członkowie zostaną usunięci.')) return
        const { error } = await supabase.from('groups').delete().eq('id', groupId)
        if (error) {
            alert(`Nie udało się usunąć grupy: ${error.message}`)
            return
        }
        setPendingGroups(prev => prev.filter(group => group.id !== groupId))
    }

    function startGroupEdit(group) {
        setEditingGroupId(group.id)
        setEditGroupName(group.name)
        setEditGroupDesc(group.description || '')
    }

    function cancelGroupEdit() {
        setEditingGroupId(null)
        setEditGroupName('')
        setEditGroupDesc('')
    }

    async function handleGroupSave(groupId) {
        if (!editGroupName.trim()) {
            alert('Nazwa grupy nie może być pusta.')
            return
        }
        const { error } = await supabase.from('groups').update({
            name: editGroupName.trim(),
            description: editGroupDesc.trim()
        }).eq('id', groupId)
        if (error) {
            alert(`Nie udało się zapisać zmian: ${error.message}`)
            return
        }
        setPendingGroups(prev => prev.map(g =>
            g.id === groupId ? { ...g, name: editGroupName.trim(), description: editGroupDesc.trim() } : g
        ))
        cancelGroupEdit()
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

    const filteredGroups = useMemo(() => {
        const q = sanitizePlainText(groupSearch, { maxLength: 80 }).toLowerCase()
        let list = pendingGroups
        if (groupsFilter === 'pending') list = list.filter(g => !g.is_approved)
        if (groupsFilter === 'approved') list = list.filter(g => g.is_approved)
        if (!q) return list
        return list.filter(g => {
            return (g.name || '').toLowerCase().includes(q)
                || (g.description || '').toLowerCase().includes(q)
                || (g.creator?.full_name || '').toLowerCase().includes(q)
        })
    }, [pendingGroups, groupSearch, groupsFilter])

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
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
                                <div className="bg-surface border border-gray-800 rounded-2xl p-4 sm:p-5">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-500 flex items-center justify-center">
                                            <UserCheck size={20} />
                                        </div>
                                        <span className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Total Users</span>
                                    </div>
                                    <div className="text-2xl sm:text-3xl font-black text-white">{dashboardStats.total_users ?? '—'}</div>
                                </div>
                                <div className="bg-surface border border-gray-800 rounded-2xl p-4 sm:p-5">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-10 h-10 rounded-xl bg-green-500/20 text-green-500 flex items-center justify-center">
                                            <CheckCircle size={20} />
                                        </div>
                                        <span className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Confirmed</span>
                                    </div>
                                    <div className="text-2xl sm:text-3xl font-black text-white">{dashboardStats.confirmed_users ?? '—'}</div>
                                </div>
                                <div className="bg-surface border border-gray-800 rounded-2xl p-4 sm:p-5">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-10 h-10 rounded-xl bg-red-500/20 text-red-500 flex items-center justify-center">
                                            <XCircle size={20} />
                                        </div>
                                        <span className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Niepotwierdzone</span>
                                    </div>
                                    <div className="text-2xl sm:text-3xl font-black text-white">{dashboardStats.unconfirmed_users ?? '—'}</div>
                                </div>
                                <div className="bg-surface border border-gray-800 rounded-2xl p-4 sm:p-5">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center">
                                            <Activity size={20} />
                                        </div>
                                        <span className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Ostatnie 24h</span>
                                    </div>
                                    <div className="text-2xl sm:text-3xl font-black text-white">{dashboardStats.users_last_24h ?? '—'}</div>
                                </div>
                                <div className="bg-surface border border-gray-800 rounded-2xl p-4 sm:p-5">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-500 flex items-center justify-center">
                                            <Send size={20} />
                                        </div>
                                        <span className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Emaili dziś</span>
                                    </div>
                                    <div className="text-2xl sm:text-3xl font-black text-white">{dashboardStats.emails_sent_today ?? '—'}</div>
                                </div>
                            </div>

                            {/* Wykresy - równoległe */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Wykres 7-dniowy: rejestracje */}
                                <div className="bg-surface border border-gray-800 rounded-2xl p-5">
                                    <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                                        <BarChart3 size={16} className="text-red-500" />
                                        Rejestracje w ostatnich 7 dniach
                                    </h3>
                                    {dashboardStats.users_by_day && dashboardStats.users_by_day.length > 0 ? (
                                        <div className="flex items-end gap-2 h-28">
                                            {dashboardStats.users_by_day.map((day, i) => {
                                                const allCounts = dashboardStats.users_by_day.map(d => d.count)
                                                const maxVal = Math.max(...allCounts, 1)
                                                const heightPct = (day.count / maxVal) * 100
                                                const label = day.date ? day.date.slice(5) : ''
                                                return (
                                                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                                        <span className="text-[9px] text-gray-500 font-bold">{day.count}</span>
                                                        <div
                                                            className="w-full rounded-md bg-gradient-to-t from-red-600 to-red-400 transition-all hover:opacity-80"
                                                            style={{ height: `${Math.max(heightPct, 2)}%` }}
                                                            title={`${day.date}: ${day.count} rejestracji`}
                                                        />
                                                        <span className="text-[8px] text-gray-600 uppercase">{label}</span>
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

                                {/* Wykres 7-dniowy: rejestracje vs potwierdzenia */}
                                <div className="bg-surface border border-gray-800 rounded-2xl p-5">
                                    <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                                        <CheckCircle size={16} className="text-blue-500" />
                                        Rejestracje vs Potwierdzenia
                                    </h3>
                                    {dashboardStats.unconfirmed_users !== undefined ? (
                                        <div className="flex flex-col gap-4">
                                            {/* Wizualizacja procentowa */}
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs text-gray-500 font-bold w-20 shrink-0">Potwierdzone</span>
                                                <div className="flex-1 bg-gray-800 rounded-full h-4 overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all"
                                                        style={{ width: `${dashboardStats.total_users > 0 ? (dashboardStats.confirmed_users / dashboardStats.total_users) * 100 : 0}%` }}
                                                    />
                                                </div>
                                                <span className="text-xs text-green-400 font-bold w-12 text-right">{dashboardStats.total_users > 0 ? Math.round((dashboardStats.confirmed_users / dashboardStats.total_users) * 100) : 0}%</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs text-gray-500 font-bold w-20 shrink-0">Niepotwierdzone</span>
                                                <div className="flex-1 bg-gray-800 rounded-full h-4 overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full bg-gradient-to-r from-red-500 to-red-400 transition-all"
                                                        style={{ width: `${dashboardStats.total_users > 0 ? (dashboardStats.unconfirmed_users / dashboardStats.total_users) * 100 : 0}%` }}
                                                    />
                                                </div>
                                                <span className="text-xs text-red-400 font-bold w-12 text-right">{dashboardStats.total_users > 0 ? Math.round((dashboardStats.unconfirmed_users / dashboardStats.total_users) * 100) : 0}%</span>
                                            </div>
                                            {/* Liczby bezwzględne */}
                                            <div className="flex gap-4 mt-2">
                                                <div className="flex-1 bg-green-500/10 border border-green-500/30 rounded-xl p-3 text-center">
                                                    <div className="text-lg font-black text-green-400">{dashboardStats.confirmed_users ?? 0}</div>
                                                    <div className="text-[9px] uppercase tracking-widest text-gray-500 font-bold mt-1">Potwierdzone</div>
                                                </div>
                                                <div className="flex-1 bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-center">
                                                    <div className="text-lg font-black text-red-400">{dashboardStats.unconfirmed_users ?? 0}</div>
                                                    <div className="text-[9px] uppercase tracking-widest text-gray-500 font-bold mt-1">Niepotwierdzone</div>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center text-gray-500 text-sm py-8 border border-dashed border-gray-800 rounded-xl">
                                            Brak danych.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Ostatnie rejestracje */}
                            <div className="bg-surface border border-gray-800 rounded-2xl p-5">
                                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                                    <Mail size={16} className="text-purple-500" />
                                    Ostatnie rejestracje
                                    {dashboardStats.unconfirmed_list && dashboardStats.unconfirmed_list.length > 0 && (
                                        <span className="ml-auto text-[10px] uppercase tracking-widest font-bold text-red-400">
                                            {dashboardStats.unconfirmed_list.length} niepotwierdzonych
                                        </span>
                                    )}
                                </h3>
                                {resendMessage && (
                                    <div className="mb-3 text-xs text-gray-300 bg-gray-800/50 rounded-lg px-3 py-2 border border-gray-700">
                                        {resendMessage}
                                    </div>
                                )}
                                {dashboardStats.unconfirmed_list && dashboardStats.unconfirmed_list.length > 0 ? (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="border-b border-gray-800">
                                                    <th className="text-left py-2 px-2 text-gray-500 uppercase tracking-widest font-bold">Email</th>
                                                    <th className="text-left py-2 px-2 text-gray-500 uppercase tracking-widest font-bold hidden sm:table-cell">Data rejestracji</th>
                                                    <th className="text-right py-2 px-2 text-gray-500 uppercase tracking-widest font-bold">Akcja</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {dashboardStats.unconfirmed_list.map((u, i) => (
                                                    <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition">
                                                        <td className="py-2.5 px-2 text-gray-300 font-medium truncate max-w-[200px] sm:max-w-none">
                                                            {u.email}
                                                        </td>
                                                        <td className="py-2.5 px-2 text-gray-500 hidden sm:table-cell">
                                                            {u.created_at ? new Date(u.created_at).toLocaleDateString('pl-PL', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                                                        </td>
                                                        <td className="py-2.5 px-2 text-right">
                                                            <button
                                                                onClick={() => handleResendConfirmation(u.email)}
                                                                disabled={resendingEmail === u.email}
                                                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/30 text-[10px] font-bold hover:bg-blue-500/20 transition disabled:opacity-50"
                                                            >
                                                                {resendingEmail === u.email ? (
                                                                    <Loader2 size={12} className="animate-spin" />
                                                                ) : (
                                                                    <Send size={12} />
                                                                )}
                                                                Wyślij ponownie
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="text-center text-gray-500 text-sm py-8 border border-dashed border-gray-800 rounded-xl">
                                        <Mail size={32} className="mx-auto mb-2 opacity-20" />
                                        Wszystkie konta są potwierdzone.
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

            {/* Widok: System */}
            {view === 'system' && (
                <div className="flex flex-col gap-6 fade-in px-2">
                    {/* ---- Panel: Śmieciarka ---- */}
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

                    {/* ---- Panel: Status systemu ---- */}
                    <div className="bg-surface border border-gray-800 p-6 rounded-2xl shadow-xl">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="w-14 h-14 rounded-2xl bg-blue-500/20 text-[#006DAE] flex items-center justify-center shadow-[0_0_20px_rgba(0,109,174,0.2)]">
                                <Server size={30} />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-white">Status systemu</h3>
                                <p className="text-xs text-gray-500 uppercase font-bold tracking-widest mt-1">Diagnostyka połączeń</p>
                            </div>
                        </div>

                        {healthLoading ? (
                            <div className="flex items-center justify-center py-8 text-gray-500">
                                <Loader2 size={24} className="animate-spin mr-3" /> Sprawdzanie statusu...
                            </div>
                        ) : !healthStatus ? (
                            <div className="text-center text-gray-500 py-8 border border-dashed border-gray-800 rounded-xl">
                                <Server size={32} className="mx-auto mb-2 opacity-30" />
                                <p className="text-sm">Nie można pobrać statusu systemu.</p>
                                <button onClick={fetchHealthStatus} className="mt-3 px-4 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-xs font-bold text-gray-300 hover:border-gray-500 transition">
                                    Spróbuj ponownie
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-3">
                                {/* SMTP */}
                                <div className="bg-[#171717] border border-gray-800 rounded-xl p-4 flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${healthStatus.checks?.smtp?.status === 'ok' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                        <Mail size={22} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-white">SMTP</span>
                                            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${healthStatus.checks?.smtp?.status === 'ok' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                                                {healthStatus.checks?.smtp?.status === 'ok' ? 'Online' : 'Offline'}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-gray-500 mt-1 truncate">{healthStatus.checks?.smtp?.detail || '—'}</p>
                                    </div>
                                </div>

                                {/* Supabase */}
                                <div className="bg-[#171717] border border-gray-800 rounded-xl p-4 flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${healthStatus.checks?.supabase?.status === 'ok' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                        <Wifi size={22} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-white">Supabase</span>
                                            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${healthStatus.checks?.supabase?.status === 'ok' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                                                {healthStatus.checks?.supabase?.status === 'ok' ? 'Online' : 'Offline'}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-gray-500 mt-1 truncate">{healthStatus.checks?.supabase?.detail || '—'}</p>
                                    </div>
                                </div>

                                {/* API */}
                                <div className="bg-[#171717] border border-gray-800 rounded-xl p-4 flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-green-500/20 text-green-400 flex items-center justify-center shrink-0">
                                        <Activity size={22} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-white">API</span>
                                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 border border-green-500/30">
                                                Online
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-gray-500 mt-1 truncate">Serwer API działa prawidłowo</p>
                                    </div>
                                </div>

                                {/* Ostatnia aktualizacja */}
                                <div className="bg-[#171717] border border-gray-800 rounded-xl p-4 flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-gray-500/20 text-gray-400 flex items-center justify-center shrink-0">
                                        <Clock size={22} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <span className="text-sm font-bold text-white">Ostatnia aktualizacja</span>
                                        <p className="text-[11px] text-gray-500 mt-1">
                                            {healthLastUpdate ? new Date(healthLastUpdate).toLocaleString() : '—'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        <button
                            onClick={fetchHealthStatus}
                            disabled={healthLoading}
                            className="mt-4 w-full py-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 bg-[#006DAE]/20 text-[#006DAE] border border-[#006DAE]/30 hover:bg-[#006DAE]/30 active:scale-95"
                        >
                            <Loader2 size={16} className={`${healthLoading ? 'animate-spin' : 'hidden'}`} />
                            Odśwież status
                        </button>
                    </div>

                    {/* ---- Panel: Testuj email ---- */}
                    <div className="bg-surface border border-gray-800 p-6 rounded-2xl shadow-xl">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="w-14 h-14 rounded-2xl bg-blue-500/20 text-[#006DAE] flex items-center justify-center shadow-[0_0_20px_rgba(0,109,174,0.2)]">
                                <Mail size={30} />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-white">Testuj email</h3>
                                <p className="text-xs text-gray-500 uppercase font-bold tracking-widest mt-1">Wyślij testową wiadomość</p>
                            </div>
                        </div>

                        <div className="bg-[#171717] border border-gray-800 rounded-xl p-4">
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">
                                Adres email odbiorcy
                            </label>
                            <input
                                type="email"
                                value={testEmail}
                                onChange={e => setTestEmail(e.target.value)}
                                placeholder="admin@example.com"
                                className="w-full bg-[#1a1a1a] border border-gray-700 rounded-lg px-4 py-3 text-sm text-white outline-none focus:border-[#006DAE] transition placeholder:text-gray-600"
                            />
                            <button
                                onClick={handleSendTestEmail}
                                disabled={testEmailLoading || !testEmail.trim()}
                                className={`mt-3 w-full py-3 rounded-xl font-bold text-sm transition flex items-center justify-center gap-2 shadow-lg ${testEmailLoading || !testEmail.trim() ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-[#006DAE] text-white hover:bg-[#005a94] active:scale-95 shadow-[#006DAE]/20'}`}
                            >
                                {testEmailLoading ? (
                                    <><Loader2 size={18} className="animate-spin" /> Wysyłanie...</>
                                ) : (
                                    <><Send size={18} /> Wyślij test</>
                                )}
                            </button>
                        </div>

                        {testEmailResult && (
                            <div className={`mt-4 p-4 rounded-xl border text-sm ${testEmailResult.error ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-green-500/10 border-green-500/30 text-green-400'}`}>
                                <div className="flex items-center gap-2 font-bold mb-2">
                                    {testEmailResult.error ? <XCircle size={16} /> : <CheckCircle size={16} />}
                                    {testEmailResult.error ? 'Błąd wysyłania:' : 'Email wysłany pomyślnie'}
                                </div>
                                {testEmailResult.error ? (
                                    <p className="text-xs text-gray-400">{testEmailResult.error}</p>
                                ) : (
                                    <div className="space-y-1 text-xs text-gray-400">
                                        {testEmailResult.messageId && (
                                            <div className="flex justify-between">
                                                <span>Message ID:</span>
                                                <span className="text-white font-mono truncate max-w-[200px]">{testEmailResult.messageId}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between">
                                            <span>Accepted:</span>
                                            <span className="text-green-400 font-bold">{testEmailResult.accepted ? testEmailResult.accepted.length : 0}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Rejected:</span>
                                            <span className={testEmailResult.rejected && testEmailResult.rejected.length > 0 ? 'text-red-400 font-bold' : 'text-green-400 font-bold'}>
                                                {testEmailResult.rejected ? testEmailResult.rejected.length : 0}
                                            </span>
                                        </div>
                                        {testEmailResult.accepted && testEmailResult.accepted.length > 0 && (
                                            <div className="pt-1 border-t border-gray-700 mt-1">
                                                <span className="text-gray-500">Do:</span>
                                                <span className="text-white ml-1">{testEmailResult.accepted.join(', ')}</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ---- Panel: Ostatnie błędy ---- */}
                    <div className="bg-surface border border-gray-800 p-6 rounded-2xl shadow-xl">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-500 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.2)]">
                                <AlertTriangle size={30} />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-white">Ostatnie błędy</h3>
                                <p className="text-xs text-gray-500 uppercase font-bold tracking-widest mt-1">Ostatnie 10 wpisów z logów</p>
                            </div>
                        </div>

                        {systemLogsLoading ? (
                            <div className="flex items-center justify-center py-8 text-gray-500">
                                <Loader2 size={24} className="animate-spin mr-3" /> Ładowanie logów...
                            </div>
                        ) : systemLogs.length === 0 ? (
                            <div className="text-center text-gray-500 py-8 border border-dashed border-gray-800 rounded-xl">
                                <AlertTriangle size={32} className="mx-auto mb-2 opacity-30" />
                                <p className="text-sm">Brak wpisów w logach.</p>
                                <button onClick={fetchSystemLogs} className="mt-3 px-4 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-xs font-bold text-gray-300 hover:border-gray-500 transition">
                                    Odśwież
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {/* Nagłówek tabeli - desktop */}
                                <div className="hidden lg:grid grid-cols-[auto_auto_1fr_auto] gap-3 px-4 py-2 text-[10px] text-gray-500 uppercase font-bold tracking-wider border-b border-gray-800">
                                    <span>Data</span>
                                    <span>Poziom</span>
                                    <span>Źródło</span>
                                    <span>Wiadomość</span>
                                </div>

                                {/* Wiersze */}
                                {systemLogs.map((log, i) => {
                                    let levelColor = 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                                    if (log.level === 'error' || log.level === 'critical') levelColor = 'bg-[#C8102E]/10 text-[#C8102E] border-[#C8102E]/30'
                                    else if (log.level === 'warn' || log.level === 'warning') levelColor = 'bg-amber-500/10 text-amber-400 border-amber-500/30'

                                    return (
                                        <div key={log.id || i} className="bg-[#171717] border border-gray-800 rounded-xl p-3">
                                            {/* Desktop */}
                                            <div className="hidden lg:grid grid-cols-[auto_auto_1fr_auto] gap-3 items-center">
                                                <span className="text-[11px] text-gray-500 whitespace-nowrap">
                                                    {log.created_at ? new Date(log.created_at).toLocaleString() : '—'}
                                                </span>
                                                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${levelColor} inline-block text-center`}>
                                                    {log.level}
                                                </span>
                                                <span className="text-xs text-gray-300 font-mono truncate">{log.source || '—'}</span>
                                                <span className="text-xs text-gray-400 truncate max-w-[200px]" title={log.message}>{log.message}</span>
                                            </div>
                                            {/* Mobile */}
                                            <div className="lg:hidden flex flex-col gap-1">
                                                <div className="flex justify-between items-center">
                                                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${levelColor}`}>
                                                        {log.level}
                                                    </span>
                                                    <span className="text-[10px] text-gray-500">
                                                        {log.created_at ? new Date(log.created_at).toLocaleString() : '—'}
                                                    </span>
                                                </div>
                                                <span className="text-[11px] font-mono text-gray-400 truncate">{log.source || '—'}</span>
                                                <span className="text-xs text-gray-200 leading-relaxed">{log.message}</span>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}

                        <button
                            onClick={fetchSystemLogs}
                            disabled={systemLogsLoading}
                            className="mt-4 w-full py-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 bg-gray-800 text-gray-400 hover:bg-gray-700 active:scale-95 border border-gray-700"
                        >
                            <Loader2 size={16} className={`${systemLogsLoading ? 'animate-spin' : 'hidden'}`} />
                            Odśwież logi
                        </button>
                    </div>
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
                                        <div className="cursor-pointer" onClick={() => openUserModal(u)}>
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
                                            <button
                                                onClick={() => openUserModal(u)}
                                                className="px-2 py-1.5 rounded text-[9px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20 transition"
                                                title="Szczegóły użytkownika"
                                            >
                                                Szczegóły
                                            </button>
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
                                <div className="flex justify-between items-start cursor-pointer" onClick={() => openUserModal(u)}>
                                    <div>
                                        <div className={`font-bold text-sm ${u.is_banned ? 'text-red-500' : 'text-white'}`}>
                                            {u.full_name}
                                            {u.is_banned && <span className="text-[10px] ml-2 px-1 bg-red-500 text-white rounded">ZBANOWANY</span>}
                                        </div>
                                        <div className="text-[10px] text-gray-500 font-mono mt-0.5">ID: {u.id?.slice(0, 8)}...</div>
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

            {/* Modal szczegółów użytkownika */}
            {showUserModal && (
                <div
                    className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 backdrop-blur-sm pt-4 pb-8 px-2 sm:px-4"
                    onClick={(e) => { if (e.target === e.currentTarget) closeUserModal() }}
                >
                    <div className="relative w-full max-w-lg my-auto bg-gradient-to-b from-[#1e1e1e] to-[#171717] border border-gray-700/80 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-gray-800">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                                    <UserCheck size={16} className="text-blue-400" />
                                </div>
                                <h3 className="text-sm font-bold text-white">Szczegóły użytkownika</h3>
                            </div>
                            <button
                                onClick={closeUserModal}
                                className="w-8 h-8 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 flex items-center justify-center text-gray-400 hover:text-white transition"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Content */}
                        {fetchingDetails ? (
                            <div className="flex items-center justify-center py-16">
                                <Loader2 size={28} className="animate-spin text-blue-400" />
                            </div>
                        ) : selectedUserDetails ? (
                            <div className="p-4 space-y-4 overflow-y-auto max-h-[70vh]">
                                {/* User info */}
                                <div className="bg-black/20 rounded-xl p-4 border border-gray-800/50 space-y-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                                            {(selectedUserDetails.full_name || '?').charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold text-white text-base truncate">{selectedUserDetails.full_name}</div>
                                            <div className="text-xs text-gray-400 truncate">{selectedUserDetails.email || 'Brak email'}</div>
                                        </div>
                                        <div className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${selectedUserDetails.is_banned ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-green-500/20 text-green-400 border border-green-500/30'}`}>
                                            {selectedUserDetails.is_banned ? 'ZBANOWANY' : 'AKTYWNY'}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div className="bg-black/30 rounded-lg p-2.5">
                                            <div className="text-gray-500 font-bold text-[10px] uppercase tracking-wider">ID</div>
                                            <div className="text-white font-mono text-[11px] mt-0.5 break-all">{selectedUserDetails.id}</div>
                                        </div>
                                        <div className="bg-black/30 rounded-lg p-2.5">
                                            <div className="text-gray-500 font-bold text-[10px] uppercase tracking-wider">Data rejestracji</div>
                                            <div className="text-white text-[11px] mt-0.5">
                                                {selectedUserDetails.created_at
                                                    ? new Date(selectedUserDetails.created_at).toLocaleDateString('pl-PL', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                                                    : 'Brak danych'}
                                            </div>
                                        </div>
                                    </div>

                                    {selectedUserDetails.banned_until && (
                                        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 flex items-center gap-2">
                                            <Clock size={14} className="text-red-400 shrink-0" />
                                            <span className="text-xs text-red-300">
                                                Ban do: {new Date(selectedUserDetails.banned_until).toLocaleString('pl-PL')}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Roles management */}
                                <div className="bg-black/20 rounded-xl p-4 border border-gray-800/50">
                                    <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-3">Zarządzanie rangami</div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {ROLES.map(rank => {
                                            const userRoles = selectedUserDetails.roles || [selectedUserDetails.role] || ['student']
                                            return (
                                                <button
                                                    key={rank}
                                                    onClick={() => toggleRank(selectedUserDetails.id, userRoles, rank)}
                                                    className={`text-[10px] px-3 py-1.5 rounded-lg border transition font-bold ${
                                                        userRoles.includes(rank)
                                                            ? 'bg-primary/20 border-primary text-primary'
                                                            : 'bg-[#121212] border-gray-800 text-gray-500 hover:border-gray-600'
                                                    }`}
                                                >
                                                    {rank}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>

                                {/* Ban controls */}
                                <div className="bg-black/20 rounded-xl p-4 border border-gray-800/50">
                                    <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-3">Kara / Ban</div>
                                    <div className="flex gap-2 items-center">
                                        <select
                                            className="bg-background border border-gray-700 rounded-lg text-xs text-gray-400 p-2 outline-none flex-1"
                                            value={modalBanDuration}
                                            onChange={(e) => setModalBanDuration(e.target.value)}
                                            disabled={selectedUserDetails.is_banned}
                                        >
                                            <option value="60">1 godzina</option>
                                            <option value="1440">24 godziny</option>
                                            <option value="4320">3 dni</option>
                                            <option value="10080">7 dni</option>
                                            <option value="52560000">Permanentny</option>
                                        </select>
                                        <button
                                            onClick={async () => {
                                                // Use modalBanDuration temporarily
                                                const savedDuration = banDuration
                                                setBanDuration(modalBanDuration)
                                                await handleBan(selectedUserDetails.id, selectedUserDetails.is_banned)
                                                setBanDuration(savedDuration)
                                                // Refresh details
                                                openUserModal(selectedUserDetails)
                                            }}
                                            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                                                selectedUserDetails.is_banned
                                                    ? 'bg-green-500/10 text-green-500 border border-green-500/30 hover:bg-green-500/20'
                                                    : 'bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500/20'
                                            }`}
                                        >
                                            {selectedUserDetails.is_banned ? <><UserCheck size={14} /> Odbanuj</> : <><UserMinus size={14} /> Zbanuj</>}
                                        </button>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex gap-2">
                                    <a
                                        href={`mailto:${selectedUserDetails.email || ''}`}
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20 transition text-xs font-bold"
                                    >
                                        <Mail size={14} /> Wyślij email
                                    </a>
                                    <button
                                        onClick={closeUserModal}
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gray-800/50 text-gray-400 border border-gray-700 hover:bg-gray-700/50 transition text-xs font-bold"
                                    >
                                        <X size={14} /> Zamknij
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center py-16 text-gray-500 text-sm">
                                Nie znaleziono danych użytkownika.
                            </div>
                        )}
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

            {/* Widok: Zarządzanie grupami (admin) */}
            {view === 'groups' && (
                <div className="flex flex-col gap-3 fade-in">
                    {/* Search + Filter */}
                    <div className="flex flex-col sm:flex-row gap-2">
                        <div className="flex bg-surface border border-gray-800 rounded-xl p-2 flex-1">
                            <input
                                type="text"
                                placeholder="Szukaj grupy po nazwie, opisie lub twórcy..."
                                value={groupSearch}
                                onChange={e => setGroupSearch(e.target.value)}
                                className="bg-transparent text-white pl-2 outline-none w-full text-sm font-bold"
                            />
                            <Search size={18} className="text-gray-400 self-center mr-1" />
                        </div>
                        <div className="flex gap-1">
                            {['all', 'pending', 'approved'].map(f => (
                                <button
                                    key={f}
                                    onClick={() => setGroupsFilter(f)}
                                    className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase transition ${groupsFilter === f ? 'bg-red-500 text-white' : 'bg-surface border border-gray-800 text-gray-400 hover:text-white'}`}
                                >
                                    {f === 'all' ? 'Wszystkie' : f === 'pending' ? 'Oczekujące' : 'Zatwierdzone'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-1">
                        <div className="bg-surface border border-gray-800 rounded-xl p-3">
                            <div className="text-[10px] uppercase text-gray-500 font-bold">Wszystkie</div>
                            <div className="text-xl font-black text-white mt-1">{pendingGroups.length}</div>
                        </div>
                        <div className="bg-surface border border-gray-800 rounded-xl p-3">
                            <div className="text-[10px] uppercase text-gray-500 font-bold">Filtrowane</div>
                            <div className="text-xl font-black text-primary mt-1">{filteredGroups.length}</div>
                        </div>
                        <div className="bg-surface border border-gray-800 rounded-xl p-3">
                            <div className="text-[10px] uppercase text-gray-500 font-bold">Zatwierdzone</div>
                            <div className="text-xl font-black text-green-400 mt-1">{pendingGroups.filter(g => g.is_approved).length}</div>
                        </div>
                        <div className="bg-surface border border-gray-800 rounded-xl p-3">
                            <div className="text-[10px] uppercase text-gray-500 font-bold">Oczekujące</div>
                            <div className="text-xl font-black text-yellow-400 mt-1">{pendingGroups.filter(g => !g.is_approved).length}</div>
                        </div>
                    </div>

                    {/* Groups list */}
                    {filteredGroups.length === 0 ? (
                        <div className="text-center text-gray-500 mt-6 p-8 border border-gray-800 border-dashed rounded-2xl">
                            <Hash size={40} className="mx-auto mb-3 opacity-20" />
                            {pendingGroups.length === 0 ? 'Brak grup w systemie.' : 'Żadne grupy nie pasują do filtra.'}
                        </div>
                    ) : (
                        filteredGroups.map(g => {
                            const isEditing = editingGroupId === g.id
                            const isPending = !g.is_approved
                            return (
                                <div key={g.id} className={`bg-surface border p-4 rounded-xl flex flex-col gap-3 ${isPending ? 'border-purple-500/30' : 'border-gray-800'}`}>
                                    {/* Header */}
                                    <div className="flex justify-between items-start gap-4">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isPending ? 'bg-purple-500/20 text-purple-500' : 'bg-green-500/20 text-green-500'}`}>
                                                <Hash size={16} />
                                            </div>
                                            <div className="min-w-0">
                                                {isEditing ? (
                                                    <input
                                                        type="text"
                                                        value={editGroupName}
                                                        onChange={e => setEditGroupName(e.target.value)}
                                                        className="bg-[#1a1a1a] border border-gray-700 rounded px-2 py-1 text-sm font-bold text-white w-full outline-none"
                                                        maxLength={120}
                                                        autoFocus
                                                    />
                                                ) : (
                                                    <div className="font-bold text-white text-sm leading-tight truncate">{g.name}</div>
                                                )}
                                                <div className="text-[10px] text-gray-500 mt-0.5">
                                                    Twórca: {g.creator?.full_name || 'Nieznany'} • Członkowie: {g.member_count || 0}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {isPending ? (
                                                <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">Oczekuje</span>
                                            ) : (
                                                <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-green-500/20 text-green-400 border border-green-500/30">Publiczna</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Description / Edit form */}
                                    {isEditing ? (
                                        <textarea
                                            value={editGroupDesc}
                                            onChange={e => setEditGroupDesc(e.target.value)}
                                            className="bg-[#1a1a1a] border border-gray-700 rounded-lg p-2 text-xs text-gray-300 w-full outline-none resize-none"
                                            rows={3}
                                            maxLength={1000}
                                        />
                                    ) : (
                                        <div className="text-xs text-gray-300 bg-[#1a1a1a] p-3 rounded-lg border border-gray-800">
                                            {g.description || <span className="text-gray-500 italic">Brak opisu</span>}
                                        </div>
                                    )}

                                    {/* Actions */}
                                    <div className="flex justify-between items-center mt-1 border-t border-gray-800 pt-3">
                                        {isEditing ? (
                                            <>
                                                <button
                                                    onClick={() => handleGroupDelete(g.id)}
                                                    className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/30 text-[10px] font-bold hover:bg-red-500/20 transition"
                                                >
                                                    <Trash2 size={12} className="inline mr-1" /> Usuń
                                                </button>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={cancelGroupEdit}
                                                        className="px-3 py-1.5 rounded-lg bg-surface border border-gray-700 text-gray-400 text-[10px] font-bold hover:border-gray-500 transition"
                                                    >
                                                        Anuluj
                                                    </button>
                                                    <button
                                                        onClick={() => handleGroupSave(g.id)}
                                                        className="px-4 py-1.5 rounded-lg bg-red-500 text-white text-[10px] font-bold hover:bg-red-600 transition shadow-lg shadow-red-500/20"
                                                    >
                                                        Zapisz
                                                    </button>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <span className="text-[10px] text-gray-500 font-bold uppercase">
                                                    ID: {String(g.id).slice(0, 8)}...
                                                </span>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleGroupDelete(g.id)}
                                                        className="w-8 h-8 rounded-lg bg-surface border border-red-500/50 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition"
                                                        title="Usuń grupę"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => startGroupEdit(g)}
                                                        className="px-3 py-1.5 rounded-lg bg-surface border border-gray-700 text-gray-400 text-[10px] font-bold hover:border-gray-500 transition"
                                                    >
                                                        Edytuj
                                                    </button>
                                                    {isPending ? (
                                                        <>
                                                            <button onClick={() => handleGroupApproval(g.id, false)} className="w-8 h-8 rounded-lg bg-surface border border-red-500/50 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition" title="Odrzuć">
                                                                <XCircle size={16} />
                                                            </button>
                                                            <button onClick={() => handleGroupApproval(g.id, true)} className="px-4 py-1.5 rounded-lg bg-green-500 text-white text-[10px] font-bold hover:bg-green-600 transition shadow-lg shadow-green-500/20">
                                                                Zatwierdź
                                                            </button>
                                                        </>
                                                    ) : null}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>
            )}
                </div>
            </div>
        </div>
    )
}
