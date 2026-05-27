// --- useGroups ---
// Manages chat groups: create, fetch members, manage roles, join/leave.
import { useState, useCallback } from 'react'
import { supabase } from '../../../services/supabase'
import { sanitizePlainText, sanitizeImageUrl } from '../../../utils/safeContent'
import {
  createGroup as queryCreateGroup,
  fetchGroupMembers as queryFetchMembers,
  updateMemberRole,
  removeMember,
  leaveGroup,
  updateGroup as queryUpdateGroup,
} from '../services/tebtalkQueries'

/**
 * useGroups
 *
 * @param {string|null} myId
 * @param {function} [onError]
 * @param {function} [onSuccess]
 * @returns {{
 *   members: Array,
 *   membersLoading: boolean,
 *   createGroup: (name: string) => Promise<object|null>,
 *   fetchMembers: (groupId: string) => Promise<Array>,
 *   changeMemberRole: (groupId: string, userId: string, newRole: string) => Promise<boolean>,
 *   kickMember: (groupId: string, userId: string) => Promise<boolean>,
 *   leave: (groupId: string) => Promise<boolean>,
 *   updateGroup: (groupId: string, updates: object) => Promise<boolean>,
 *   findMe: (groupId: string) => object|null,
 * }}
 */
export default function useGroups(myId, onError, onSuccess) {
  const [members, setMembers] = useState([])
  const [membersLoading, setMembersLoading] = useState(false)

  const fetchMembers = useCallback(
    async (groupId) => {
      if (!groupId) return []
      setMembersLoading(true)

      const list = await queryFetchMembers(groupId)
      const safe = (list || []).map((m) => ({
        ...m,
        nickname: sanitizePlainText(m.nickname, { maxLength: 80 }),
        profiles: {
          full_name:
            sanitizePlainText(m.profiles?.full_name, { maxLength: 80 }) || 'Użytkownik',
          avatar_url: sanitizeImageUrl(m.profiles?.avatar_url),
        },
      }))
      setMembers(safe)
      setMembersLoading(false)
      return safe
    },
    []
  )

  const createGroup = useCallback(
    async (name) => {
      if (!myId) return null
      const { group, error } = await queryCreateGroup(name, myId)

      if (error || !group) {
        onError?.(error?.message || 'Błąd tworzenia grupy.')
        return null
      }

      onSuccess?.('Grupa utworzona pomyślnie!')
      return group
    },
    [myId, onError, onSuccess]
  )

  const changeMemberRole = useCallback(
    async (groupId, userId, newRole) => {
      const { error } = await updateMemberRole(groupId, userId, newRole)
      if (error) {
        onError?.('Nie udało się zmienić roli użytkownika.')
        return false
      }
      setMembers((prev) =>
        prev.map((m) => (m.user_id === userId ? { ...m, role: newRole } : m))
      )
      return true
    },
    [onError]
  )

  const kickMember = useCallback(
    async (groupId, userId) => {
      const { error } = await removeMember(groupId, userId)
      if (error) {
        onError?.('Nie udało się usunąć użytkownika z grupy.')
        return false
      }
      setMembers((prev) => prev.filter((m) => m.user_id !== userId))
      return true
    },
    [onError]
  )

  const leave = useCallback(
    async (groupId) => {
      if (!myId) return false
      const { error } = await leaveGroup(groupId, myId)
      if (error) {
        onError?.('Nie udało się opuścić grupy.')
        return false
      }
      return true
    },
    [myId, onError]
  )

  const updateGroup = useCallback(
    async (groupId, updates) => {
      const { error } = await queryUpdateGroup(groupId, updates)
      if (error) {
        onError?.('Nie udało się zaktualizować grupy.')
        return false
      }
      onSuccess?.('Grupa zaktualizowana.')
      return true
    },
    [onError, onSuccess]
  )

  const findMe = useCallback(
    (groupId) => {
      if (!myId || !members.length) return null
      return members.find((m) => m.user_id === myId) || null
    },
    [myId, members]
  )

  return {
    members,
    membersLoading,
    createGroup,
    fetchMembers,
    changeMemberRole,
    kickMember,
    leave,
    updateGroup,
    findMe,
  }
}
