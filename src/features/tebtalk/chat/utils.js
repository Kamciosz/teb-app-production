// --- Shared helpers: date separators + Discord-style message grouping ---
// Used by both TEBtalk and Groups.jsx

export const GROUP_TIME_WINDOW_MS = 5 * 60 * 1000

/**
 * Format a date string into a human-readable date separator label (PL locale).
 * Returns 'Dzisiaj', 'Wczoraj', or full date in Polish format.
 */
export function formatDateSeparator(dateStr) {
    const d = new Date(dateStr)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate())

    if (msgDate.getTime() === today.getTime()) return 'Dzisiaj'
    if (msgDate.getTime() === yesterday.getTime()) return 'Wczoraj'
    return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * Format a date string into a short time string (HH:MM in PL locale).
 */
export function formatTimestamp(dateStr) {
    const d = new Date(dateStr)
    return d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Group consecutive messages from the same sender within GROUP_TIME_WINDOW_MS.
 * Returns an array of groups:
 *   { type: 'normal', senderId, senderName, isMe, messages }
 *   { type: 'deleted', messages }
 *
 * senderName resolves from msg.sender_name (for DM), falling back to
 * msg.profiles?.full_name (for group messages with join).
 */
export function groupMessages(messages, myId) {
    if (!messages.length) return []

    const groups = []
    let currentGroup = null

    for (const msg of messages) {
        if (msg.is_deleted) {
            if (currentGroup) {
                groups.push(currentGroup)
                currentGroup = null
            }
            groups.push({ type: 'deleted', messages: [msg] })
            continue
        }

        const isMe = msg.sender_id === myId

        if (
            currentGroup &&
            currentGroup.type === 'normal' &&
            currentGroup.senderId === msg.sender_id
        ) {
            const lastMsg = currentGroup.messages[currentGroup.messages.length - 1]
            const timeDiff = new Date(msg.created_at) - new Date(lastMsg.created_at)
            if (timeDiff <= GROUP_TIME_WINDOW_MS && currentGroup.messages.length < 6) {
                currentGroup.messages.push(msg)
                continue
            }
        }

        if (currentGroup) groups.push(currentGroup)
        currentGroup = {
            type: 'normal',
            senderId: msg.sender_id,
            senderName: msg.sender_name || msg.profiles?.full_name || 'Nieznany',
            isMe,
            messages: [msg],
        }
    }

    if (currentGroup) groups.push(currentGroup)
    return groups
}

/**
 * Split message groups by date boundaries, inserting date separators.
 * Returns an array of blocks:
 *   { type: 'block', items: [groups...], dateLabel: str }
 */
export function splitGroupsByDate(messages, myId) {
    const grouped = groupMessages(messages, myId)
    if (!grouped.length) return []

    const result = []
    let currentDate = null
    let currentBlock = []

    for (const group of grouped) {
        const firstMsg = group.messages ? group.messages[0] : null
        const msgDate = firstMsg?.created_at
            ? new Date(firstMsg.created_at).toDateString()
            : null

        if (msgDate !== currentDate) {
            if (currentBlock.length) {
                result.push({
                    type: 'block',
                    items: currentBlock,
                    dateLabel: formatDateSeparator(firstMsg?.created_at || currentDate),
                })
            }
            currentDate = msgDate
            currentBlock = []
        }

        currentBlock.push(group)
    }

    if (currentBlock.length && currentDate) {
        result.push({
            type: 'block',
            items: currentBlock,
            dateLabel: formatDateSeparator(currentDate),
        })
    }

    return result
}
