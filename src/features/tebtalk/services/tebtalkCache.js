// --- TEBtalk cache layer ---
// sessionStorage + in-memory cache helpers for message dedup, validation, and state sanitization.

export const MAX_MESSAGES_IN_MEMORY = 300

/**
 * Validate a single cached message object.
 * Returns true if the message has all required fields with correct types.
 */
export function isValidCachedMessage(message) {
  if (!message || typeof message !== 'object') return false
  if (typeof message.id !== 'string' && typeof message.id !== 'number') return false
  if (typeof message.sender_id !== 'string' || !message.sender_id) return false
  if (typeof message.content !== 'string') return false
  if (typeof message.created_at !== 'string') return false
  return true
}

/**
 * Sanitize an array of cached messages.
 * Filters out invalid entries and caps at MAX_MESSAGES_IN_MEMORY.
 * Returns null if the result would be empty.
 */
export function sanitizeCachedMessages(data) {
  if (!Array.isArray(data)) return null
  const sanitized = data.filter(isValidCachedMessage).slice(-MAX_MESSAGES_IN_MEMORY)
  return sanitized.length ? sanitized : null
}

/**
 * Sanitize a cached state object (recentChats + friends).
 * Filters invalid entries and caps each array.
 */
export function sanitizeCachedState(data) {
  if (!data || typeof data !== 'object') return null
  const safeRecentChats = Array.isArray(data.recentChats)
    ? data.recentChats.filter(chat => chat && typeof chat === 'object' && typeof chat.id === 'string').slice(-200)
    : []
  const safeFriends = Array.isArray(data.friends)
    ? data.friends.filter(friend => friend && typeof friend === 'object' && typeof friend.id === 'string').slice(-300)
    : []
  return { recentChats: safeRecentChats, friends: safeFriends }
}
