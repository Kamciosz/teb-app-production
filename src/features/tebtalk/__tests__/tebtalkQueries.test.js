import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  normalizePrivateTarget,
  isBlockedRelationship,
  isAcceptedFriend,
  appendIncomingMessage,
  fetchBlocks,
  fetchFriends,
  fetchRecentChats,
  fetchMessages,
  sendMessage,
  deleteMessage,
  deleteGroupMessage,
  createGroup,
  addMember,
  sendFriendRequest,
  toggleBlockQuery,
  searchProfiles,
} from '../services/tebtalkQueries'

// Global clean — vi.hoisted runs before vi.mock
const { sharedChain } = vi.hoisted(() => {
  const sharedChain = {}
  return { sharedChain }
})

vi.mock('../../../services/supabase', () => {
  return {
    supabase: {
      from: vi.fn(() => sharedChain),
      channel: vi.fn(() => ({ on: vi.fn(() => ({ subscribe: vi.fn() })) })),
      removeChannel: vi.fn(),
    },
  }
})

beforeEach(() => {
  // Reset all mocks but preserve mockReturnThis chain implementations
  vi.clearAllMocks()
  // Re-stub the chain methods that were cleared by clearAllMocks
  sharedChain.select = vi.fn(() => sharedChain)
  sharedChain.eq = vi.fn(() => sharedChain)
  sharedChain.order = vi.fn(() => sharedChain)
  sharedChain.in = vi.fn(() => sharedChain)
  sharedChain.or = vi.fn(() => sharedChain)
  sharedChain.lt = vi.fn(() => sharedChain)
  sharedChain.ilike = vi.fn(() => sharedChain)
  sharedChain.neq = vi.fn(() => sharedChain)
  sharedChain.gte = vi.fn(() => sharedChain)
  sharedChain.limit = vi.fn().mockResolvedValue({ data: [], error: null })
  sharedChain.single = vi.fn().mockResolvedValue({ data: null, error: null })
  // Make the chain itself then-able so await returns testable data
  sharedChain.then = vi.fn(resolve => resolve({ data: [], error: null }))
  sharedChain.catch = vi.fn()
  sharedChain.insert = vi.fn(() => {
    const result = {
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
      then: vi.fn(resolve => resolve({ data: null, error: null })),
      catch: vi.fn(),
    }
    return result
  })
  sharedChain.update = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })),
  }))
  sharedChain.delete = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })),
  }))
})

// ===== normalizePrivateTarget =====
describe('normalizePrivateTarget (tebtalkQueries)', () => {
  it('returns null for missing id', () => {
    expect(normalizePrivateTarget(null)).toBeNull()
    expect(normalizePrivateTarget({})).toBeNull()
    expect(normalizePrivateTarget({ id: null })).toBeNull()
  })

  it('normalizes a valid target', () => {
    const target = { id: 'u1', full_name: 'Jan Kowalski', role: 'admin', avatar_url: 'https://example.com/av.jpg' }
    const result = normalizePrivateTarget(target)
    expect(result).toMatchObject({
      id: 'u1', full_name: 'Jan Kowalski', role: 'admin',
      avatar_url: 'https://example.com/av.jpg', dm_friends_only: false, type: 'private',
    })
  })

  it('applies defaults for missing fields', () => {
    const result = normalizePrivateTarget({ id: 'u1' })
    expect(result.full_name).toBe('Użytkownik')
    expect(result.role).toBe('student')
    expect(result.avatar_url).toBe('')
  })

  it('sanitizes full_name via sanitizePlainText (maxLength 80)', () => {
    const longName = 'A'.repeat(200)
    const result = normalizePrivateTarget({ id: 'u1', full_name: longName })
    expect(result.full_name.length).toBeLessThanOrEqual(80)
  })

  it('sanitizes avatar_url via sanitizeImageUrl', () => {
    const result = normalizePrivateTarget({ id: 'u1', avatar_url: '   ' })
    expect(result.avatar_url).toBe('')
  })
})

// ===== isBlockedRelationship =====
describe('isBlockedRelationship (tebtalkQueries)', () => {
  it('returns true if user is in myBlockedIds', () => {
    expect(isBlockedRelationship('u2', ['u2', 'u3'], [])).toBe(true)
  })
  it('returns true if user is in blockedByIds', () => {
    expect(isBlockedRelationship('u2', [], ['u2'])).toBe(true)
  })
  it('returns false if user is not blocked', () => {
    expect(isBlockedRelationship('u2', ['u3'], ['u4'])).toBe(false)
  })
  it('returns false for empty lists', () => {
    expect(isBlockedRelationship('u2', [], [])).toBe(false)
  })
})

