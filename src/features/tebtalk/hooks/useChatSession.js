// --- useChatSession ---
// Manages auth session, user identity, block state, and initial data loading.
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../services/supabase'
import { sanitizeCachedState } from '../services/tebtalkCache'
import {
  fetchBlocks as queryFetchBlocks,
  fetchRecentChats,
  fetchFriends,
} from '../services/tebtalkQueries'
import { sanitizePlainText, sanitizeImageUrl } from '../../../utils/safeContent'

const STATE_CACHE_TTL_MS = 10 * 60 * 1000

function readCachedState(userId) {
  try {
    const raw = sessionStorage.getItem(`tebtalk_state_${userId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.ts !== 'number' ||
      !('data' in parsed)
    ) {
      sessionStorage.removeItem(`tebtalk_state_${userId}`)
      return null
    }
    if (Date.now() - parsed.ts > STATE_CACHE_TTL_MS) {
      sessionStorage.removeItem(`tebtalk_state_${userId}`)
      return null
    }
    return sanitizeCachedState(parsed.data)
  } catch {
    return null
  }
}

function writeCachedState(userId, data) {
  try {
    sessionStorage.setItem(
      `tebtalk_state_${userId}`,
      JSON.stringify({ ts: Date.now(), data })
    )
  } catch {
    // Ignore quota / private mode failures.
  }
}

/**
 * useChatSession
 *
 * Central auth + block state hook. Loads session, fetches blocks,
 * recent chats, and friends. Populates a cache on first load.
 *
 * @param {string} [fallbackUserId] - Dev fallback when no real session.
 * @returns {{
 *   myId: string|null,
 *   loading: boolean,
 *   error: string|null,
 *   myBlockedIds: string[],
 *   blockedByIds: string[],
 *   recentChats: Array,
 *   friends: Array,
 *   refetch: () => Promise<void>,
 * }}
 */
export default function useChatSession(fallbackUserId) {
  const [myId, setMyId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [myBlockedIds, setMyBlockedIds] = useState([])
  const [blockedByIds, setBlockedByIds] = useState([])
  const [recentChats, setRecentChats] = useState([])
  const [friends, setFriends] = useState([])

  const loadEverything = useCallback(async (userId) => {
    // Try cache first
    const cached = readCachedState(userId)
    if (cached?.recentChats?.length) setRecentChats(cached.recentChats)
    if (cached?.friends?.length) setFriends(cached.friends)
    setLoading(!cached)

    // Fetch fresh data
    const blockState = await queryFetchBlocks(userId)
    setMyBlockedIds(blockState.blocked)
    setBlockedByIds(blockState.blockedBy)

    const [chats, friendsList] = await Promise.all([
      fetchRecentChats(userId, blockState),
      fetchFriends(userId, blockState),
    ])

    const safeChats = (chats || []).map((c) => ({
      ...c,
      full_name: sanitizePlainText(c.full_name, { maxLength: 80 }),
      avatar_url: sanitizeImageUrl(c.avatar_url),
    }))
    const safeFriends = (friendsList || []).map((f) => ({
      ...f,
      full_name: sanitizePlainText(f.full_name, { maxLength: 80 }),
      avatar_url: sanitizeImageUrl(f.avatar_url),
    }))

    setRecentChats(safeChats)
    setFriends(safeFriends)
    writeCachedState(userId, { recentChats: safeChats, friends: safeFriends })
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (cancelled) return
        if (session) {
          setMyId(session.user.id)
          loadEverything(session.user.id)
          return
        }
        // Dev fallback
        if (fallbackUserId) {
          setMyId(fallbackUserId)
          loadEverything(fallbackUserId)
          return
        }
        setError('Sesja wygasła. Zaloguj się ponownie, aby otworzyć wiadomości.')
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('[useChatSession] Failed to load session:', err)
        if (fallbackUserId) {
          setMyId(fallbackUserId)
          loadEverything(fallbackUserId)
          return
        }
        setError('Nie udało się odczytać sesji użytkownika.')
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [fallbackUserId, loadEverything])

  const refetch = useCallback(async () => {
    if (!myId) return
    setLoading(true)
    await loadEverything(myId)
  }, [myId, loadEverything])

  return {
    myId,
    loading,
    error,
    myBlockedIds,
    blockedByIds,
    recentChats,
    friends,
    refetch,
  }
}
