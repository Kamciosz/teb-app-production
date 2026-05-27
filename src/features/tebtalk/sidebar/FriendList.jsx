import React from 'react'
import { MessageCircle, Search as SearchIcon, ArrowLeft } from 'lucide-react'
import { getRoleLabel, getUserInitial } from '../../profile/profileMeta'
import { sanitizeImageUrl } from '../../../utils/safeContent'
import { ImageKitService } from '../../../services/imageKitService'

export default function FriendList({ friends, openChat, openProfile, onNavigateSearch, onBack }) {
    return (
        <div className="mb-6 fade-in">
            <div className="flex items-center gap-3 mb-6">
                {onBack && (
                    <button onClick={onBack} className="p-2 text-gray-400 hover:text-white transition" title="Powrót">
                        <ArrowLeft size={20} />
                    </button>
                )}
                <h3 className="text-xl font-bold text-white">Twoi Znajomi</h3>
            </div>

            {!friends || friends.length === 0 ? (
                <div className="text-center p-10 bg-surface border border-gray-800 border-dashed rounded-3xl text-gray-500">
                    Nie masz jeszcze znajomych. <br /> Wyszukaj kogos i wyslij zaproszenie!
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-2">
                    {friends.map(friend => {
                        const safeAvatar = sanitizeImageUrl(friend.avatar_url)

                        return (
                            <div
                                key={friend.id}
                                onClick={() => openChat({ ...friend, type: 'private' })}
                                className="bg-surface border border-gray-800 p-4 rounded-2xl flex items-center gap-4 cursor-pointer hover:border-primary transition group"
                            >
                                <button
                                    type="button"
                                    onClick={(event) => openProfile(friend.id, event)}
                                    className="w-12 h-12 rounded-full bg-gray-800 border border-gray-700 overflow-hidden flex items-center justify-center font-bold text-lg shrink-0"
                                >
                                    {safeAvatar ? (
                                        <img
                                            src={ImageKitService.getOptimizedUrl(safeAvatar)}
                                            alt="Av"
                                            className="w-full h-full object-cover"
                                            loading="lazy"
                                            decoding="async"
                                        />
                                    ) : (
                                        getUserInitial(friend.full_name)
                                    )}
                                </button>
                                <div className="flex-1 text-left min-w-0">
                                    <div className="font-bold text-white group-hover:text-primary transition truncate">
                                        {friend.full_name}
                                    </div>
                                    <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest truncate">
                                        {getRoleLabel(friend.role || 'student')}
                                    </div>
                                </div>
                                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                    <MessageCircle size={16} />
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {onNavigateSearch && (
                <button
                    onClick={onNavigateSearch}
                    className="w-full mt-6 py-4 bg-surface border border-gray-800 border-dashed rounded-2xl text-gray-400 text-sm flex items-center justify-center gap-2 hover:border-primary hover:text-primary transition"
                >
                    <SearchIcon size={16} /> Znajdz nowych osob
                </button>
            )}
        </div>
    )
}