// ===== isAcceptedFriend =====
describe('isAcceptedFriend (tebtalkQueries)', () => {
  it('returns true if userId is in friends list', () => {
    expect(isAcceptedFriend('u1', [{ id: 'u1' }, { id: 'u2' }])).toBe(true)
  })
  it('returns false if userId is not in friends list', () => {
    expect(isAcceptedFriend('u3', [{ id: 'u1' }])).toBe(false)
  })
  it('returns false for empty friends list', () => {
    expect(isAcceptedFriend('u1', [])).toBe(false)
  })
})

// ===== appendIncomingMessage =====
describe('appendIncomingMessage (tebtalkQueries)', () => {
  it('appends new message', () => {
    const result = appendIncomingMessage([{ id: 'm1' }, { id: 'm2' }], { id: 'm3' }, 300)
    expect(result).toHaveLength(3)
  })
  it('skips duplicate message by id', () => {
    expect(appendIncomingMessage([{ id: 'm1' }, { id: 'm2' }], { id: 'm1' }, 300)).toHaveLength(2)
  })
  it('caps at maxMessages', () => {
    const prev = Array.from({ length: 300 }, (_, i) => ({ id: `m${i}` }))
    expect(appendIncomingMessage(prev, { id: 'new' }, 300).length).toBeLessThanOrEqual(300)
  })
  it('defaults to 300 max', () => {
    const prev = Array.from({ length: 300 }, (_, i) => ({ id: `m${i}` }))
    expect(appendIncomingMessage(prev, { id: 'new' }).length).toBeLessThanOrEqual(300)
  })
  it('returns new array reference (immutable)', () => {
    const prev = [{ id: 'm1' }]
    expect(appendIncomingMessage(prev, { id: 'm2' }, 300)).not.toBe(prev)
  })
})

// ===== fetchBlocks =====
describe('fetchBlocks', () => {
  it('returns blocked and blockedBy arrays from supabase', async () => {
    sharedChain.then = vi.fn()
      .mockImplementationOnce(resolve => resolve({ data: [{ blocked_user_id: 'u2' }, { blocked_user_id: 'u3' }], error: null }))
      .mockImplementationOnce(resolve => resolve({ data: [], error: null }))
    sharedChain.limit.mockResolvedValue({ data: [], error: null })
    const result = await fetchBlocks('user-1')
    expect(result).toEqual({ blocked: ['u2', 'u3'], blockedBy: [] })
  })

  it('handles empty results', async () => {
    sharedChain.eq = vi.fn().mockResolvedValue({ data: [], error: null })
    sharedChain.limit.mockResolvedValue({ data: [], error: null })
    const result = await fetchBlocks('user-1')
    expect(result).toEqual({ blocked: [], blockedBy: [] })
  })
})

// ===== fetchFriends =====
describe('fetchFriends', () => {
  it('returns friend profiles filtering blocked users', async () => {
    sharedChain.then = vi.fn(resolve => resolve({
      data: [
        { friend_id: 'u2', profiles: { id: 'u2', full_name: 'Jan', avatar_url: '', role: 'student' } },
        { friend_id: 'u3', profiles: { id: 'u3', full_name: 'Anna', avatar_url: '', role: 'student' } },
      ],
      error: null,
    }))
    const result = await fetchFriends('user-1', { blocked: [], blockedBy: [] })
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('u2')
    expect(result[1].id).toBe('u3')
  })

  it('filters out blocked users', async () => {
    sharedChain.then = vi.fn(resolve => resolve({
      data: [
        { friend_id: 'u2', profiles: { id: 'u2', full_name: 'Jan', avatar_url: '', role: 'student' } },
        { friend_id: 'u3', profiles: { id: 'u3', full_name: 'Anna', avatar_url: '', role: 'student' } },
      ],
      error: null,
    }))
    const result = await fetchFriends('user-1', { blocked: ['u2'], blockedBy: [] })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('u3')
  })

  it('falls back to separate queries when JOIN fails', async () => {
    let thenCallCount = 0
    sharedChain.then = vi.fn(resolve => {
      thenCallCount++
      // First await (JOIN) returns null → fallback triggered
      if (thenCallCount === 1) return resolve({ data: null, error: null })
      // Second await (fallback friends select) returns friend IDs
      if (thenCallCount === 2) return resolve({ data: [{ friend_id: 'u2' }, { friend_id: 'u3' }], error: null })
      // Third await (profiles lookup) returns profile data
      return resolve({ data: [{ id: 'u2', full_name: 'Jan', role: 'student' }], error: null })
    })
    const result = await fetchFriends('user-1', { blocked: [], blockedBy: [] })
    expect(Array.isArray(result)).toBe(true)
  })

  it('returns empty array when no friends', async () => {
    const result = await fetchFriends('user-1', { blocked: [], blockedBy: [] })
    expect(result).toEqual([])
  })
})

