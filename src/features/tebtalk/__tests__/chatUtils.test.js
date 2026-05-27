import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  formatDateSeparator,
  formatTimestamp,
  groupMessages,
  splitGroupsByDate,
} from '../chat/utils'

// ===== formatDateSeparator =====
describe('formatDateSeparator (chat/utils)', () => {
  it('returns "Dzisiaj" for today', () => {
    const today = new Date()
    expect(formatDateSeparator(today.toISOString())).toBe('Dzisiaj')
  })

  it('returns "Wczoraj" for yesterday', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    expect(formatDateSeparator(yesterday.toISOString())).toBe('Wczoraj')
  })

  it('returns formatted date for older dates', () => {
    const old = new Date('2024-01-15T12:00:00Z')
    const result = formatDateSeparator(old.toISOString())
    expect(result).toContain('stycznia')
    expect(result).toContain('2024')
  })

  it('handles date at midnight boundary', () => {
    const midnight = new Date()
    midnight.setHours(0, 0, 0, 0)
    expect(formatDateSeparator(midnight.toISOString())).toBe('Dzisiaj')
  })

  it('handles invalid date string gracefully', () => {
    const result = formatDateSeparator('invalid-date')
    expect(result).toBe('Invalid Date')
  })
})

// ===== formatTimestamp =====
describe('formatTimestamp (chat/utils)', () => {
  it('returns time in HH:MM format', () => {
    const d = new Date('2024-06-15T14:30:00Z')
    const result = formatTimestamp(d.toISOString())
    expect(result).toMatch(/^\d{2}:\d{2}$/)
  })

  it('handles invalid date string', () => {
    const result = formatTimestamp('invalid')
    expect(result).toBe('Invalid Date')
  })
})

