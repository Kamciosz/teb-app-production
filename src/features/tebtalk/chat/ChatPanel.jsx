import React, { useRef, useEffect } from 'react'
import {
    ArrowLeft, Menu, Send, MessageCircle, Users, Plus, Settings, X,
    Trash2, Paperclip, Smile, UserX, LogOut, Search, Clock, User,
} from 'lucide-react'
import { sanitizeImageUrl, sanitizePlainText } from '../../../utils/safeContent'
import { ImageKitService } from '../../../services/imageKitService'
import ReportButton from '../../../components/ReportButton'
import MediaUploader from '../../../components/common/MediaUploader'
import { getRoleLabel, getUserInitial } from '../../profile/profileMeta'
import { formatTimestamp } from '../chat/utils'
import { splitGroupsByDate } from '../chat/utils'

/**
 * ChatPanel — full chat view: header, messages stream, input bar.
 *
 * Props:
 *   activeChatUser     — {id, full_name, role, avatar_url, type}
 *   messages           — Array of message objects
 *   myId               — current user id
 *   groupMembers       — Array of chat group members
 *   chatLoading        — bool
 *   chatError          — string (error message or '')
 *   hasOlderMessages   — bool
 *   loadingOlder       — bool
 *   newMessage         — string (current input value)
 *   myBlockedIds       — Array of blocked user IDs
 *   isGroupSettingsOpen — bool
 *   isAddingMember     — bool
 *   friends            — Array of friend objects (for adding members)
 *
 *   onSendMessage       — (e) => void
 *   onNewMessageChange  — (value) => void
 *   onLoadOlderMessages — () => void
 *   onDeleteMessage     — (msgId) => void
 *   onSendImage         — (url) => void
 *   onToggleBlock       — () => void
 *   onToggleGroupSettings — () => void
 *   onCloseChat         — () => void
 *   onToggleSidebar     — () => void
 *   onToggleAddMember   — () => void
 *   onAddMember         — (userId) => void
 *   onOpenProfile       — (userId, event) => void
 *
 *   MAX_CHAT_MESSAGE    — number (default 2000)
 *   MAX_MESSAGES_IN_MEMORY — number (default 300)
 *
 *   sidebarOpen — bool (for mobile hamburger toggle)
 */