// ===== fetchMessages =====
describe('fetchMessages', () => {
  it('returns chronological messages', async () => {
    sharedChain.limit.mockResolvedValue({
      data: [
        { id: 'm2', content: 'message 2', created_at: '2024-01-02T00:00:00Z' },
        { id: 'm1', content: 'message 1', created_at: '2024-01-01T00:00:00Z' },
      ],
      error: null,
    })
    const result = await fetchMessages('user-1', 'user-2', false)
    expect(result.messages).toHaveLength(2)
    expect(result.messages[0].id).toBe('m1')
    expect(result.error).toBeNull()
  })

  it('returns hasMore=true when data length equals limit', async () => {
    sharedChain.limit.mockResolvedValue({
      data: Array.from({ length: 120 }, (_, i) => ({ id: `m${i}`, content: `msg ${i}`, created_at: '2024-01-01T00:00:00Z' })),
      error: null,
    })
    const result = await fetchMessages('user-1', 'user-2', false, 120)
    expect(result.hasMore).toBe(true)
  })
})

// ===== sendMessage =====
describe('sendMessage', () => {
  it('sends DM message', async () => {
    sharedChain.insert = vi.fn(() => {
      const result = {
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { id: 'new-msg' }, error: null }),
        })),
        then: vi.fn(resolve => resolve({ data: null, error: null })),
        catch: vi.fn(),
      }
      return result
    })
    const result = await sendMessage('user-1', { id: 'user-2', type: 'private' }, 'Hello!')
    expect(result.data.id).toBe('new-msg')
  })

  it('sends group message', async () => {
    sharedChain.insert = vi.fn(() => {
      const result = {
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { id: 'new-group-msg' }, error: null }),
        })),
        then: vi.fn(resolve => resolve({ data: null, error: null })),
        catch: vi.fn(),
      }
      return result
    })
    const result = await sendMessage('user-1', { id: 'group-1', type: 'group' }, 'Hello group!')
    expect(result.data.id).toBe('new-group-msg')
  })

  it('handles error response', async () => {
    sharedChain.insert = vi.fn(() => {
      const result = {
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Insert failed' } }),
        })),
        then: vi.fn(resolve => resolve({ data: null, error: null })),
        catch: vi.fn(),
      }
      return result
    })
    const result = await sendMessage('user-1', { id: 'user-2', type: 'private' }, 'Hello!')
    expect(result.error).toBeTruthy()
  })
})

// ===== deleteMessage =====
describe('deleteMessage', () => {
  it('soft-deletes DM message', async () => {
    const result = await deleteMessage('msg-1', 'user-1')
    expect(result.error).toBeNull()
  })
})

// ===== deleteGroupMessage =====
describe('deleteGroupMessage', () => {
  it('soft-deletes group message', async () => {
    const result = await deleteGroupMessage('msg-1', 'user-1')
    expect(result.error).toBeNull()
  })
})

// ===== createGroup =====
describe('createGroup', () => {
  it('creates group with creator as admin', async () => {
    sharedChain.insert = vi.fn(() => {
      const result = {
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { id: 'group-1', name: 'Test Group' }, error: null }),
        })),
        then: vi.fn(resolve => resolve({ data: null, error: null })),
        catch: vi.fn(),
      }
      return result
    })
    const result = await createGroup('Test Group', 'user-1')
    expect(result.group.id).toBe('group-1')
    expect(result.error).toBeNull()
  })

  it('rejects empty name', async () => {
    const result = await createGroup('', 'user-1')
    expect(result.group).toBeNull()
    expect(result.error).toBeTruthy()
  })
})

// ===== addMember =====
describe('addMember', () => {
  it('adds a member to a group', async () => {
    const result = await addMember('group-1', 'user-2')
    expect(result.error).toBeNull()
  })
})

// ===== sendFriendRequest =====
describe('sendFriendRequest', () => {
  it('inserts pending friend request', async () => {
    const result = await sendFriendRequest('user-1', 'user-2')
    expect(result.error).toBeNull()
  })
})

// ===== toggleBlockQuery =====
describe('toggleBlockQuery', () => {
  it('blocks a user', async () => {
    const result = await toggleBlockQuery('user-1', 'user-2', false)
    expect(result.action).toBe('blocked')
  })

  it('unblocks a user', async () => {
    const result = await toggleBlockQuery('user-1', 'user-2', true)
    expect(result.action).toBe('unblocked')
  })
})

// ===== searchProfiles =====
describe('searchProfiles', () => {
  it('returns empty array for short queries', async () => {
    const result = await searchProfiles('ab', 'user-1')
    expect(result).toEqual([])
  })

  it('searches profiles with min 3 chars', async () => {
    sharedChain.limit.mockResolvedValue({
      data: [{ id: 'u2', full_name: 'Jan Kowalski', role: 'student' }],
      error: null,
    })
    const result = await searchProfiles('Jan', 'user-1')
    expect(result).toHaveLength(1)
    expect(result[0].full_name).toBe('Jan Kowalski')
  })
})
