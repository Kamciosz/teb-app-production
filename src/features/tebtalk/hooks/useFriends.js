// --- useFriends ---
// Manages friend list, friend requests, block/unblock operations.
import { useState, useCallback } from 'react'
import { supabase } from '../../../services/supabase'
import { sanitizePlainText, sanitizeImageUrl } from '../../../utils/safeContent'
import {
  fetchFriends as queryFetchFriends,
  sendFriendRequest as querySendRequest,
  toggleBlockQuery,
} from '../services/tebtalkQueries'

/**
 * useFriends
 *
 * @param {string|null} myId
 * @param {string[]} myBlockedIds
 * @param {string[]} blockedByIds
 * @param {function} [onError] - Called with error string.
 * @param {function} [onSuccess] - Called with success string.
 * @returns {{
 *   friends: Array,
 *   loading: boolean,
 *   fetchList: () => Promise<Array>,
 *   sendRequest: (friendId: string) => Promise<void>,
 *   toggleBlock: (userId: string) => Promise<'blocked'|'unblocked'|null>,
 *   isBlocked: (userId: string) => boolean,
 *   isFriend: (userId: string) => boolean,
 * }}
 */
export default function useFriends(myId, myBlockedIds, blockedByIds, onError, onSuccess) {
  const [friends, setFriends] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchList = useCallback(async () => {
    if (!myId) return []
    setLoading(true)

    const blockState = { blocked: myBlockedIds, blockedBy: blockedByIds }
    const list = await queryFetchFriends(myId, blockState)

    const safe = (list || []).map((f) => ({
      ...f,
      full_name: sanitizePlainText(f.full_name, { maxLength: 80 }),
      avatar_url: sanitizeImageUrl(f.avatar_url),
    }))
    setFriends(safe)
    setLoading(false)
    return safe
  }, [myId, myBlockedIds, blockedByIds])

  const sendRequest = useCallback(
    async (friendId) => {
      if (!myId || !friendId) return
      if (myBlockedIds.includes(friendId) || blockedByIds.includes(friendId)) {
        onError?.('Relacja jest zablokowana. Najpierw odblokuj użytkownika.')
        return
      }

      const { error } = await querySendRequest(myId, friendId)
      if (error) {
        onError?.('Nie udało się wysłać zaproszenia.')
      } else {
        onSuccess?.('Zaproszenie wysłane!')
      }
    },
    [myId, myBlockedIds, blockedByIds, onError, onSuccess]
  )

  const toggleBlock = useCallback(
    async (userId) => {
      if (!myId) return null
      const isCurrentlyBlocked = myBlockedIds.includes(userId)

      const { action, error } = await toggleBlockQuery(myId, userId, isCurrentlyBlocked)

      if (error) {
        const verb = isCurrentlyBlocked ? 'odblokować' : 'zablokować'
        onError?.(`Nie udało się ${verb} użytkownika.`)
        return null
      }

      if (action === 'blocked') {
        onSuccess?.('Użytkownik został zablokowany.')
      } else {
        onSuccess?.('Użytkownik został odblokowany.')
      }

      return action
    },
    [myId, myBlockedIds, onError, onSuccess]
  )

  const isBlocked = useCallback(
    (userId) => myBlockedIds.includes(userId) || blockedByIds.includes(userId),
    [myBlockedIds, blockedByIds]
  )

  const isFriend = useCallback(
    (userId) => friends.some((f) => f.id === userId),
    [friends]
  )

  return {
    friends,
    loading,
    fetchList,
    sendRequest,
    toggleBlock,
    isBlocked,
    isFriend,
  }
}
