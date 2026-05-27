import React from 'react'
import { Menu, X, MessageCircle, Users, Search, Plus, ArrowLeft, UserX, User } from 'lucide-react'
import { sanitizeImageUrl, sanitizePlainText } from '../../../utils/safeContent'
import { ImageKitService } from '../../../services/imageKitService'
import { getRoleLabel, getUserInitial } from '../../profile/profileMeta'

/**
 * MobileNav — 3-level hamburger navigation for mobile.
 *
 * Level 1: Chat list sidebar (recent conversations).
 * Level 2: Friends / Search utility views.
 * Level 3: Group creation modal.
 *
 * Props:
 *   isOpen           — bool, whether the mobile nav is open
 *   currentLevel     — 1 | 2 | 3
 *   onToggle         — () => void
 *   onLevelChange    — (level) => void
 *   onClose          — () => void
 *   recentChats      — Array of {id, full_name, role, avatar_url, type}
 *   activeChatId     — selected chat id (or null)
 *   onSelectChat     — (chat) => void
 *   friends          — Array of friend objects
 *   searchResults    — Array of search result objects
 *   searchQuery      — string (current search query)
 *   onSearchChange   — (event) => void
 *   onToggleBlock    — (userId) => void
 *   onSendFriendReq  — (userId) => void
 *   onOpenProfile    — (userId, event) => void
 *   onOpenChat       — (target) => void
 *   myBlockedIds     — Array of blocked user IDs
 *   isBlockedRel     — (userId) => boolean
 *   showFriends      — bool
 *   showSearch       — bool
 */