// ===== groupMessages =====
describe('groupMessages (chat/utils)', () => {
  const myId = 'user-1'

  it('returns empty array for empty input', () => {
    expect(groupMessages([], myId)).toEqual([])
  })

  it('groups a single message', () => {
    const msg = { id: 'm1', sender_id: 'user-2', content: 'hello', created_at: new Date().toISOString() }
    const groups = groupMessages([msg], myId)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ type: 'normal', senderId: 'user-2', isMe: false })
    expect(groups[0].messages).toHaveLength(1)
  })

  it('marks own messages as isMe=true', () => {
    const msg = { id: 'm1', sender_id: myId, content: 'hello', created_at: new Date().toISOString() }
    const groups = groupMessages([msg], myId)
    expect(groups[0].isMe).toBe(true)
  })

  it('groups consecutive messages from same sender within time window', () => {
    const now = new Date()
    const msgs = [
      { id: 'm1', sender_id: 'user-2', content: 'first', created_at: now.toISOString() },
      { id: 'm2', sender_id: 'user-2', content: 'second', created_at: new Date(now.getTime() + 60000).toISOString() },
    ]
    const groups = groupMessages(msgs, myId)
    expect(groups).toHaveLength(1)
    expect(groups[0].messages).toHaveLength(2)
  })

  it('splits groups when time window exceeds 5 minutes', () => {
    const now = new Date()
    const msgs = [
      { id: 'm1', sender_id: 'user-2', content: 'first', created_at: now.toISOString() },
      { id: 'm2', sender_id: 'user-2', content: 'second', created_at: new Date(now.getTime() + 6 * 60 * 1000).toISOString() },
    ]
    const groups = groupMessages(msgs, myId)
    expect(groups).toHaveLength(2)
  })

  it('splits groups after 6 messages from same sender', () => {
    const now = new Date()
    const msgs = Array.from({ length: 7 }, (_, i) => ({
      id: `m${i}`,
      sender_id: 'user-2',
      content: `msg ${i}`,
      created_at: new Date(now.getTime() + i * 10000).toISOString(),
    }))
    const groups = groupMessages(msgs, myId)
    expect(groups.length).toBeGreaterThanOrEqual(2)
    expect(groups[0].messages.length).toBeLessThanOrEqual(6)
  })

  it('handles deleted messages as separate groups', () => {
    const msgs = [
      { id: 'm1', sender_id: 'user-2', content: 'hello', created_at: new Date().toISOString() },
      { id: 'm2', sender_id: 'user-2', content: 'deleted', created_at: new Date().toISOString(), is_deleted: true },
      { id: 'm3', sender_id: 'user-2', content: 'world', created_at: new Date().toISOString() },
    ]
    const groups = groupMessages(msgs, myId)
    expect(groups).toHaveLength(3)
    expect(groups[0].type).toBe('normal')
    expect(groups[1].type).toBe('deleted')
    expect(groups[2].type).toBe('normal')
  })

  it('interleaves messages from different senders', () => {
    const now = new Date()
    const msgs = [
      { id: 'm1', sender_id: 'user-2', content: 'from user2', created_at: now.toISOString() },
      { id: 'm2', sender_id: myId, content: 'from me', created_at: new Date(now.getTime() + 10000).toISOString() },
      { id: 'm3', sender_id: 'user-2', content: 'user2 again', created_at: new Date(now.getTime() + 20000).toISOString() },
    ]
    const groups = groupMessages(msgs, myId)
    expect(groups).toHaveLength(3)
    expect(groups[0].senderId).toBe('user-2')
    expect(groups[1].senderId).toBe(myId)
    expect(groups[2].senderId).toBe('user-2')
  })

  it('resolves senderName from sender_name field', () => {
    const msg = { id: 'm1', sender_id: 'user-2', content: 'hi', created_at: new Date().toISOString(), sender_name: 'Jan Kowalski' }
    expect(groupMessages([msg], myId)[0].senderName).toBe('Jan Kowalski')
  })

  it('resolves senderName from profiles.full_name as fallback', () => {
    const msg = { id: 'm1', sender_id: 'user-2', content: 'hi', created_at: new Date().toISOString(), profiles: { full_name: 'Anna Nowak' } }
    expect(groupMessages([msg], myId)[0].senderName).toBe('Anna Nowak')
  })

  it('defaults senderName to Nieznany when no name available', () => {
    const msg = { id: 'm1', sender_id: 'user-2', content: 'hi', created_at: new Date().toISOString() }
    expect(groupMessages([msg], myId)[0].senderName).toBe('Nieznany')
  })
})

// ===== splitGroupsByDate =====
describe('splitGroupsByDate (chat/utils)', () => {
  const myId = 'user-1'

  it('returns empty array for empty grouped messages', () => {
    expect(splitGroupsByDate([], myId)).toEqual([])
  })

  it('splits messages across different dates', () => {
    // Fixed dates to avoid TZ/midnight flakiness
    const jan15 = '2024-01-15T12:00:00.000Z'
    const jan14 = '2024-01-14T12:00:00.000Z'
    const msgs = [
      { id: 'm1', sender_id: 'user-2', content: 'jan14 msg', created_at: jan14 },
      { id: 'm2', sender_id: 'user-2', content: 'jan15 msg', created_at: jan15 },
    ]
    const blocks = splitGroupsByDate(msgs, myId)
    expect(blocks).toHaveLength(2)
    expect(blocks[0].type).toBe('block')
    expect(blocks[0].dateLabel).toContain('stycznia')
    expect(blocks[0].dateLabel).toContain('2024')
    expect(blocks[1].dateLabel).toContain('stycznia')
    expect(blocks[1].dateLabel).toContain('2024')
  })

  it('groups messages from same date into one block', () => {
    const now = new Date()
    const msgs = [
      { id: 'm1', sender_id: 'user-2', content: 'first', created_at: now.toISOString() },
      { id: 'm2', sender_id: 'user-2', content: 'second', created_at: new Date(now.getTime() + 60000).toISOString() },
    ]
    const blocks = splitGroupsByDate(msgs, myId)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].items).toHaveLength(1) // 1 group (same sender)
  })
})
