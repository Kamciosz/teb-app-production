import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import useGroups from '../hooks/useGroups'

vi.mock('../services/tebtalkQueries', () => ({
  createGroup: vi.fn(),
  fetchGroupMembers: vi.fn(),
  updateMemberRole: vi.fn(),
  removeMember: vi.fn(),
  leaveGroup: vi.fn(),
  updateGroup: vi.fn(),
}))

import {
  createGroup,
  fetchGroupMembers,
  updateMemberRole,
  removeMember,
  leaveGroup,
  updateGroup,
} from '../services/tebtalkQueries'

const mockMembers = [
  { user_id: 'u1', role: 'owner', nickname: null, profiles: { full_name: 'Ja', avatar_url: null } },
  { user_id: 'u2', role: 'member', nickname: 'Gość', profiles: { full_name: 'Ktos', avatar_url: 'https://ex.com/av.jpg' } },
]

describe('useGroups', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a group', async () => {
    const onSuccess = vi.fn()
    vi.mocked(createGroup).mockResolvedValue({
      group: { id: 'g1', name: 'Test Group' },
      error: null,
    })

    const { result } = renderHook(() => useGroups('my-user', undefined, onSuccess))

    let group
    await act(async () => {
      group = await result.current.createGroup('Test Group')
    })

    expect(group?.id).toBe('g1')
    expect(createGroup).toHaveBeenCalledWith('Test Group', 'my-user')
    expect(onSuccess).toHaveBeenCalled()
  })

  it('handles create group error', async () => {
    const onError = vi.fn()
    vi.mocked(createGroup).mockResolvedValue({
      group: null,
      error: new Error('Nazwa grupy jest wymagana.'),
    })

    const { result } = renderHook(() => useGroups('my-user', onError))

    await act(async () => {
      await result.current.createGroup('')
    })

    expect(onError).toHaveBeenCalled()
  })

  it('fetches group members', async () => {
    vi.mocked(fetchGroupMembers).mockResolvedValue(mockMembers)

    const { result } = renderHook(() => useGroups('my-user'))

    await act(async () => {
      await result.current.fetchMembers('g1')
    })

    expect(fetchGroupMembers).toHaveBeenCalledWith('g1')
    expect(result.current.members).toHaveLength(2)
  })

  it('changes member role', async () => {
    vi.mocked(fetchGroupMembers).mockResolvedValue(mockMembers)
    vi.mocked(updateMemberRole).mockResolvedValue({ error: null })

    const { result } = renderHook(() => useGroups('my-user'))

    // Load members first
    await act(async () => {
      await result.current.fetchMembers('g1')
    })

    let success
    await act(async () => {
      success = await result.current.changeMemberRole('g1', 'u2', 'admin')
    })

    expect(success).toBe(true)
    expect(updateMemberRole).toHaveBeenCalledWith('g1', 'u2', 'admin')
  })

  it('handles role change error', async () => {
    const onError = vi.fn()
    vi.mocked(updateMemberRole).mockResolvedValue({ error: new Error('No permission') })

    const { result } = renderHook(() => useGroups('my-user', onError))

    const success = await act(async () => {
      return await result.current.changeMemberRole('g1', 'u2', 'admin')
    })

    expect(success).toBe(false)
    expect(onError).toHaveBeenCalled()
  })

  it('kicks a member', async () => {
    vi.mocked(fetchGroupMembers).mockResolvedValue(mockMembers)
    vi.mocked(removeMember).mockResolvedValue({ error: null })

    const { result } = renderHook(() => useGroups('my-user'))

    await act(async () => {
      await result.current.fetchMembers('g1')
    })

    let success
    await act(async () => {
      success = await result.current.kickMember('g1', 'u2')
    })

    expect(success).toBe(true)
    expect(removeMember).toHaveBeenCalledWith('g1', 'u2')
    expect(result.current.members).toHaveLength(1)
  })

  it('lets user leave a group', async () => {
    vi.mocked(leaveGroup).mockResolvedValue({ error: null })

    const { result } = renderHook(() => useGroups('my-user'))

    let success
    await act(async () => {
      success = await result.current.leave('g1')
    })

    expect(success).toBe(true)
    expect(leaveGroup).toHaveBeenCalledWith('g1', 'my-user')
  })

  it('handles leave error', async () => {
    const onError = vi.fn()
    vi.mocked(leaveGroup).mockResolvedValue({ error: new Error('Cannot leave') })

    const { result } = renderHook(() => useGroups('my-user', onError))

    let success
    await act(async () => {
      success = await result.current.leave('g1')
    })

    expect(success).toBe(false)
    expect(onError).toHaveBeenCalled()
  })

  it('updates group settings', async () => {
    const onSuccess = vi.fn()
    vi.mocked(updateGroup).mockResolvedValue({ error: null })

    const { result } = renderHook(() => useGroups('my-user', undefined, onSuccess))

    let success
    await act(async () => {
      success = await result.current.updateGroup('g1', { name: 'New Name' })
    })

    expect(success).toBe(true)
    expect(onSuccess).toHaveBeenCalled()
  })

  it('finds current user in members', async () => {
    vi.mocked(fetchGroupMembers).mockResolvedValue(mockMembers)

    const { result } = renderHook(() => useGroups('u1'))

    await act(async () => {
      await result.current.fetchMembers('g1')
    })

    const me = result.current.findMe()
    expect(me?.user_id).toBe('u1')
    expect(me?.role).toBe('owner')
  })

  it('returns null for findMe when not a member', async () => {
    vi.mocked(fetchGroupMembers).mockResolvedValue(mockMembers)

    const { result } = renderHook(() => useGroups('not-a-member'))

    await act(async () => {
      await result.current.fetchMembers('g1')
    })

    expect(result.current.findMe()).toBeNull()
  })
})