export default function ChatPanel({
    activeChatUser,
    messages = [],
    myId = null,
    groupMembers = [],
    chatLoading = false,
    chatError = '',
    hasOlderMessages = false,
    loadingOlder = false,
    newMessage = '',
    myBlockedIds = [],
    isGroupSettingsOpen = false,
    isAddingMember = false,
    friends = [],

    onSendMessage = () => {},
    onNewMessageChange = () => {},
    onLoadOlderMessages = () => {},
    onDeleteMessage = () => {},
    onSendImage = () => {},
    onToggleBlock = () => {},
    onToggleGroupSettings = () => {},
    onCloseChat = () => {},
    onToggleSidebar = () => {},
    onToggleAddMember = () => {},
    onAddMember = () => {},
    onOpenProfile = () => {},
    sidebarOpen = false,

    MAX_CHAT_MESSAGE = 2000,
    MAX_MESSAGES_IN_MEMORY = 300,
}) {
    const messagesEndRef = useRef(null)

    useEffect(() => {
        if (!chatLoading && messages.length > 0) {
            setTimeout(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
            }, 100)
        }
    }, [messages.length, chatLoading])

    if (!activeChatUser) return null

    const activeChatName = sanitizePlainText(activeChatUser.full_name, { maxLength: 80 }) || 'Użytkownik'
    const activeChatAvatarUrl = sanitizeImageUrl(activeChatUser.avatar_url)
    const isGroup = activeChatUser.type === 'group'
    const isBlocked = myBlockedIds.includes(activeChatUser.id)
    const label = isGroup
        ? `Grupa (${groupMembers.length} osób)`
        : getRoleLabel(activeChatUser.role || 'student')

    // ---------- Message bubble ----------
    const MessageBubble = ({ msg, group, isLastInGroup, groupIdx, msgIdx }) => {
        const isImage = !msg.is_deleted && msg.content && msg.content.startsWith('https://')
        const msgSafeImageUrl = sanitizeImageUrl(msg.content)

        return (
            <div className={`group relative flex items-end gap-1.5 ${msgIdx > 0 ? 'mt-0.5' : ''}`}>
                {/* Own message: delete button (left side) */}
                {group.isMe && !msg.is_deleted && (
                    <button
                        type="button"
                        onClick={() => onDeleteMessage(msg.id)}
                        className="opacity-0 group-hover:opacity-100 transition-all duration-150 p-1 text-gray-600 hover:text-red-500 -ml-8 shrink-0"
                        title="Usuń"
                    >
                        <Trash2 size={12} />
                    </button>
                )}

                {/* Other's message: report button (left side) */}
                {!group.isMe && !msg.is_deleted && (
                    <div className="opacity-0 group-hover:opacity-100 transition-all duration-150 shrink-0">
                        <ReportButton
                            entityType={isGroup ? 'group_message' : 'direct_message'}
                            entityId={msg.id}
                            subtle
                        />
                    </div>
                )}

                {/* Bubble */}
                <div
                    className={`px-3 py-2 text-sm leading-relaxed break-words ${
                        msg.is_deleted
                            ? 'bg-gray-800/20 text-gray-600 italic border border-gray-800/30 rounded-xl'
                            : group.isMe
                              ? 'bg-gradient-to-br from-secondary to-emerald-600 text-white rounded-2xl rounded-br-sm'
                              : 'bg-[#1e1e1e] border border-gray-800/60 text-gray-200 rounded-2xl rounded-bl-sm'
                    } ${msg.status === 'sending' ? 'opacity-70' : ''}`}
                    style={group.isMe && !msg.is_deleted ? { boxShadow: '0 1px 4px rgba(34,197,94,0.15)' } : {}}
                >
                    {msg.is_deleted ? (
                        'Usunięto'
                    ) : isImage ? (
                        <img
                            src={ImageKitService.getOptimizedUrl(msg.content, 400)}
                            alt="Zdjęcie"
                            className="rounded-lg max-w-full cursor-pointer hover:opacity-90 transition"
                            onClick={() => window.open(msg.content, '_blank', 'noopener,noreferrer')}
                            loading="lazy"
                        />
                    ) : (
                        <span className="whitespace-pre-wrap">
                            {sanitizePlainText(msg.content, {
                                maxLength: MAX_CHAT_MESSAGE,
                                preserveLineBreaks: true,
                            })}
                        </span>
                    )}
                </div>

                {/* Timestamp (last in group only) */}
                {isLastInGroup && (
                    <span className="text-[9px] text-gray-600 whitespace-nowrap mt-auto mb-1 px-0.5 shrink-0">
                        {formatTimestamp(msg.created_at)}
                    </span>
                )}
            </div>
        )
    }

    // ---------- Message group ----------
    const MessageGroup = ({ group }) => {
        if (group.type === 'deleted') {
            return (
                <div className="flex justify-center my-2">
                    <span className="text-[11px] text-gray-600 italic">Wiadomość usunięta</span>
                </div>
            )
        }

        const sender = isGroup ? groupMembers.find(m => m.user_id === group.senderId) : null
        const senderName = sanitizePlainText(
            sender?.nickname || sender?.profiles?.full_name || group.senderName,
            { maxLength: 80 },
        ) || 'Użytkownik'

        return (
            <div className={`flex mb-0.5 ${group.isMe ? 'justify-end' : 'justify-start'}`}>
                {/* Avatar (other's messages) */}
                {!group.isMe && (
                    <div className="flex flex-col items-center mr-2.5 mt-0.5 shrink-0">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center text-xs font-bold text-white">
                            {(senderName || '?')[0].toUpperCase()}
                        </div>
                    </div>
                )}

                <div className={`flex flex-col max-w-[75%] min-w-0 ${group.isMe ? 'items-end' : 'items-start'}`}>
                    {/* Sender name (group only, not own) */}
                    {!group.isMe && isGroup && (
                        <span className="text-[11px] font-bold text-gray-400 ml-1 mb-0.5">
                            {senderName}
                        </span>
                    )}

                    {group.messages.map((msg, msgIdx) => (
                        <MessageBubble
                            key={msg.id}
                            msg={msg}
                            group={group}
                            isLastInGroup={msgIdx === group.messages.length - 1}
                            msgIdx={msgIdx}
                        />
                    ))}
                </div>

                {/* Spacer for own messages (desktop) */}
                {group.isMe && <div className="w-9 h-9 shrink-0 ml-2.5 hidden lg:block" />}
            </div>
        )
    }

    // ---------- Date separator block ----------
    const MessageBlocks = () => {
        const blocks = splitGroupsByDate(messages, myId)
        return (
            <div className="flex flex-col gap-0">
                {blocks.map((block, blockIdx) => (
                    <div key={blockIdx} className="mb-4">
                        {/* Date separator line */}
                        <div className="flex items-center gap-3 mb-3 mt-1">
                            <div className="flex-1 h-px bg-gray-800/60" />
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider shrink-0">
                                {block.dateLabel}
                            </span>
                            <div className="flex-1 h-px bg-gray-800/60" />
                        </div>
                        {block.items.map((group, groupIdx) => (
                            <MessageGroup key={groupIdx} group={group} />
                        ))}
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>
        )
    }

    return (
        <>
            <div className="flex flex-col h-[calc(100vh-140px)] bg-background -mx-4 -mt-4 rounded-xl overflow-hidden border border-gray-800 relative z-10 lg:h-full lg:min-h-[calc(100vh-7rem)] lg:mx-0 lg:mt-0">
                {/* ======== CHAT HEADER ======== */}
                <div className="bg-[#1a1a1a] px-4 py-3 border-b border-gray-800 flex items-center gap-3 shrink-0">
                    {/* Hamburger (mobile) */}
                    <button
                        type="button"
                        onClick={onToggleSidebar}
                        className="p-2 text-gray-400 hover:text-white transition lg:hidden"
                    >
                        <Menu size={20} />
                    </button>

                    {/* Back */}
                    <button
                        type="button"
                        onClick={onCloseChat}
                        className="p-2 -ml-2 text-gray-400 hover:text-white transition"
                    >
                        <ArrowLeft size={20} />
                    </button>

                    {/* Avatar + Name */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center font-bold overflow-hidden shadow-sm shrink-0">
                            {isGroup ? (
                                <Users size={20} className="text-secondary" />
                            ) : activeChatAvatarUrl ? (
                                <button
                                    type="button"
                                    onClick={(e) => onOpenProfile(activeChatUser.id, e)}
                                    className="w-full h-full"
                                >
                                    <img
                                        src={ImageKitService.getOptimizedUrl(activeChatAvatarUrl)}
                                        alt="Av"
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                        decoding="async"
                                    />
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={(e) => onOpenProfile(activeChatUser.id, e)}
                                    className="w-full h-full flex items-center justify-center"
                                >
                                    {getUserInitial(activeChatName)}
                                </button>
                            )}
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                            <div className="font-bold text-white leading-tight flex items-center gap-1.5 truncate">
                                {activeChatName}
                                {activeChatUser.role === 'admin' && (
                                    <span className="bg-red-500 w-2 h-2 rounded-full shadow-[0_0_5px_red]" />
                                )}
                            </div>
                            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider truncate">
                                {label}
                            </div>
                        </div>
                    </div>

                    {/* Block button (DM) */}
                    {!isGroup && (
                        <button
                            type="button"
                            onClick={onToggleBlock}
                            className={`p-2 transition active:scale-90 ${
                                isBlocked
                                    ? 'text-red-500 hover:text-red-400'
                                    : 'text-gray-500 hover:text-red-500'
                            }`}
                            title={isBlocked ? 'Odblokuj użytkownika' : 'Zablokuj użytkownika'}
                        >
                            <UserX size={18} />
                        </button>
                    )}

                    {/* Settings button (Group) */}
                    {isGroup && (
                        <button
                            type="button"
                            onClick={onToggleGroupSettings}
                            className="p-2 text-gray-500 hover:text-white transition active:scale-90"
                        >
                            <Settings size={20} />
                        </button>
                    )}
                </div>

                {/* ======== MESSAGES AREA ======== */}
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 scrollbar-none">
                    {/* Load older messages button */}
                    {!chatLoading && hasOlderMessages && messages.length > 0 && (
                        <button
                            type="button"
                            onClick={onLoadOlderMessages}
                            disabled={loadingOlder}
                            className="self-center mb-2 px-4 py-1.5 text-xs font-bold rounded-full border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 disabled:opacity-50"
                        >
                            {loadingOlder
                                ? 'Ładowanie starszych...'
                                : 'Załaduj starsze wiadomości'}
                        </button>
                    )}

                    {/* Error state */}
                    {chatError ? (
                        <div className="m-auto max-w-xs rounded-2xl border border-red-900/40 bg-red-950/20 px-4 py-3 text-center text-sm text-red-200">
                            {chatError}
                        </div>
                    ) : chatLoading ? (
                        /* Loading state */
                        <div className="m-auto text-center text-gray-500 flex flex-col items-center gap-2">
                            <MessageCircle size={32} className="opacity-50 animate-pulse" />
                            <p className="text-sm">Otwieranie rozmowy...</p>
                        </div>
                    ) : messages.length === 0 ? (
                        /* Empty state */
                        <div className="m-auto text-center text-gray-500 flex flex-col items-center gap-2">
                            <MessageCircle size={32} className="opacity-50" />
                            <p className="text-sm">
                                Brak wiadomości.
                                <br />
                                Napisz jako pierwszy!
                            </p>
                        </div>
                    ) : (
                        /* Message blocks (date separators + groups) */
                        <MessageBlocks />
                    )}
                </div>

                {/* ======== INPUT BAR ======== */}
                <div className="p-2 bg-[#1a1a1a] border-t border-gray-800 flex items-end gap-2 shrink-0 pb-4">
                    <form onSubmit={onSendMessage} className="flex-1 flex items-end gap-2 relative">
                        {/* Attachment button */}
                        <div className="mb-1">
                            <MediaUploader module="tebtalk" onUploadSuccess={onSendImage}>
                                <div className="w-9 h-9 rounded-full bg-gray-800 text-primary flex items-center justify-center hover:bg-gray-700 transition cursor-pointer">
                                    <Plus size={20} />
                                </div>
                            </MediaUploader>
                        </div>

                        {/* Input field */}
                        <div className="flex-1 bg-gray-800/50 border border-gray-700 rounded-[20px] flex items-center min-h-[40px] px-4 py-2 transition-all focus-within:border-primary focus-within:bg-gray-800">
                            <input
                                type="text"
                                placeholder="Napisz wiadomość..."
                                value={newMessage}
                                onChange={e => onNewMessageChange(e.target.value.slice(0, MAX_CHAT_MESSAGE))}
                                maxLength={MAX_CHAT_MESSAGE}
                                className="w-full bg-transparent text-white text-[15px] outline-none placeholder-gray-500 max-h-[100px] overflow-y-auto"
                                style={{ resize: 'none' }}
                            />
                            <button
                                type="button"
                                className="text-gray-400 hover:text-yellow-400 transition ml-2 p-1"
                            >
                                <Smile size={20} />
                            </button>
                        </div>

                        {/* Send / Like button */}
                        {newMessage.trim() ? (
                            <button
                                type="submit"
                                className="mb-1 w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary-dark transition shadow-lg shadow-primary/20 animate-in zoom-in duration-200"
                            >
                                <Send size={18} className="translate-x-[1px] translate-y-[1px]" />
                            </button>
                        ) : (
                            <div className="mb-1 w-9 h-9 flex items-center justify-center text-primary">
                                <div
                                    className="cursor-pointer hover:scale-110 transition active:scale-95"
                                    onClick={() => onNewMessageChange('👍')}
                                >
                                    <span className="text-xl">👍</span>
                                </div>
                            </div>
                        )}
                    </form>
                </div>
            </div>

            {/* ======== GROUP SETTINGS MODAL ======== */}
            {isGroupSettingsOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
                    <div className="bg-surface border border-gray-700 w-full max-w-sm rounded-2xl p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
                        <button
                            type="button"
                            onClick={onToggleGroupSettings}
                            className="absolute top-4 right-4 text-gray-500 hover:text-white"
                        >
                            <X size={20} />
                        </button>
                        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                            <Settings className="text-secondary" /> Ustawienia Grupy
                        </h3>

                        <div className="space-y-6">
                            {/* Member list */}
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="text-[10px] text-gray-500 font-bold uppercase">
                                        Członkowie ({groupMembers.length})
                                    </label>
                                    <button
                                        type="button"
                                        onClick={onToggleAddMember}
                                        className="text-xs text-secondary font-bold flex items-center gap-1 hover:underline"
                                    >
                                        <Plus size={12} /> Dodaj znajomego
                                    </button>
                                </div>
                                <div className="max-h-48 overflow-y-auto space-y-2 pr-1 scrollbar-none">
                                    {groupMembers.map(m => (
                                        <div
                                            key={m.user_id}
                                            className="flex items-center gap-3 p-2 bg-background border border-gray-800 rounded-xl"
                                        >
                                            <div className="w-8 h-8 rounded-full bg-gray-800 overflow-hidden flex items-center justify-center font-bold text-xs">
                                                {m.profiles.avatar_url ? (
                                                    <img
                                                        src={ImageKitService.getOptimizedUrl(m.profiles.avatar_url, 80)}
                                                        alt="Av"
                                                        className="w-full h-full object-cover"
                                                        loading="lazy"
                                                        decoding="async"
                                                    />
                                                ) : (
                                                    (m.profiles.full_name || '?').charAt(0).toUpperCase()
                                                )}
                                            </div>
                                            <div className="flex-1">
                                                <div className="text-sm font-bold text-white leading-none">
                                                    {m.nickname || m.profiles.full_name}
                                                </div>
                                                <div className="text-[10px] text-gray-500 uppercase">
                                                    {m.role === 'admin' ? 'Administrator' : 'Uczestnik'}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Leave group */}
                            <div className="pt-4 border-t border-gray-800">
                                <button
                                    type="button"
                                    className="w-full py-3 bg-red-900/20 text-red-500 border border-red-900/30 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-red-900/40 transition"
                                    onClick={() => alert('Wkrótce: Opuszczanie grupy')}
                                >
                                    <LogOut size={16} /> Opuść grupę
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Add member sub-modal */}
                    {isAddingMember && (
                        <div className="absolute inset-0 bg-black/90 backdrop-blur-md z-[120] flex items-center justify-center p-4">
                            <div className="bg-surface border border-gray-700 w-full max-w-xs rounded-2xl p-6 shadow-2xl relative">
                                <button
                                    type="button"
                                    onClick={onToggleAddMember}
                                    className="absolute top-4 right-4 text-gray-500"
                                >
                                    <X size={20} />
                                </button>
                                <h4 className="text-lg font-bold text-white mb-4">Dodaj do grupy</h4>
                                <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-none">
                                    {friends.length === 0 ? (
                                        <p className="text-center text-gray-500 text-sm py-4">
                                            Nie masz jeszcze zaakceptowanych znajomych.
                                        </p>
                                    ) : (
                                        friends
                                            .filter(f => !groupMembers.find(m => m.user_id === f.id))
                                            .map(friend => (
                                                <div
                                                    key={friend.id}
                                                    onClick={() => onAddMember(friend.id)}
                                                    className="flex items-center gap-3 p-3 bg-background border border-gray-800 rounded-xl cursor-pointer hover:border-secondary transition"
                                                >
                                                    <div className="w-8 h-8 rounded-full bg-gray-800 overflow-hidden flex items-center justify-center font-bold text-xs">
                                                        {friend.avatar_url ? (
                                                            <img
                                                                src={ImageKitService.getOptimizedUrl(
                                                                    friend.avatar_url,
                                                                    80,
                                                                )}
                                                                alt="Av"
                                                                className="w-full h-full object-cover"
                                                                loading="lazy"
                                                                decoding="async"
                                                            />
                                                        ) : (
                                                            (friend.full_name || '?').charAt(0).toUpperCase()
                                                        )}
                                                    </div>
                                                    <div className="text-sm font-bold text-white">
                                                        {friend.full_name}
                                                    </div>
                                                </div>
                                            ))
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </>
    )
}
