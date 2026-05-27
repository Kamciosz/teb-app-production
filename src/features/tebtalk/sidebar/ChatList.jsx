import React from 'react'
import { Users } from 'lucide-react'
import { getRoleLabel, getUserInitial } from '../../profile/profileMeta'
import { sanitizePlainText, sanitizeImageUrl } from '../../../utils/safeContent'
import { ImageKitService } from '../../../services/imageKitService'

export default function ChatList({ recentChats, loading, openChat, openProfile }) {
    if (loading) {
        return (
            <div className="text-center text-gray-500 mt-10 animate-pulse">
                Wczytywanie historii rozmow...
            </div>
        )
    }

    if (!recentChats || recentChats.length === 0) {
        return (
            <div className="text-center text-gray-500 mt-10 p-8 border border-gray-800 rounded-2xl border-dashed">
                Nie masz jeszcze zadnych otwartych konwersacji.
                <br /> Kliknij lupe, aby kogos znalezc!
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-2">
            {recentChats.map(user => {
                const safeName = sanitizePlainText(user.full_name, { maxLength: 80 }) || 'Uzytkownik'
                const safeAvatar = sanitizeImageUrl(user.avatar_url)

                return (
                    <div
                        key={user.id}
                        onClick={() => openChat(user)}
                        className="bg-surface border border-gray-800 p-4 rounded-xl flex items-center gap-4 cursor-pointer hover:border-gray-600 transition"
                    >
                        <button
                            type="button"
                            onClick={(event) =>
                                user.type === 'group' ? event.stopPropagation() : openProfile(user.id, event)
                            }
                            className="w-12 h-12 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center font-bold text-lg relative overflow-hidden shrink-0"
                        >
                            {user.type === 'group' ? (
                                <Users size={24} className="text-secondary" />
                            ) : safeAvatar ? (
                                <img
                                    src={ImageKitService.getOptimizedUrl(safeAvatar)}
                                    alt="Av"
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                    decoding="async"
                                />
                            ) : (
                                getUserInitial(safeName)
                            )}
                            {user.type !== 'group' && (
                                <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-surface rounded-full z-10"></div>
                            )}
                        </button>
                        <div className="flex-1 text-left min-w-0">
                            <div className="font-bold text-white leading-tight truncate">{safeName}</div>
                            <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">
                                {user.type === 'group' ? 'Pokój grupowy' : getRoleLabel(user.role || 'student')}
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
