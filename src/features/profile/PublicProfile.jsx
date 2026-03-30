import React, { useEffect, useState } from 'react'
import { ArrowLeft, MessageCircle, Shield, User } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../services/supabase'
import { ImageKitService } from '../../services/imageKitService'
import { sanitizeImageUrl, sanitizePlainText } from '../../utils/safeContent'
import { getPrimaryRole, getProfileShowcaseItems, getRoleLabel, normalizeRoles, PROFILE_BIO_LIMIT } from './profileMeta'

export default function PublicProfile() {
    const { userId } = useParams()
    const navigate = useNavigate()
    const [profile, setProfile] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [currentUserId, setCurrentUserId] = useState(null)

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setCurrentUserId(session?.user?.id || null)
        })
    }, [])

    useEffect(() => {
        loadProfile()
    }, [userId])

    async function loadProfile() {
        if (!userId) return
        setLoading(true)

        const { data, error: queryError } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url, role, roles, teb_gabki, bio, is_private, dm_friends_only, created_at')
            .eq('id', userId)
            .single()

        if (queryError || !data) {
            setProfile(null)
            setError('Nie udalo sie otworzyc tego profilu lub jest on prywatny.')
            setLoading(false)
            return
        }

        setProfile(data)
        setError('')
        setLoading(false)
    }

    if (loading) {
        return <div className="text-center mt-10 text-gray-400">Ladowanie profilu...</div>
    }

    if (!profile) {
        return (
            <div className="space-y-4">
                <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition">
                    <ArrowLeft size={18} /> Powrot
                </button>
                <div className="bg-surface border border-gray-800 rounded-3xl p-6 text-sm text-gray-400">
                    {error}
                </div>
            </div>
        )
    }

    const showcaseItems = getProfileShowcaseItems(profile)
    const bio = sanitizePlainText(profile.bio, { maxLength: PROFILE_BIO_LIMIT, preserveLineBreaks: true })
    const avatarUrl = sanitizeImageUrl(profile.avatar_url)
    const isOwnProfile = currentUserId && currentUserId === profile.id
    const primaryRole = getPrimaryRole(profile)

    return (
        <div className="pb-10 pt-2 space-y-5">
            <div className="flex items-center justify-between gap-3">
                <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition">
                    <ArrowLeft size={18} /> Powrot
                </button>
                {isOwnProfile ? (
                    <Link to="/profile" className="text-sm font-bold text-primary hover:text-white transition">Edytuj swoj profil</Link>
                ) : null}
            </div>

            <div className="bg-surface border border-gray-800 relative p-6 rounded-3xl flex flex-col items-center overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary to-secondary"></div>
                <div className="w-24 h-24 bg-gray-800 rounded-full flex items-center justify-center mb-4 border-4 border-background shadow-lg overflow-hidden">
                    {avatarUrl ? (
                        <img src={ImageKitService.getOptimizedUrl(avatarUrl)} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                        <User size={40} className="text-gray-500" />
                    )}
                </div>

                <h2 className="font-bold text-2xl text-white text-center">{sanitizePlainText(profile.full_name, { maxLength: 80 })}</h2>
                <p className="text-sm text-gray-400 mt-2">{getRoleLabel(primaryRole)}</p>

                <div className="flex flex-wrap gap-2 justify-center mt-4">
                    {normalizeRoles(profile.roles, profile.role).map(role => (
                        <span key={role} className="text-[10px] px-3 py-1 rounded-full font-bold bg-primary/15 text-primary border border-primary/20 uppercase tracking-wide">
                            {getRoleLabel(role)}
                        </span>
                    ))}
                </div>

                {bio ? (
                    <div className="w-full mt-5 rounded-2xl border border-gray-800 bg-background/70 px-4 py-3">
                        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 mb-2">Opis</div>
                        <p className="text-sm text-gray-300 whitespace-pre-wrap break-words leading-relaxed">{bio}</p>
                    </div>
                ) : null}
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="bg-surface border border-gray-800 p-4 rounded-2xl flex items-center justify-between">
                    <div className="text-gray-400 font-bold text-xs uppercase">TebGabki</div>
                    <div className="text-xl font-bold text-primary">🪙 {profile.teb_gabki || 0}</div>
                </div>
                <div className="bg-surface border border-gray-800 p-4 rounded-2xl flex items-center justify-between">
                    <div>
                        <div className="text-gray-400 font-bold text-xs uppercase">Profil</div>
                        <div className="text-sm font-bold text-white mt-1">Publiczny</div>
                    </div>
                    <Shield size={18} className="text-primary" />
                </div>
            </div>

            <div className="bg-surface border border-gray-800 p-4 rounded-2xl">
                <div className="flex items-center justify-between pb-3 border-b border-gray-800 mb-3">
                    <span className="text-xs text-gray-400">Role i odznaki</span>
                    <span className="text-xs font-bold text-white">{showcaseItems.length}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                    {showcaseItems.length > 0 ? showcaseItems.map(item => (
                        <div key={item.id} className={`text-[10px] px-3 py-1 rounded-full font-bold flex items-center gap-1 ${item.className}`}>
                            {item.icon ? <span>{item.icon}</span> : null}
                            {item.label.toUpperCase()}
                        </div>
                    )) : (
                        <div className="text-sm text-gray-500">Ten profil nie ma jeszcze odznak specjalnych.</div>
                    )}
                </div>
            </div>

            {!isOwnProfile ? (
                <button
                    onClick={() => navigate(`/tebtalk?chat=${profile.id}`, {
                        state: {
                            openChatWith: {
                                id: profile.id,
                                full_name: profile.full_name,
                                avatar_url: profile.avatar_url,
                                role: primaryRole
                            }
                        }
                    })}
                    className="w-full py-3 bg-primary text-white rounded-2xl font-bold flex items-center justify-center gap-2 transition active:scale-95 shadow-[0_4px_15px_rgba(59,130,246,0.3)]"
                >
                    <MessageCircle size={16} /> Napisz wiadomosc
                </button>
            ) : null}
        </div>
    )
}