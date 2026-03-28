import React, { useState, useEffect } from 'react'
import { User, LogOut, Settings, Award, Heart, Camera, Edit2, ShoppingBag, Eye, EyeOff, X, Shield, MessageCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase, signOut } from '../../services/supabase'
import MediaUploader from '../../components/common/MediaUploader'
import { ImageKitService } from '../../services/imageKitService'
import TebGabkiRanking from './TebGabkiRanking'

export default function Profile() {
    const MIN_APPEAL_LEN = 20

    const [profile, setProfile] = useState(null)
    const [isEditingName, setIsEditingName] = useState(false)
    const [newName, setNewName] = useState('')
    const [isStoreOpen, setIsStoreOpen] = useState(false)
    const [appeals, setAppeals] = useState([])
    const [moderationEvents, setModerationEvents] = useState([])
    const [appealMessage, setAppealMessage] = useState('')
    const [appealLoading, setAppealLoading] = useState(false)

    useEffect(() => {
        loadProfile()
    }, [])

    async function loadProfile() {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
            const { data } = await supabase
                .from('profiles')
                .select('id, full_name, avatar_url, roles, role, is_private, dm_friends_only, teb_gabki, is_banned, banned_until, ban_reason, created_at, updated_at')
                .eq('id', session.user.id)
                .single()
            if (data) {
                setProfile({ ...data, email: session.user.email })
                setNewName(data.full_name)
                fetchBadges(session.user.id)
                fetchAppeals(session.user.id)
                fetchModerationEvents(session.user.id)
            }
        }
    }

    async function fetchAppeals(uid) {
        const { data } = await supabase
            .from('punishment_appeals')
            .select('id, status, punishment_type, message, resolution_note, created_at, resolved_at, audit_log_id')
            .eq('appellant_user_id', uid)
            .order('created_at', { ascending: false })

        if (data) setAppeals(data)
    }

    async function fetchModerationEvents(uid) {
        const { data } = await supabase
            .from('moderation_audit_log')
            .select('id, action_type, reason, metadata, created_at, is_visible_to_target')
            .eq('target_user_id', uid)
            .order('created_at', { ascending: false })
            .limit(10)

        if (data) setModerationEvents(data)
    }

    async function fetchBadges(uid) {
        const { data } = await supabase.from('user_badges').select('badge_type').eq('user_id', uid)
        if (data) setProfile(prev => ({ ...prev, badges: data.map(b => b.badge_type) }))
    }

    const AVAILABLE_BADGES = [
        { id: 'pres_tech', label: 'Przewodniczący Tech', icon: '🎓', price: 500 },
        { id: 'pres_liceum', label: 'Przewodniczący Liceum', icon: '📚', price: 500 },
        { id: 'top_rich', label: 'Top Gąbka', icon: '💰', price: 1000 },
        { id: 'helper', label: 'Pomocna Dłoń', icon: '🤝', price: 200 },
        { id: 'beta_tester', label: 'Beta Tester', icon: '🧪', price: 0 }
    ]

    async function buyBadge(badgeId, price) {
        const { data: result, error } = await supabase.rpc('buy_badge', {
            p_badge_id: badgeId,
            p_price: price
        })
        if (error || !result?.success) {
            const msg = result?.error || error?.message || 'Błąd zakupu'
            if (msg === 'insufficient teb_gabki') alert('Nie masz wystarczającej liczby TebGąbek!')
            else if (msg === 'badge already owned') alert('Już posiadasz tę odznakę!')
            else alert('Błąd zakupu: ' + msg)
            return
        }
        alert('Zakupiono odznakę!')
        setProfile(prev => ({
            ...prev,
            teb_gabki: result.new_balance,
            badges: [...(prev.badges || []), badgeId]
        }))
    }

    async function updateAvatar(url) {
        if (profile.teb_gabki < 50) {
            alert("Zmiana awatara kosztuje 50 TebGąbek!")
            return
        }

        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        const { error } = await supabase.from('profiles')
            .update({
                avatar_url: url,
                teb_gabki: profile.teb_gabki - 50
            })
            .eq('id', session.user.id)

        if (error) {
            alert("Błąd: " + error.message)
        } else {
            setProfile(prev => ({ ...prev, avatar_url: url, teb_gabki: prev.teb_gabki - 50 }))
            setIsStoreOpen(false)
        }
    }

    async function handleNameChange() {
        if (!newName.trim()) return
        const { error } = await supabase.from('profiles').update({ full_name: newName }).eq('id', profile.id)
        if (!error) {
            setProfile(prev => ({ ...prev, full_name: newName }))
            setIsEditingName(false)
        }
    }

    async function togglePrivacy() {
        const newPrivacy = !profile.is_private
        const { error } = await supabase.from('profiles').update({ is_private: newPrivacy }).eq('id', profile.id)
        if (!error) setProfile(prev => ({ ...prev, is_private: newPrivacy }))
    }

    async function toggleDmPrivacy() {
        const newValue = !profile.dm_friends_only
        const { error } = await supabase
            .from('profiles')
            .update({ dm_friends_only: newValue })
            .eq('id', profile.id)

        if (!error) setProfile(prev => ({ ...prev, dm_friends_only: newValue }))
    }

    async function submitAppeal() {
        const activeBanEvent = moderationEvents.find(event => event.action_type === 'ban')
        if (!profile?.is_banned || !activeBanEvent) {
            alert('Brak aktywnej kary do odwołania.')
            return
        }

        const trimmed = appealMessage.trim()
        if (trimmed.length < MIN_APPEAL_LEN) {
            alert(`Apelacja musi mieć co najmniej ${MIN_APPEAL_LEN} znaków.`)
            return
        }

        setAppealLoading(true)
        const { error } = await supabase.from('punishment_appeals').insert([{
            appellant_user_id: profile.id,
            audit_log_id: activeBanEvent.id,
            punishment_type: 'ban',
            message: trimmed
        }])

        setAppealLoading(false)

        if (error) {
            alert(`Nie udało się wysłać apelacji: ${error.message}`)
            return
        }

        setAppealMessage('')
        await fetchAppeals(profile.id)
        await fetchModerationEvents(profile.id)
    }

    if (!profile) return <div className="text-center mt-10 text-gray-400">Ładowanie Profilu...</div>

    const pendingAppeal = appeals.find(appeal => appeal.status === 'pending')
    const activeBanEvent = moderationEvents.find(event => event.action_type === 'ban')

    return (
        <div className="pb-10 pt-2">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-primary">Twój Profil</h2>
                <button onClick={signOut} className="text-gray-500 hover:text-secondary"><LogOut size={24} /></button>
            </div>

            <div className="bg-surface border border-gray-800 relative p-6 rounded-xl flex flex-col items-center mb-6 overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary to-secondary"></div>
                <div className="absolute top-4 right-4">
                    <button onClick={togglePrivacy} className="text-gray-500 hover:text-white transition">
                        {profile.is_private ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                </div>

                <div className="relative group">
                    <div className="w-24 h-24 bg-gray-800 rounded-full flex items-center justify-center mb-4 border-4 border-background shadow-lg overflow-hidden">
                        {profile.avatar_url ? (
                            <img
                                src={ImageKitService.getOptimizedUrl(profile.avatar_url, 200, 70)}
                                alt="Avatar"
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <User size={40} className="text-gray-500" />
                        )}
                    </div>
                </div>

                {isEditingName ? (
                    <div className="flex gap-2 mb-2">
                        <input
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            className="bg-background border border-gray-700 rounded px-2 py-1 text-sm outline-none focus:border-primary"
                        />
                        <button onClick={handleNameChange} className="text-primary font-bold text-sm">OK</button>
                    </div>
                ) : (
                    <h3 className="font-bold text-xl text-white flex items-center gap-2">
                        {profile.full_name}
                        <Edit2 size={14} className="text-gray-500 cursor-pointer" onClick={() => setIsEditingName(true)} />
                    </h3>
                )}

                <p className="text-sm text-gray-400 mb-2">{profile.email}</p>
                <div className="flex gap-2">
                    {(profile.roles || ['student']).map(role => (
                        <span key={role} className={`text-[10px] px-3 py-1 rounded-full font-bold ${role === 'admin' ? 'bg-secondary/20 text-secondary' : 'bg-primary/20 text-primary'}`}>
                            {role.toUpperCase()}
                        </span>
                    ))}
                    {profile.is_private && <span className="text-[10px] px-3 py-1 rounded-full font-bold bg-gray-800 text-gray-400">PRYWATNY</span>}
                    {profile.dm_friends_only && <span className="text-[10px] px-3 py-1 rounded-full font-bold bg-gray-800 text-gray-400">DM: ZNAJOMI</span>}
                </div>
            </div>

            {profile.is_banned && (
                <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-xl mb-6">
                    <div className="flex items-center justify-between gap-4 mb-2">
                        <div>
                            <div className="text-sm font-bold text-red-400">Konto objęte karą</div>
                            <div className="text-[11px] text-gray-400 uppercase mt-1">
                                {profile.banned_until ? `Ban do ${new Date(profile.banned_until).toLocaleString()}` : 'Kara aktywna do odwołania moderatora'}
                            </div>
                        </div>
                        <Shield size={18} className="text-red-400" />
                    </div>
                    <div className="text-sm text-white leading-relaxed">
                        {profile.ban_reason || activeBanEvent?.reason || 'Moderator nie dodał jeszcze uzasadnienia.'}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-surface border border-gray-800 p-4 rounded-xl flex items-center justify-between">
                    <div className="text-gray-400 font-bold text-xs uppercase">TebGąbki</div>
                    <div className="text-xl font-bold text-primary flex items-center gap-1">🪙 {profile.teb_gabki || 0}</div>
                </div>
                <button
                    onClick={() => setIsStoreOpen(true)}
                    className="bg-surface border border-primary/30 p-4 rounded-xl flex items-center justify-between hover:bg-primary/5 transition"
                >
                    <div className="text-primary font-bold text-xs uppercase">Sklep</div>
                    <ShoppingBag size={20} className="text-primary" />
                </button>
            </div>

            <h4 className="font-bold text-gray-300 mb-3 ml-2 text-sm uppercase">Odznaki & Statystyki</h4>
            <div className="bg-surface border border-gray-800 p-4 rounded-xl flex flex-col gap-3">
                <div className="flex items-center justify-between pb-2 border-b border-gray-800">
                    <span className="text-xs text-gray-400">Ranking Publiczny</span>
                    <span className="text-xs font-bold">{profile.is_private ? 'Ukryty' : 'Widoczny'}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                    {profile.roles?.includes('admin') && <div className="text-[10px] bg-red-500/10 text-red-500 p-1 px-2 rounded font-bold border border-red-500/20">PREZES SU</div>}
                    {profile.teb_gabki > 1000 && <div className="text-[10px] bg-yellow-500/10 text-yellow-500 p-1 px-2 rounded font-bold border border-yellow-500/20">MILIONER</div>}
                    {profile.badges?.map(badgeId => {
                        const b = AVAILABLE_BADGES.find(x => x.id === badgeId)
                        if (!b) return null
                        return (
                            <div key={badgeId} title={b.label} className="text-[10px] bg-primary/10 text-primary p-1 px-2 rounded font-bold border border-primary/20 flex items-center gap-1">
                                <span>{b.icon}</span> {b.label.toUpperCase()}
                            </div>
                        )
                    })}
                </div>
            </div>

            <div className="bg-surface border border-gray-800 p-4 rounded-xl flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                        <MessageCircle size={18} />
                    </div>
                    <div>
                        <div className="text-sm font-bold text-white leading-none">Wiadomości prywatne</div>
                        <div className="text-[10px] text-gray-500 uppercase mt-1">{profile.dm_friends_only ? 'Tylko zaakceptowani znajomi' : 'Każdy zalogowany użytkownik'}</div>
                    </div>
                </div>
                <button
                    onClick={toggleDmPrivacy}
                    className={`px-3 py-2 rounded-lg text-xs font-bold transition ${profile.dm_friends_only ? 'bg-primary/20 text-primary hover:bg-primary/30' : 'bg-gray-800 text-gray-300 hover:text-white'}`}
                >
                    {profile.dm_friends_only ? 'Znajomi' : 'Wszyscy'}
                </button>
            </div>

            <div className="bg-surface border border-gray-800 p-4 rounded-xl mb-6">
                <div className="flex items-center justify-between gap-3 mb-4">
                    <div>
                        <div className="text-sm font-bold text-white">Apelacje od kar</div>
                        <div className="text-[10px] text-gray-500 uppercase mt-1">Bezpieczna ścieżka odwoławcza</div>
                    </div>
                    <MessageCircle size={18} className="text-primary" />
                </div>

                {profile.is_banned ? (
                    <div className="space-y-3">
                        <textarea
                            value={appealMessage}
                            onChange={e => setAppealMessage(e.target.value)}
                            placeholder="Opisz krótko sytuację, wskaż kontekst i dlaczego kara powinna zostać cofnięta."
                            className="w-full min-h-[110px] bg-background border border-gray-700 rounded-xl p-3 text-sm text-white outline-none focus:border-primary resize-none"
                            disabled={!!pendingAppeal || appealLoading}
                        />
                        <button
                            onClick={submitAppeal}
                            disabled={!activeBanEvent || !!pendingAppeal || appealLoading}
                            className="w-full bg-primary text-white py-3 rounded-xl text-sm font-bold disabled:opacity-40"
                        >
                            {pendingAppeal ? 'Apelacja oczekuje na decyzję' : (appealLoading ? 'Wysyłanie apelacji...' : 'Wyślij apelację')}
                        </button>
                    </div>
                ) : (
                    <div className="text-sm text-gray-400">Brak aktywnej kary możliwej do zaskarżenia.</div>
                )}

                <div className="mt-4 space-y-3">
                    {appeals.length === 0 ? (
                        <div className="text-xs text-gray-500">Nie masz jeszcze żadnych apelacji.</div>
                    ) : appeals.map(appeal => (
                        <div key={appeal.id} className="bg-background border border-gray-800 rounded-xl p-3">
                            <div className="flex items-center justify-between gap-3 mb-2">
                                <div className="text-xs font-bold text-white uppercase">{appeal.punishment_type}</div>
                                <div className={`text-[10px] font-bold uppercase ${appeal.status === 'approved' ? 'text-green-400' : appeal.status === 'rejected' ? 'text-red-400' : 'text-yellow-400'}`}>
                                    {appeal.status}
                                </div>
                            </div>
                            <div className="text-sm text-gray-300 whitespace-pre-wrap">{appeal.message}</div>
                            {appeal.resolution_note && (
                                <div className="mt-2 text-xs text-gray-400 border-t border-gray-800 pt-2">
                                    Decyzja moderatora: {appeal.resolution_note}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <Link to="/privacy" className="bg-surface border border-gray-800 p-4 rounded-xl flex items-center justify-between hover:bg-gray-800 transition mb-6 group">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-white transition">
                        <Shield size={20} />
                    </div>
                    <div>
                        <div className="text-sm font-bold text-white leading-none">Prywatność & Dane</div>
                        <div className="text-[10px] text-gray-500 uppercase mt-1">Zasady, limity i Śmieciarka</div>
                    </div>
                </div>
                <Edit2 size={16} className="text-gray-700 group-hover:text-white transition" />
            </Link>

            {/* Modal Sklepu */}
            {isStoreOpen && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[100] flex items-center justify-center p-4">
                    <div className="bg-surface border border-gray-700 w-full max-w-sm rounded-2xl p-6 shadow-2xl relative">
                        <button onClick={() => setIsStoreOpen(false)} className="absolute top-4 right-4 text-gray-500"><X size={20} /></button>
                        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2"><ShoppingBag className="text-primary" /> Sklep Profilowy</h3>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between bg-background p-4 rounded-xl border border-gray-800">
                                <div>
                                    <div className="font-bold text-white text-sm">Nowy Awatar</div>
                                    <div className="text-xs text-gray-500">Wgraj zdjęcie z CDN (WebP)</div>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    <span className="text-xs font-bold text-primary">50 TG</span>
                                    <MediaUploader module="profiles" onUploadSuccess={updateAvatar} />
                                </div>
                            </div>

                            <div className="pt-2">
                                <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-3">Odznaki do kupienia</div>
                                <div className="grid grid-cols-1 gap-2">
                                    {AVAILABLE_BADGES.map(badge => {
                                        const owned = profile.badges?.includes(badge.id)
                                        return (
                                            <button 
                                                key={badge.id}
                                                disabled={owned || profile.teb_gabki < badge.price}
                                                onClick={() => buyBadge(badge.id, badge.price)}
                                                className={`flex items-center justify-between p-3 rounded-xl border transition ${owned ? 'bg-green-500/5 border-green-500/30' : 'bg-background border-gray-800 hover:border-primary/50'}`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xl">{badge.icon}</span>
                                                    <div className="text-left">
                                                        <div className="text-xs font-bold text-white">{badge.label}</div>
                                                        <div className="text-[9px] text-gray-500">{owned ? 'JUŻ POSIADASZ' : `${badge.price} TG`}</div>
                                                    </div>
                                                </div>
                                                {!owned && <ShoppingBag size={14} className="text-primary" />}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <TebGabkiRanking />
        </div>
    )
}
