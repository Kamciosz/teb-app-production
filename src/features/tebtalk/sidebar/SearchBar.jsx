import React, { useState, useEffect, useRef } from 'react'
import { Search, ArrowLeft, UserX, Plus, User, MessageCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { searchProfiles } from '../services/tebtalkQueries'
import { getRoleLabel, getUserInitial } from '../../profile/profileMeta'
import { sanitizeImageUrl, sanitizePlainText } from '../../../utils/safeContent'
import { ImageKitService } from '../../../services/imageKitService'
import { useToast } from '../../../context/ToastContext'

export default function SearchBar({ myId, myBlockedIds, openChat, toggleBlock, sendFriendRequest, onClose }) {
    const [query, setQuery] = useState('')
    const [results, setResults] = useState([])
    const [loading, setLoading] = useState(false)
    const navigate = useNavigate()
    const toast = useToast()
    const inputRef = useRef(null)
    const debounceRef = useRef(null)

    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current)

        const safeQuery = sanitizePlainText(query, { maxLength: 60 })
        if (!safeQuery || safeQuery.length < 3) {
            setResults([])
            return
        }

        setLoading(true)
        debounceRef.current = setTimeout(async () => {
            try {
                const data = await searchProfiles(safeQuery, myId, 10)
                setResults(data || [])
            } catch (e) {
                console.error('Search error:', e)
            } finally {
                setLoading(false)
            }
        }, 250)

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current)
        }
    }, [query, myId])

    const openProfile = (userId, event) => {
        if (event) event.stopPropagation()
        if (!userId) return
        navigate(`/profile/${userId}`)
    }

    return (
        <div className="fade-in">
            <div className="flex gap-2 mb-4">
                <button onClick={onClose} className="p-3 bg-surface border border-gray-800 rounded-xl text-gray-400 hover:text-white transition" title="Powrót">
                    <ArrowLeft size={20} />
                </button>
                <input
                    ref={inputRef}
                    type="text"
                    placeholder="Wyszukaj ucznia..."
                    value={query}
                    onChange={e => setQuery(e.target.value.slice(0, 60))}
                    className="flex-1 p-3 bg-surface border border-gray-700 rounded-xl text-white outline-none focus:border-primary shadow-inner"
                />
            </div>

            {loading && (
                <div className="text-center text-sm text-gray-500 mt-6 animate-pulse">Szukanie...</div>
            )}

            {!loading && results.length > 0 && (
                <div className="flex flex-col gap-2">
                    {results.map(user => (
                        <div
                            key={user.id}
                            onClick={() => openChat({ ...user, type: 'private' })}
                            className="bg-surface border border-gray-800 p-3 rounded-2xl flex items-center gap-3 transition cursor-pointer hover:border-primary/40"
                        >
                            <button
                                type="button"
                                onClick={(event) => openProfile(user.id, event)}
                                className="w-10 h-10 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center font-bold overflow-hidden shrink-0"
                            >
                                {user.avatar_url ? (
                                    <img
                                        src={ImageKitService.getOptimizedUrl(user.avatar_url)}
                                        alt="Av"
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                        decoding="async"
                                    />
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
                                    className={`p-2 rounded-lg transition active:scale-90 ${
                                        (myBlockedIds || []).includes(user.id)
                                            ? 'bg-red-500/20 text-red-500'
                                            : 'bg-gray-800 text-gray-300 hover:text-red-500'
                                    }`}
                                    title={(myBlockedIds || []).includes(user.id) ? 'Odblokuj' : 'Zablokuj'}
                                >
                                    <UserX size={18} />
                                </button>
                                <button
                                    onClick={(event) => {
                                        event.stopPropagation()
                                        sendFriendRequest(user.id)
                                    }}
                                    disabled={(myBlockedIds || []).includes(user.id)}
                                    className="p-2 bg-primary/20 text-primary rounded-lg hover:bg-primary hover:text-white transition active:scale-90 disabled:opacity-40"
                                    title="Dodaj do znajomych"
                                >
                                    <Plus size={18} />
                                </button>
                                <button
                                    type="button"
                                    onClick={(event) => openProfile(user.id, event)}
                                    className="p-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-white hover:text-black transition active:scale-90"
                                    title="Profil"
                                >
                                    <User size={18} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {!loading && query.length >= 3 && results.length === 0 && (
                <div className="text-center text-sm text-gray-500 mt-10">Nie znaleziono takich osob.</div>
            )}

            {!loading && query.length < 3 && (
                <div className="text-center text-sm text-gray-500 mt-10 flex flex-col items-center gap-3">
                    <Search size={32} className="opacity-20" />
                    <span>Wpisz min. 3 znaki...</span>
                </div>
            )}
        </div>
    )
}
