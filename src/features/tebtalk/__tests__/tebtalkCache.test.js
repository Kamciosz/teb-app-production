import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  isValidCachedMessage,
  sanitizeCachedMessages,
  sanitizeCachedState,
  MAX_MESSAGES_IN_MEMORY,
} from '../services/tebtalkCache'

// ===== isValidCachedMessage =====
describe('isValidCachedMessage', () => {
  it('accepts valid message objects', () => {
    const msg = { id: 'm1', sender_id: 'u1', content: 'hello', created_at: '2024-01-01T00:00:00Z' }
    expect(isValidCachedMessage(msg)).toBe(true)
  })

  it('accepts numeric IDs', () => {
    const msg = { id: 123, sender_id: 'u1', content: 'hello', created_at: '2024-01-01T00:00:00Z' }
    expect(isValidCachedMessage(msg)).toBe(true)
  })

  it('rejects null/undefined', () => {
    expect(isValidCachedMessage(null)).toBe(false)
    expect(isValidCachedMessage(undefined)).toBe(false)
  })

  it('rejects non-objects', () => {
    expect(isValidCachedMessage('string')).toBe(false)
    expect(isValidCachedMessage(42)).toBe(false)
  })

  it('rejects missing id', () => {
    expect(isValidCachedMessage({ sender_id: 'u1', content: 'hello', created_at: '2024-01-01T00:00:00Z' })).toBe(false)
  })

  it('rejects missing sender_id', () => {
    expect(isValidCachedMessage({ id: 'm1', content: 'hello', created_at: '2024-01-01T00:00:00Z' })).toBe(false)
  })

  it('rejects empty sender_id', () => {
    expect(isValidCachedMessage({ id: 'm1', sender_id: '', content: 'hello', created_at: '2024-01-01T00:00:00Z' })).toBe(false)
  })

  it('rejects missing content', () => {
    expect(isValidCachedMessage({ id: 'm1', sender_id: 'u1', created_at: '2024-01-01T00:00:00Z' })).toBe(false)
  })

  it('rejects non-string content', () => {
    expect(isValidCachedMessage({ id: 'm1', sender_id: 'u1', content: 42, created_at: '2024-01-01T00:00:00Z' })).toBe(false)
  })

  it('rejects missing created_at', () => {
    expect(isValidCachedMessage({ id: 'm1', sender_id: 'u1', content: 'hello' })).toBe(false)
  })
})

// ===== sanitizeCachedMessages =====
describe('sanitizeCachedMessages', () => {
  it('returns null for non-array', () => {
    expect(sanitizeCachedMessages(null)).toBeNull()
    expect(sanitizeCachedMessages('string')).toBeNull()
    expect(sanitizeCachedMessages({})).toBeNull()
  })

  it('filters invalid messages', () => {
    const data = [
      { id: 'm1', sender_id: 'u1', content: 'valid', created_at: '2024-01-01T00:00:00Z' },
      { id: 'm2', sender_id: '', content: '', created_at: '' }, // invalid
      null,
      'string',
    ]
    const result = sanitizeCachedMessages(data)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('m1')
  })

  it('returns null when all messages are invalid', () => {
    expect(sanitizeCachedMessages([null, 'bad'])).toBeNull()
  })

  it('caps at MAX_MESSAGES_IN_MEMORY', () => {
    const many = Array.from({ length: MAX_MESSAGES_IN_MEMORY + 50 }, (_, i) => ({
      id: `m${i}`, sender_id: 'u1', content: `msg ${i}`, created_at: '2024-01-01T00:00:00Z'
    }))
    const result = sanitizeCachedMessages(many)
    expect(result.length).toBeLessThanOrEqual(MAX_MESSAGES_IN_MEMORY)
  })
})

// ===== sanitizeCachedState =====
describe('sanitizeCachedState', () => {
  it('returns null for invalid input', () => {
    expect(sanitizeCachedState(null)).toBeNull()
    expect(sanitizeCachedState('string')).toBeNull()
  })

  it('filters invalid recentChats', () => {
    const data = {
      recentChats: [{ id: 'valid' }, { noId: true }, null, 'string'],
      friends: [{ id: 'f1' }],
    }
    const result = sanitizeCachedState(data)
    expect(result.recentChats).toHaveLength(1)
    expect(result.recentChats[0].id).toBe('valid')
    expect(result.friends).toHaveLength(1)
  })

  it('handles missing arrays', () => {
    const result = sanitizeCachedState({})
    expect(result.recentChats).toEqual([])
    expect(result.friends).toEqual([])
  })
})
