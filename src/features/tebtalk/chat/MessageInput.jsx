import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Plus, Smile } from 'lucide-react'
import MediaUploader from '../../../components/common/MediaUploader'

// ── Quick emoji grid ──────────────────────────────────────────
const QUICK_EMOJIS = [
    '👍', '❤️', '😂', '😢', '😡', '🔥',
    '🎉', '💀', '👀', '🤔', '🙏', '✨',
    '😭', '🥰', '🤣', '😤', '💯', '👌',
]

const DEFAULT_MAX_LENGTH = 2000

/**
 * MessageInput — chat message composition bar with file upload,
 * emoji picker, and send / quick-reaction affordances.
 *
 * Props:
 *  - value          : string (controlled input value)
 *  - onChange       : (value: string) => void
 *  - onSend         : (e: FormEvent) => void  — form submit handler
 *  - onSendImage    : (url: string) => void   — called after successful upload
 *  - maxLength      : number (default 2000)
 *  - disabled       : boolean
 *  - placeholder    : string (default 'Napisz wiadomość...')
 */
export default function MessageInput({
    value = '',
    onChange,
    onSend,
    onSendImage,
    maxLength = DEFAULT_MAX_LENGTH,
    disabled = false,
    placeholder = 'Napisz wiadomość...',
}) {
    const [emojiOpen, setEmojiOpen] = useState(false)
    const emojiRef = useRef(null)
    const inputRef = useRef(null)

    // ── Close emoji picker on outside click ──
    useEffect(() => {
        if (!emojiOpen) return
        function handleClick(e) {
            if (emojiRef.current && !emojiRef.current.contains(e.target)) {
                setEmojiOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [emojiOpen])

    // ── Insert emoji at cursor ──
    const insertEmoji = useCallback(
        (emoji) => {
            const el = inputRef.current
            if (!el) {
                // Fallback: append
                onChange?.((value || '') + emoji)
                return
            }
            const start = el.selectionStart ?? value.length
            const end = el.selectionEnd ?? value.length
            const next = value.slice(0, start) + emoji + value.slice(end)
            onChange?.(next)

            // Restore cursor position after emoji
            requestAnimationFrame(() => {
                const pos = start + emoji.length
                el.setSelectionRange(pos, pos)
                el.focus()
            })
        },
        [value, onChange]
    )

    // ── Quick reaction (👍) when input is empty ──
    const handleQuickReaction = () => {
        onChange?.('👍')
        // Submit immediately
        requestAnimationFrame(() => {
            inputRef.current?.form?.requestSubmit()
        })
    }

    const handleChange = (e) => {
        onChange?.(e.target.value.slice(0, maxLength))
    }

    const trimmed = value?.trim() || ''
    const hasText = trimmed.length > 0

    return (
        <div className="p-2 bg-[#1a1a1a] border-t border-gray-800 flex items-end gap-2 shrink-0 pb-4">
            <form onSubmit={onSend} className="flex-1 flex items-end gap-2 relative">
                {/* ── Attach / Upload button ── */}
                <div className="mb-1">
                    <MediaUploader module="tebtalk" onUploadSuccess={onSendImage}>
                        <div
                            className={`w-9 h-9 rounded-full bg-gray-800 text-primary flex items-center justify-center hover:bg-gray-700 transition cursor-pointer ${disabled ? 'pointer-events-none opacity-50' : ''}`}
                        >
                            <Plus size={20} />
                        </div>
                    </MediaUploader>
                </div>

                {/* ── Input + Emoji row ── */}
                <div className="flex-1 bg-gray-800/50 border border-gray-700 rounded-[20px] flex items-center min-h-[40px] px-4 py-2 transition-all focus-within:border-primary focus-within:bg-gray-800 relative">
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder={placeholder}
                        value={value}
                        onChange={handleChange}
                        maxLength={maxLength}
                        disabled={disabled}
                        className="w-full bg-transparent text-white text-[15px] outline-none placeholder-gray-500 max-h-[100px] overflow-y-auto"
                        style={{ resize: 'none' }}
                    />

                    {/* ── Emoji button ── */}
                    <div className="relative" ref={emojiRef}>
                        <button
                            type="button"
                            onClick={() => setEmojiOpen((o) => !o)}
                            disabled={disabled}
                            className={`text-gray-400 hover:text-yellow-400 transition ml-2 p-1 ${emojiOpen ? 'text-yellow-400' : ''} ${disabled ? 'opacity-50' : ''}`}
                            title="Emoji"
                            tabIndex={-1}
                        >
                            <Smile size={20} />
                        </button>

                        {/* ── Emoji picker dropdown ── */}
                        {emojiOpen && (
                            <div className="absolute bottom-10 right-0 bg-[#1a1a1a] border border-gray-700 rounded-2xl p-3 shadow-2xl z-50 w-[220px] animate-in zoom-in-95 duration-150">
                                <div className="grid grid-cols-6 gap-1.5">
                                    {QUICK_EMOJIS.map((emoji) => (
                                        <button
                                            key={emoji}
                                            type="button"
                                            onClick={() => {
                                                insertEmoji(emoji)
                                                setEmojiOpen(false)
                                            }}
                                            className="w-8 h-8 flex items-center justify-center text-lg hover:bg-gray-700 rounded-lg transition active:scale-90"
                                        >
                                            {emoji}
                                        </button>
                                    ))}
                                </div>
                                {/* ── Character count ── */}
                                {value.length > maxLength * 0.85 && (
                                    <div className="text-[10px] text-gray-500 mt-2 text-center">
                                        {value.length}/{maxLength}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Send button / quick reaction ── */}
                {hasText ? (
                    <button
                        type="submit"
                        disabled={disabled}
                        className="mb-1 w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary-dark transition shadow-lg shadow-primary/20 animate-in zoom-in duration-200 disabled:opacity-50"
                        tabIndex={0}
                    >
                        <Send size={18} className="translate-x-[1px] translate-y-[1px]" />
                    </button>
                ) : (
                    <div className="mb-1 w-9 h-9 flex items-center justify-center text-primary">
                        <div
                            onClick={disabled ? undefined : handleQuickReaction}
                            className={`cursor-pointer hover:scale-110 transition active:scale-95 ${disabled ? 'opacity-30 pointer-events-none' : ''}`}
                            title="Szybka reakcja 👍"
                            tabIndex={-1}
                        >
                            <span className="text-xl">👍</span>
                        </div>
                    </div>
                )}
            </form>
        </div>
    )
}