export default function MobileNav({
    isOpen = false,
    currentLevel = 1,
    onToggle = () => {},
    onLevelChange = () => {},
    onClose = () => {},
    recentChats = [],
    activeChatId = null,
    onSelectChat = () => {},
    friends = [],
    searchResults = [],
    searchQuery = '',
    onSearchChange = () => {},
    onToggleBlock = () => {},
    onSendFriendReq = () => {},
    onOpenProfile = () => {},
    onOpenChat = () => {},
    myBlockedIds = [],
    isBlockedRel = () => false,
    showFriends = false,
    showSearch = false,
}) {
    if (!isOpen) return null

    const renderLevel1Sidebar = () => (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-gray-800/50">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Rozmowy</h3>
                <button
                    type="button"
                    onClick={onClose}
                    className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition"
                >
                    <X size={18} />
                </button>
            </div>

            {/* Chat list */}
            <div className="flex-1 overflow-y-auto scrollbar-none p-3">
                {recentChats.length === 0 ? (
                    <div className="text-center text-gray-500 text-sm py-8">Brak rozmów</div>
                ) : (
                    <div className="flex flex-col gap-1">
                        {recentChats.map(chat => {
                            const name = sanitizePlainText(chat.full_name, { maxLength: 80 }) || 'Nieznany'
                            const avatarUrl = sanitizeImageUrl(chat.avatar_url)
                            const isGroup = chat.type === 'group'
                            const isActive = chat.id === activeChatId

                            return (
                                <button
                                    key={chat.id}
                                    type="button"
                                    onClick={() => { onSelectChat(chat); onClose() }}
                                    className={`flex items-center gap-3 p-2.5 rounded-xl text-left transition-all duration-150 ${
                                        isActive
                                            ? 'bg-primary/15 text-white'
                                            : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                                    }`}
                                >
                                    <div className="w-9 h-9 rounded-full bg-gray-800 flex items-center justify-center shrink-0 text-sm font-bold overflow-hidden">
                                        {isGroup ? (
                                            <Users size={16} className="text-secondary" />
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
                                    <div className="flex-1 min-w-0">
                                        <div className={`text-sm font-bold truncate ${isActive ? 'text-white' : ''}`}>
                                            {name}
                                        </div>
                                        <div className="text-[10px] text-gray-500 truncate">
                                            {isGroup ? 'Grupa' : getRoleLabel(chat.role || 'student')}
                                        </div>
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Bottom shortcuts */}
            <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-800/30">
                <button
                    type="button"
                    onClick={() => onLevelChange(2)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-surface border border-gray-800 rounded-xl text-gray-400 hover:text-white hover:border-gray-600 transition text-xs font-bold"
                >
                    <Search size={14} /> Szukaj
                </button>
                <button
                    type="button"
                    onClick={() => onLevelChange(3)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-surface border border-gray-800 rounded-xl text-gray-400 hover:text-white hover:border-gray-600 transition text-xs font-bold"
                >
                    <Plus size={14} /> Grupa
                </button>
            </div>
        </div>
    )

    const renderLevel2Utilities = () => (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-800/50">
                <button
                    type="button"
                    onClick={() => onLevelChange(1)}
                    className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition"
                >
                    <ArrowLeft size={20} />
                </button>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    {showFriends ? 'Znajomi' : 'Szukaj'}
                </h3>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto scrollbar-none p-3">
                {showFriends ? (
                    <div className="flex flex-col gap-2">
                        {friends.length === 0 ? (
                            <div className="text-center text-gray-500 text-sm py-10">
                                Nie masz jeszcze znajomych.
                            </div>
                        ) : (
                            friends.map(friend => {
                                const fName = sanitizePlainText(friend.full_name, { maxLength: 80 }) || 'Użytkownik'
                                const fAvatar = sanitizeImageUrl(friend.avatar_url)
                                return (
                                    <div
                                        key={friend.id}
                                        onClick={() => onOpenChat({ ...friend, type: 'private' })}
                                        className="bg-surface border border-gray-800 p-3.5 rounded-2xl flex items-center gap-3 cursor-pointer hover:border-primary/40 transition group"
                                    >
                                        <button
                                            type="button"
                                            onClick={(e) => onOpenProfile(friend.id, e)}
                                            className="w-10 h-10 rounded-full bg-gray-800 border border-gray-700 overflow-hidden flex items-center justify-center font-bold text-sm shrink-0"
                                        >
                                            {fAvatar ? (
                                                <img src={ImageKitService.getOptimizedUrl(fAvatar)} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                                            ) : (
                                                getUserInitial(fName)
                                            )}
                                        </button>
                                        <div className="flex-1 min-w-0 text-left">
                                            <div className="font-bold text-white text-sm truncate group-hover:text-primary transition">
                                                {fName}
                                            </div>
                                            <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest truncate">
                                                {getRoleLabel(friend.role || 'student')}
                                            </div>
                                        </div>
                                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                            <MessageCircle size={14} />
                                        </div>
                                    </div>
                                )
                            })
                        )}
                        <button
                            type="button"
                            onClick={() => { onLevelChange(2); /* switch to search mode */ }}
                            className="w-full mt-4 py-4 bg-surface border border-gray-800 border-dashed rounded-2xl text-gray-400 text-sm flex items-center justify-center gap-2 hover:border-primary hover:text-primary transition"
                        >
                            <Search size={16} /> Znajdź nowych osób
                        </button>
                    </div>
                ) : (
                    /* Search view */
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <input
                                type="text"
                                autoFocus
                                placeholder="Wyszukaj osobę..."
                                value={searchQuery}
                                onChange={onSearchChange}
                                className="flex-1 p-3 bg-surface border border-gray-700 rounded-xl text-white outline-none focus:border-primary shadow-inner text-sm"
                            />
                        </div>
                        {searchResults.length > 0 ? (
                            <div className="flex flex-col gap-2">
                                {searchResults.map(user => (
                                    <div
                                        key={user.id}
                                        onClick={() => onOpenChat({ ...user, type: 'private' })}
                                        className="bg-surface border border-gray-800 p-3 rounded-2xl flex items-center gap-3 cursor-pointer hover:border-primary/40 transition"
                                    >
                                        <button
                                            type="button"
                                            onClick={(e) => onOpenProfile(user.id, e)}
                                            className="w-9 h-9 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center font-bold shrink-0 overflow-hidden"
                                        >
                                            {user.avatar_url ? (
                                                <img src={ImageKitService.getOptimizedUrl(user.avatar_url)} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                                            ) : (
                                                getUserInitial(user.full_name)
                                            )}
                                        </button>
                                        <div className="flex-1 min-w-0 text-left">
                                            <div className="font-bold text-white text-sm truncate">{user.full_name}</div>
                                            <div className="text-[10px] text-gray-500 uppercase truncate">{getRoleLabel(user.role || 'student')}</div>
                                        </div>
                                        <div className="flex gap-1.5 shrink-0">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onToggleBlock(user.id) }}
                                                className={`p-2 rounded-lg transition active:scale-90 ${
                                                    myBlockedIds.includes(user.id)
                                                        ? 'bg-red-500/20 text-red-500'
                                                        : 'bg-gray-800 text-gray-300 hover:text-red-500'
                                                }`}
                                                title={myBlockedIds.includes(user.id) ? 'Odblokuj' : 'Zablokuj'}
                                            >
                                                <UserX size={15} />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onSendFriendReq(user.id) }}
                                                disabled={isBlockedRel(user.id)}
                                                className="p-2 bg-primary/20 text-primary rounded-lg hover:bg-primary hover:text-white transition active:scale-90 disabled:opacity-40"
                                                title="Dodaj znajomego"
                                            >
                                                <Plus size={15} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => onOpenProfile(user.id, e)}
                                                className="p-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-white hover:text-black transition active:scale-90"
                                                title="Profil"
                                            >
                                                <User size={15} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : searchQuery.length >= 3 ? (
                            <div className="text-center text-sm text-gray-500 mt-10">Nie znaleziono.</div>
                        ) : (
                            <div className="text-center text-sm text-gray-500 mt-10 flex flex-col items-center gap-3">
                                <Search size={28} className="opacity-20" />
                                <span>Wpisz min. 3 znaki...</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )

    const renderLevel3GroupCreate = () => null // Handled by modal in parent

    return (
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-50 lg:hidden">
                <div className="absolute inset-0 bg-black/60" onClick={onClose} />

                {/* Panel */}
                <div className="absolute left-0 top-0 bottom-0 w-80 max-w-[85vw] bg-[#121212] border-r border-gray-800 shadow-2xl animate-in slide-in-from-left duration-200 overflow-hidden flex flex-col">
                    {currentLevel === 1 && renderLevel1Sidebar()}
                    {currentLevel === 2 && renderLevel2Utilities()}
                    {currentLevel === 3 && renderLevel3GroupCreate()}
                </div>
            </div>
        </>
    )
}
