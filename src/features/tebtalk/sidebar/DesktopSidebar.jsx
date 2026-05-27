import React from 'react'
import { Users, MessageCircle, Hash, Search } from 'lucide-react'
import { sanitizeImageUrl, sanitizePlainText } from '../../../utils/safeContent'
import { ImageKitService } from '../../../services/imageKitService'
import { getRoleLabel, getUserInitial } from '../../profile/profileMeta'

/**
 * DesktopSidebar — Discord-style channel list for desktop.
 *
 * Props:
 *   recentChats    — Array of {id, full_name, role, avatar_url, type}
 *   activeChatId   — currently selected chat id (or null)
 *   onSelectChat   — (chat) => void
 *   onToggleSearch — () => void
 *   onToggleFriends — () => void
 *   onToggleCreateGroup — () => void
 *   searchActive   — bool, whether search view is open
 *   friendsActive  — bool, whether friends view is open
 */
export default function DesktopSidebar({
    recentChats = [],
    activeChatId = null,
    onSelectChat = () => {},
    onToggleSearch = () => {},
    onToggleFriends = () => {},
    onToggleCreateGroup = () => {},
    searchActive = false,
    friendsActive = false,
}) {
    const privateChats = recentChats.filter(c => c.type !== 'group')
    const groupChats = recentChats.filter(c => c.type === 'group')

    const ChannelEntry = ({ chat, isActive, onClick }) => {
        const name = sanitizePlainText(chat.full_name, { maxLength: 80 }) || 'Nieznany'
        const avatarUrl = sanitizeImageUrl(chat.avatar_url)
        const isGroup = chat.type === 'group'

        return (
            <button
                type="button"
                onClick={onClick}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all duration-150 group ${
                    isActive
                        ? 'bg-primary/15 text-white'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
            >
                {/* Avatar / Icon */}
                <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center shrink-0 text-xs font-bold overflow-hidden">
                    {isGroup ? (
                        <Users size={14} className="text-secondary" />
                    ) : avatarUrl ? (
                        <img
                            src={ImageKitService.getOptimizedUrl(avatarUrl, 48)}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                            decoding="async"
                        />
                    ) : (
                        <span className="text-white">{getUserInitial(name)}</span>
                    )}
                </div>

                {/* Name + meta */}
                <div className="flex-1 min-w-0">
                    <div className={`text-sm font-semibold truncate ${isActive ? 'text-white' : ''}`}>
                        {name}
                    </div>
                    <div className="text-[10px] text-gray-500 truncate">
                        {isGroup ? 'Grupa' : getRoleLabel(chat.role || 'student')}
                    </div>
                </div>

                {/* Online indicator (DMs only) */}
                {!isGroup && (
                    <div className="w-2 h-2 rounded-full bg-green-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
            </button>
        )
    }

    const NavButton = ({ icon: Icon, label, active, onClick }) => (
        <button
            type="button"
            onClick={onClick}
            title={label}
            className={`p-2.5 rounded-xl transition-all duration-150 ${
                active
                    ? 'bg-primary/20 text-primary'
                    : 'text-gray-500 hover:text-gray-200 hover:bg-white/5'
            }`}
        >
            <Icon size={18} />
        </button>
    )

    return (
        <aside className="hidden lg:flex flex-col w-64 h-full bg-[#111] border-r border-gray-800/60 shrink-0">
            {/* App header */}
            <div className="px-4 py-4 border-b border-gray-800/50">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center font-bold text-white text-sm shadow-lg shadow-primary/20">
                        T
                    </div>
                    <div>
                        <h2 className="text-sm font-bold text-white leading-tight">TEBtalk</h2>
                        <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">
                            Komunikator
                        </span>
                    </div>
                </div>
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-1 px-3 py-2.5 border-b border-gray-800/30">
                <NavButton icon={Search} label="Szukaj" active={searchActive} onClick={onToggleSearch} />
                <NavButton icon={Users} label="Znajomi" active={friendsActive} onClick={onToggleFriends} />
                <div className="flex-1" />
                <NavButton icon={MessageCircle} label="Nowa grupa" onClick={onToggleCreateGroup} />
            </div>

            {/* Channel list — scrollable */}
            <div className="flex-1 overflow-y-auto scrollbar-none px-2 py-3 space-y-4">
                {/* Direct Messages */}
                {privateChats.length > 0 && (
                    <div>
                        <div className="flex items-center gap-1.5 px-1 mb-1.5">
                            <Hash size={10} className="text-gray-600" />
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                Wiadomości ({privateChats.length})
                            </span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                            {privateChats.map(chat => (
                                <ChannelEntry
                                    key={chat.id}
                                    chat={chat}
                                    isActive={chat.id === activeChatId}
                                    onClick={() => onSelectChat(chat)}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* Groups */}
                {groupChats.length > 0 && (
                    <div>
                        <div className="flex items-center gap-1.5 px-1 mb-1.5">
                            <Users size={10} className="text-gray-600" />
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                Grupy ({groupChats.length})
                            </span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                            {groupChats.map(chat => (
                                <ChannelEntry
                                    key={chat.id}
                                    chat={chat}
                                    isActive={chat.id === activeChatId}
                                    onClick={() => onSelectChat(chat)}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* Empty state */}
                {recentChats.length === 0 && (
                    <div className="text-center text-gray-600 text-xs py-10 px-4 leading-relaxed">
                        Brak rozmów.
                        <br />
                        Wyszukaj kogoś, aby rozpocząć.
                    </div>
                )}
            </div>

            {/* Bottom branding */}
            <div className="px-4 py-2.5 border-t border-gray-800/30">
                <div className="text-[9px] text-gray-600 font-semibold text-center">
                    TEBtalk v2
                </div>
            </div>
        </aside>
    )
}
