import React from 'react'
import { ImageKitService } from '../../../services/imageKitService'

/**
 * MemberList — renders a list of chat group members with avatars, names, and role badges.
 *
 * Props:
 *   members: Array<{ user_id, role, nickname, profiles: { full_name, avatar_url } }>
 *   currentUserId: string        — highlights the current user
 *   onMemberClick: (member) => void — optional click handler (e.g. to open role editor)
 *   maxHeight: string            — CSS max-height for scrollable area (default: 'max-h-48')
 */
export default function MemberList({ members, currentUserId, onMemberClick, maxHeight = 'max-h-48' }) {
    if (!members || !members.length) {
        return (
            <div className="text-center text-gray-500 text-sm py-6">
                Brak członków w grupie.
            </div>
        )
    }

    const roleLabel = (role) => {
        switch (role) {
            case 'owner': return 'Właściciel'
            case 'admin': return 'Administrator'
            case 'moderator': return 'Moderator'
            case 'member': return 'Uczestnik'
            case 'muted': return 'Wyciszony'
            case 'banned': return 'Zbanowany'
            default: return role || 'Uczestnik'
        }
    }

    const roleBadgeColor = (role) => {
        switch (role) {
            case 'owner': return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
            case 'admin': return 'bg-secondary/20 text-secondary border-secondary/30'
            case 'moderator': return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
            case 'muted': return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
            case 'banned': return 'bg-red-500/20 text-red-400 border-red-500/30'
            default: return 'bg-gray-700/30 text-gray-300 border-gray-700'
        }
    }

    return (
        <div className={`overflow-y-auto space-y-2 pr-1 scrollbar-none ${maxHeight}`}>
            {members.map(m => {
                const isCurrentUser = m.user_id === currentUserId
                const avatarUrl = m.profiles?.avatar_url
                const displayName = m.nickname || m.profiles?.full_name || 'Użytkownik'

                return (
                    <div
                        key={m.user_id}
                        onClick={() => onMemberClick?.(m)}
                        className={`flex items-center gap-3 p-2 bg-background border border-gray-800 rounded-xl transition ${
                            onMemberClick ? 'cursor-pointer hover:border-gray-600' : ''
                        } ${isCurrentUser ? 'ring-1 ring-primary/30' : ''}`}
                    >
                        <div className="w-8 h-8 rounded-full bg-gray-800 overflow-hidden flex items-center justify-center font-bold text-xs shrink-0">
                            {avatarUrl ? (
                                <img
                                    src={ImageKitService.getOptimizedUrl(avatarUrl, 80)}
                                    alt=""
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                    decoding="async"
                                />
                            ) : (
                                (displayName.charAt(0) || '?')
                            )}
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-white leading-none truncate">
                                {displayName}
                                {isCurrentUser && (
                                    <span className="text-[10px] text-primary ml-1.5 font-normal">
                                        (Ty)
                                    </span>
                                )}
                            </div>
                        </div>

                        <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border shrink-0 ${roleBadgeColor(m.role)}`}
                        >
                            {roleLabel(m.role)}
                        </span>
                    </div>
                )
            })}
        </div>
    )
}
