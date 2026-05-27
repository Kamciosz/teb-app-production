import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import useFriends from '../hooks/useFriends'

vi.mock('../services/tebtalkQueries', () => ({
  fetchFriends: vi.fn(),
  sendFriendRequest: vi.fn(),
  toggleBlockQuery: vi.fn(),
}))

import { fetchFriends, sendFriendRequest, toggleBlockQuery } from '../services/tebtalkQueries'

const mockFriendsList = [
  { id: 'f1', full_name: 'Anna', avatar_url: 'https://example.com/av.jpg', role: 'student' },
  { id: 'f2', full_name: 'Bartek', avatar_url: null, role: 'admin' },
]

describe('useFriends', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches friend list', async () => {
    vi.mocked(fetchFriends).mockResolvedValue(mockFriendsList)

    const { result } = renderHook(() => useFriends('my-user', [], [], undefined, undefined))

    let list
    await act(async () => {
      list = await result.current.fetchList()
    })

    expect(list).toHaveLength(2)
    expect(fetchFriends).toHaveBeenCalled()
  })

  it('returns empty array when no friends', async () => {
    vi.mocked(fetchFriends).mockResolvedValue([])

    const { result } = renderHook(() => useFriends('my-user', [], []))

    await act(async () => {
      await result.current.fetchList()
    })

    expect(result.current.friends).toEqual([])
  })

  it('sends friend request', async () => {
    const onSuccess = vi.fn()
    vi.mocked(sendFriendRequest).mockResolvedValue({ error: null })

    const { result } = renderHook(() => useFriends('my-user', [], [], undefined, onSuccess))

    await act(async () => {
      await result.current.sendRequest('f3')
    })

    expect(sendFriendRequest).toHaveBeenCalledWith('my-user', 'f3')
    expect(onSuccess).toHaveBeenCalled()
  })

  it('blocks send request when user is blocked', async () => {
    const onError = vi.fn()
    const { result } = renderHook(() =>
      useFriends('my-user', ['blocked-user'], [], onError)
    )

    await act(async () => {
      await result.current.sendRequest('blocked-user')
    })

    expect(sendFriendRequest).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalled()
  })

  it('toggles block on', async () => {
    const onSuccess = vi.fn()
    vi.mocked(toggleBlockQuery).mockResolvedValue({ action: 'blocked', error: null })

    const { result } = renderHook(() =>
      useFriends('my-user', [], [], undefined, onSuccess)
    )

    let action
    await act(async () => {
      action = await result.current.toggleBlock('user-to-block')
    })

    expect(action).toBe('blocked')
    expect(toggleBlockQuery).toHaveBeenCalledWith('my-user', 'user-to-block', false)
    expect(onSuccess).toHaveBeenCalled()
  })

  it('toggles block off', async () => {
    const onSuccess = vi.fn()
    vi.mocked(toggleBlockQuery).mockResolvedValue({ action: 'unblocked', error: null })

    const { result } = renderHook(() =>
      useFriends('my-user', ['already-blocked'], [], undefined, onSuccess)
    )

    let action
    await act(async () => {
      action = await result.current.toggleBlock('already-blocked')
    })

    expect(action).toBe('unblocked')
    expect(toggleBlockQuery).toHaveBeenCalledWith('my-user', 'already-blocked', true)
    expect(onSuccess).toHaveBeenCalled()
  })

  it('reports error on block failure', async () => {
    const onError = vi.fn()
    vi.mocked(toggleBlockQuery).mockResolvedValue({ action: null, error: new Error('DB err') })

    const { result } = renderHook(() =>
      useFriends('my-user', [], [], onError)
    )

    let action
    await act(async () => {
      action = await result.current.toggleBlock('user-x')
    })

    expect(action).toBeNull()
    expect(onError).toHaveBeenCalled()
  })

  it('isBlocked checks both directions', () => {
    const { result } = renderHook(() =>
      useFriends('my-user', ['b1', 'b2'], ['b3'])
    )

    expect(result.current.isBlocked('b1')).toBe(true)
    expect(result.current.isBlocked('b2')).toBe(true)
    expect(result.current.isBlocked('b3')).toBe(true)
    expect(result.current.isBlocked('not-blocked')).toBe(false)
  })

  it('isFriend returns true for existing friends', async () => {
    vi.mocked(fetchFriends).mockResolvedValue(mockFriendsList)

    const { result } = renderHook(() => useFriends('my-user', [], []))

    await act(async () => {
      await result.current.fetchList()
    })

    expect(result.current.isFriend('f1')).toBe(true)
    expect(result.current.isFriend('f2')).toBe(true)
    expect(result.current.isFriend('not-friend')).toBe(false)
  })
})
