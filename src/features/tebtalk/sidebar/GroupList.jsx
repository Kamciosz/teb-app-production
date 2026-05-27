import React from 'react'
import { Users, Plus } from 'lucide-react'
import { sanitizePlainText, sanitizeImageUrl } from '../../../utils/safeContent'
import { ImageKitService } from '../../../services/imageKitService'

export default function GroupList({ recentChats, openChat, openProfile, onCreateGroup }) {
    const groups = (recentChats || []).filter(chat => chat.type === 'group')

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Grupy</h3>
                <button
                    onClick={onCreateGroup}
                    className="p-2 bg-surface border border-gray-700 rounded-full text-secondary hover:bg-gray-700 transition active:scale-95"
                    title="Stworz grupe"
                >
                    <Plus size={16} />
                </button>
            </div>

            {groups.length === 0 ? (
                <div className="text-center text-gray-500 text-sm py-8 border border-gray-800 rounded-2xl border-dashed">
                    Nie nalezysz do zadnej grupy.
                    <br />
                    <button
                        onClick={onCreateGroup}
                        className="mt-2 text-secondary font-bold hover:underline"
                    >
                        Stworz pierwsza!
                    </button>
                </div>
            ) : (
                <div className="flex flex-col gap-1">
                    {groups.map(group => {
                        const safeName = sanitizePlainText(group.full_name, { maxLength: 80 }) || 'Grupa'
                        const safeImage = sanitizeImageUrl(group.avatar_url)

                        return (
                            <div
                                key={group.id}
                                onClick={() => openChat(group)}
                                className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/5 cursor-pointer transition"
                            >
                                <div className="w-9 h-9 rounded-full bg-gray-800 flex items-center justify-center shrink-0 border border-gray-700">
                                    {safeImage ? (
                                        <img
                                            src={ImageKitService.getOptimizedUrl(safeImage, 80)}
                                            alt="Av"
                                            className="w-full h-full object-cover rounded-full"
                                            loading="lazy"
                                            decoding="async"
                                        />
                                    ) : (
                                        <Users size={16} className="text-secondary" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-bold text-white truncate">{safeName}</div>
                                    <div className="text-[10px] text-gray-500 truncate">Grupa</div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
