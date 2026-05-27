import React from 'react'
import { Trash2 } from 'lucide-react'
import { ImageKitService } from '../../../services/imageKitService'
import { sanitizeImageUrl, sanitizePlainText } from '../../../utils/safeContent'
import { formatTimestamp } from './utils'
import ReportButton from '../../../components/ReportButton'

const MAX_CHAT_MESSAGE = 2000

/**
 * MessageBubble — renders a single message bubble within a sender-group.
 *
 * Props:
 *  - message       : raw message object (id, sender_id, content, created_at, is_deleted?, status?, etc.)
 *  - isMe          : boolean — does this message belong to the current user?
 *  - isLastInGroup : boolean — show timestamp on this message?
 *  - activeChatType: 'private' | 'group' — determines report entity type prefix
 *  - onDelete      : (messageId) => void
 *  - onImageClick  : (url) => void  — optional, default opens in new tab
 *
 * Renders:
 *  - Deleted message stub (gray italic)
 *  - Image bubble (clickable, opens full-size)
 *  - Text bubble (sanitized, preserved line breaks)
 *  - Delete button (me, hover)
 *  - Report button (others, hover)
 *  - Timestamp (last-in-group only)
 */
export default function MessageBubble({
    message,
    isMe,
    isLastInGroup = true,
    activeChatType,
    onDelete,
    onImageClick,
}) {
    const isImage = !message.is_deleted && message.content && message.content.startsWith('https://')
    const msgSafeImageUrl = sanitizeImageUrl(message.content)

    // ── Deleted message ──────────────────────────────────────
    if (message.is_deleted) {
        return (
            <div className="flex justify-center my-2">
                <span className="text-[11px] text-gray-600 italic">
                    Wiadomość usunięta
                </span>
            </div>
        )
    }

    return (
        <div
            className={`group relative flex items-end gap-1.5`}
        >
            {/* ── Delete button (me only) ── */}
            {isMe && (
                <button
                    onClick={() => onDelete?.(message.id)}
                    className="opacity-0 group-hover:opacity-100 transition-all duration-150 p-1 text-gray-600 hover:text-red-500 -ml-8 shrink-0"
                    title="Usuń"
                >
                    <Trash2 size={12} />
                </button>
            )}

            {/* ── Report button (others only) ── */}
            {!isMe && (
                <div className="opacity-0 group-hover:opacity-100 transition-all duration-150 shrink-0">
                    <ReportButton
                        entityType={activeChatType === 'group' ? 'group_message' : 'direct_message'}
                        entityId={message.id}
                        subtle={true}
                    />
                </div>
            )}

            {/* ── Bubble content ── */}
            <div
                className={
                    `px-3 py-2 text-sm leading-relaxed break-words ` +
                    (isMe
                        ? 'bg-gradient-to-br from-secondary to-emerald-600 text-white rounded-2xl rounded-br-sm'
                        : 'bg-[#1e1e1e] border border-gray-800/60 text-gray-200 rounded-2xl rounded-bl-sm'
                    ) +
                    (message.status === 'sending' ? ' opacity-70' : '')
                }
                style={
                    isMe && !message.is_deleted
                        ? { boxShadow: '0 1px 4px rgba(34,197,94,0.15)' }
                        : undefined
                }
            >
                {isImage ? (
                    <img
                        src={ImageKitService.getOptimizedUrl(message.content, 400)}
                        alt="Zdjęcie"
                        className="rounded-lg max-w-full cursor-pointer hover:opacity-90 transition"
                        onClick={() =>
                            onImageClick
                                ? onImageClick(message.content)
                                : window.open(message.content, '_blank', 'noopener,noreferrer')
                        }
                        loading="lazy"
                    />
                ) : (
                    <span className="whitespace-pre-wrap">
                        {sanitizePlainText(message.content, {
                            maxLength: MAX_CHAT_MESSAGE,
                            preserveLineBreaks: true,
                        })}
                    </span>
                )}
            </div>

            {/* ── Timestamp (last message in group only) ── */}
            {isLastInGroup && (
                <span className="text-[9px] text-gray-600 whitespace-nowrap mt-auto mb-1 px-0.5 shrink-0">
                    {formatTimestamp(message.created_at)}
                </span>
            )}
        </div>
    )
}
