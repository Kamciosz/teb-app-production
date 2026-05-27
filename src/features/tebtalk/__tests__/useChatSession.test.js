import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import useChatSession from '../hooks/useChatSession'

// Mock supabase
const mockSessionData = { data: { session: { user: { id: 'test-user-1' } } } }
const mockBlocksData = {
  data: [
    { blocked_user_id: 'blocked-1' },
    { blocked_user_id: 'blocked-2' },
  ],
  error: null,
}
const mockBlockedMeData = { data: [{ blocking_user_id: 'blocker-1' }], error: null }
const mockChatsData = { data: [], error: null }
const mockFriendsData = { data: [], error: null }
const mockProfilesData = { data: [], error: null }
const mockGroupMembersData = { data: [], error: null }

const mockChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
  single: vi.fn().mockResolvedValue({ data: null, error: null }),
  in: vi.fn().mockReturnThis(),
  or: vi.fn().mockReturnThis(),
  ilike: vi.fn().mockReturnThis(),
  neq: vi.fn().mockReturnThis(),
  then: vi.fn((resolve) => resolve({ error: null })),
}

vi.mock('../../../services/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
    from: vi.fn(() => mockChain),
    channel: vi.fn(() => ({
      on: vi.fn(() => ({ subscribe: vi.fn() })),
    })),
    removeChannel: vi.fn(),
  },
}))

vi.mock('../services/tebtalkCache', () => ({
  sanitizeCachedState: vi.fn((d) => d),
  isValidCachedMessage: vi.fn(() => true),
}))

describe('useChatSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    vi.mocked(mockChain.select).mockReturnThis()
    vi.mocked(mockChain.eq).mockReturnThis()
    vi.mocked(mockChain.order).mockReturnThis()
    vi.mocked(mockChain.limit).mockResolvedValue({ data: [], error: null })
  })

  it('loads session and fetches initial data', async () => {
    const supabase = (await import('../../../services/supabase')).supabase
    vi.mocked(supabase.auth.getSession).mockResolvedValue(mockSessionData)

    // Mock blocks
    vi.mocked(mockChain.eq)
      .mockReturnThis()
      // First eq('blocking_user_id', ...) → fetchBlocks
      .mockReturnValueOnce(mockChain) // eq('blocking_user_id', 'test-user-1')
      .mockReturnValueOnce(mockChain) // eq('blocked_user_id', 'test-user-1')
      .mockReturnValueOnce(mockChain) // eq('user_id', userId) for fetchRecentChats (sent)
      .mockReturnValueOnce(mockChain) // eq('receiver_id', userId) for fetchRecentChats (recv)
      .mockReturnValueOnce(mockChain) // eq('user_id', userId) for fetchFriends
      .mockReturnValueOnce(mockChain) // eq('status', 'accepted')
      .mockReturnValueOnce(mockChain) // eq('user_id', userId) for groups

    const { result } = renderHook(() => useChatSession())

    await waitFor(() => {
      expect(result.current.myId).toBe('test-user-1')
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(Array.isArray(result.current.myBlockedIds)).toBe(true)
    expect(Array.isArray(result.current.blockedByIds)).toBe(true)
    expect(Array.isArray(result.current.recentChats)).toBe(true)
    expect(Array.isArray(result.current.friends)).toBe(true)
  })

  it('handles no session with fallback', async () => {
    const supabase = (await import('../../../services/supabase')).supabase
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
    })

    const { result } = renderHook(() => useChatSession('local-fallback'))

    await waitFor(() => {
      expect(result.current.myId).toBe('local-fallback')
    })

    expect(result.current.loading).toBe(false)
  })

  it('shows error when no session and no fallback', async () => {
    const supabase = (await import('../../../services/supabase')).supabase
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
    })

    const { result } = renderHook(() => useChatSession())

    await waitFor(() => {
      expect(result.current.error).toBeTruthy()
    })

    expect(result.current.myId).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it('handles getSession error with fallback', async () => {
    const supabase = (await import('../../../services/supabase')).supabase
    vi.mocked(supabase.auth.getSession).mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useChatSession('local-fallback'))
    await waitFor(() => {
      expect(result.current.myId).toBe('local-fallback')
    })
  })

  it('sets error on getSession failure without fallback', async () => {
    const supabase = (await import('../../../services/supabase')).supabase
    vi.mocked(supabase.auth.getSession).mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useChatSession())

    await waitFor(() => {
      expect(result.current.error).toBeTruthy()
    })
  })

  it('provides refetch function', async () => {
    const supabase = (await import('../../../services/supabase')).supabase
    vi.mocked(supabase.auth.getSession).mockResolvedValue(mockSessionData)

    const { result } = renderHook(() => useChatSession())

    await waitFor(() => {
      expect(result.current.myId).toBe('test-user-1')
    })

    expect(typeof result.current.refetch).toBe('function')
  })
})
