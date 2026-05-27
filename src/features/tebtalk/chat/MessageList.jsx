import React, { useEffect, useRef, forwardRef } from 'react'
import { MessageCircle } from 'lucide-react'
import { splitGroupsByDate } from './utils'
import { sanitizePlainText, sanitizeImageUrl } from '../../../utils/safeContent'
import { ImageKitService } from '../../../services/imageKitService'
import { getUserInitial } from '../../profile/profileMeta'
import MessageBubble from './MessageBubble'

/**
 * MessageList — scrollable message area with date separators,
 * sender grouping, avatar columns, and loading/error/empty states.
 *
 * Props:
 *  - messages       : array of raw message objects
 *  - myId           : current user id
 *  - isGroup        : boolean
 *  - groupMembers   : array — resolved group members (for sender name resolution)
 *  - chatLoading    : boolean — initial chat loading
 *  - chatError      : string | null
 *  - hasOlderMessages : boolean
 *  - loadingOlderMessages : boolean
 *  - onLoadOlder    : () => void
 *  - onDelete       : (messageId) => void
 *  - onImageClick   : (url) => void
 *  - onProfileOpen  : (userId, event) => void
 *  - className      : additional classes for the scroll container
 */
const MessageList = forwardRef(function MessageList(
    {
        messages,
        myId,
        isGroup = false,
        groupMembers = [],
        chatLoading = false,
        chatError = null,
        hasOlderMessages = false,
        loadingOlderMessages = false,
        onLoadOlder,
        onDelete,
        onImageClick,
        onProfileOpen,
        className = '',
    },
    externalRef
) {
    const defaultRef = useRef(null)
    const containerRef = externalRef || defaultRef
    const messagesEndRef = useRef(null)

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }, 100)
    }, [messages.length])

    // ── Loading state ──
    if (chatLoading) {
        return (
            <div
                className={`flex-1 overflow-y-auto p-4 flex flex-col gap-3 scrollbar-none ${className}`}
                ref={containerRef}
            >
                <div className="m-auto text-center text-gray-500 flex flex-col items-center gap-2">
                    <MessageCircle size={32} className="opacity-50 animate-pulse" />
                    <p className="text-sm">Otwieranie rozmowy...</p>
                </div>
                <div ref={messagesEndRef} />
            </div>
        )
    }

    // ── Error state ──
    if (chatError) {
        return (
            <div
                className={`flex-1 overflow-y-auto p-4 flex flex-col gap-3 scrollbar-none ${className}`}
                ref={containerRef}
            >
                <div className="m-auto max-w-xs rounded-2xl border border-red-900/40 bg-red-950/20 px-4 py-3 text-center text-sm text-red-200">
                    {chatError}
                </div>
                <div ref={messagesEndRef} />
            </div>
        )
    }

    // ── Empty state ──
    if (!messages || messages.length === 0) {
        return (
            <div
                className={`flex-1 overflow-y-auto p-4 flex flex-col gap-3 scrollbar-none ${className}`}
                ref={containerRef}
            >
                <div className="m-auto text-center text-gray-500 flex flex-col items-center gap-2">
                    <MessageCircle size={32} className="opacity-50" />
                    <p className="text-sm">
                        Brak wiadomości.<br />Napisz jako pierwszy!
                    </p>
                </div>
                <div ref={messagesEndRef} />
            </div>
        )
    }

    // ── Normal render ──
    const messageBlocks = splitGroupsByDate(messages, myId)
    const activeChatType = isGroup ? 'group' : 'private'

    return (
        <div
            className={`flex-1 overflow-y-auto p-4 flex flex-col gap-3 scrollbar-none ${className}`}
            ref={containerRef}
        >
            {/* ── Load older messages button ── */}
            {hasOlderMessages && (
                <button
                    type="button"
                    onClick={onLoadOlder}
                    disabled={loadingOlderMessages}
                    className="self-center mb-2 px-4 py-1.5 text-xs font-bold rounded-full border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 disabled:opacity-50"
                >
                    {loadingOlderMessages
                        ? 'Ładowanie starszych...'
                        : 'Załaduj starsze wiadomości'}
                </button>
            )}

            <div className="flex flex-col gap-0">
                {messageBlocks.map((block, blockIdx) => {
                    // ── Resolve sender for each group (group chats only) ──
                    const groups = block.items.map((group) => {
                        const sender = isGroup
                            ? groupMembers.find((m) => m.user_id === group.senderId)
                            : null
                        const senderName = sanitizePlainText(
                            sender?.nickname || sender?.profiles?.full_name || group.senderName,
                            { maxLength: 80 }
                        ) || 'Użytkownik'
                        return { ...group, senderName }
                    })

                    return (
                        <div key={blockIdx} className="mb-4">
                            {/* ── Date separator ── */}
                            <div className="flex items-center gap-3 mb-3 mt-1">
                                <div className="flex-1 h-px bg-gray-800/60" />
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider shrink-0">
                                    {block.dateLabel}
                                </span>
                                <div className="flex-1 h-px bg-gray-800/60" />
                            </div>

                            {groups.map((group, groupIdx) => {
                                // Deleted message groups render as simple stubs
                                if (group.type === 'deleted') {
                                    return (
                                        <div key={groupIdx} className="flex justify-center my-2">
                                            <span className="text-[11px] text-gray-600 italic">
                                                Wiadomość usunięta
                                            </span>
                                        </div>
                                    )
                                }

                                return (
                                    <div
                                        key={groupIdx}
                                        className={`flex mb-0.5 ${group.isMe ? 'justify-end' : 'justify-start'}`}
                                    >
                                        {/* ── Avatar column (others only) ── */}
                                        {!group.isMe && (
                                            <div className="flex flex-col items-center mr-2.5 mt-0.5 shrink-0">
                                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center text-xs font-bold text-white">
                                                    {(group.senderName || '?')[0].toUpperCase()}
                                                </div>
                                            </div>
                                        )}

                                        <div
                                            className={`flex flex-col max-w-[75%] min-w-0 ${group.isMe ? 'items-end' : 'items-start'}`}
                                        >
                                            {/* ── Sender name (group, others only) ── */}
                                            {!group.isMe && isGroup && (
                                                <span className="text-[11px] font-bold text-gray-400 ml-1 mb-0.5">
                                                    {group.senderName}
                                                </span>
                                            )}

                                            {/* ── Message bubbles ── */}
                                            {group.messages.map((msg, msgIdx) => (
                                                <div
                                                    key={msg.id}
                                                    className={msgIdx > 0 ? 'mt-0.5' : ''}
                                                >
                                                    <MessageBubble
                                                        message={msg}
                                                        isMe={group.isMe}
                                                        isLastInGroup={
                                                            msgIdx === group.messages.length - 1
                                                        }
                                                        activeChatType={activeChatType}
                                                        onDelete={onDelete}
                                                        onImageClick={onImageClick}
                                                    />
                                                </div>
                                            ))}
                                        </div>

                                        {/* ── Spacer (me only, mirrors avatar column) ── */}
                                        {group.isMe && (
                                            <div className="w-9 h-9 shrink-0 ml-2.5 hidden lg:block" />
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )
                })}
                <div ref={messagesEndRef} />
            </div>
        </div>
    )
})

export default MessageList
