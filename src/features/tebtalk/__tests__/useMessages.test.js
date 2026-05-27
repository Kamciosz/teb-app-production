import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import useMessages from '../hooks/useMessages'

// Mock supabase for realtime
vi.mock('../../../services/supabase', () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: vi.fn(() => ({ subscribe: vi.fn() })),
    })),
    removeChannel: vi.fn(),
  },
}))

vi.mock('../services/tebtalkQueries', () => ({
  fetchMessages: vi.fn(),
  loadOlderMessages: vi.fn(),
  sendMessage: vi.fn(),
  sendImage: vi.fn(),
  deleteMessage: vi.fn(),
  deleteGroupMessage: vi.fn(),
}))

vi.mock('../services/tebtalkCache', () => ({
  isValidCachedMessage: vi.fn(() => true),
}))

import { fetchMessages, loadOlderMessages, sendMessage, deleteMessage, deleteGroupMessage } from '../services/tebtalkQueries'

const mockMessages = [
  { id: 'm1', sender_id: 'u1', content: 'Hello', created_at: '2026-01-01T00:00:00Z' },
  { id: 'm2', sender_id: 'u2', content: 'Hi!', created_at: '2026-01-01T00:00:01Z' },
]

describe('useMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
  })

  it('fetches messages on mount for a private chat', async () => {
    vi.mocked(fetchMessages).mockResolvedValue({
      messages: mockMessages,
      error: null,
      hasMore: false,
    })

    const { result } = renderHook(() =>
      useMessages('my-user', { id: 'chat-user', type: 'private' })
    )

    await waitFor(() => {
      expect(fetchMessages).toHaveBeenCalled()
    })

    expect(fetchMessages).toHaveBeenCalledWith('my-user', 'chat-user', false, 120)
  })

  it('fetches messages for a group chat', async () => {
    vi.mocked(fetchMessages).mockResolvedValue({
      messages: mockMessages,
      error: null,
      hasMore: true,
    })

    const { result } = renderHook(() =>
      useMessages('my-user', { id: 'group-id', type: 'group' })
    )

    await waitFor(() => {
      expect(fetchMessages).toHaveBeenCalledWith('my-user', 'group-id', true, 120)
    })

    await waitFor(() => {
      expect(result.current.hasOlder).toBe(true)
    })
  })

  it('sets error when fetch fails', async () => {
    const onError = vi.fn()
    vi.mocked(fetchMessages).mockResolvedValue({
      messages: null,
      error: new Error('DB error'),
      hasMore: false,
    })

    const { result } = renderHook(() =>
      useMessages('my-user', { id: 'u1', type: 'private' }, onError)
    )

    await waitFor(() => {
      expect(result.current.error).toBeTruthy()
    })
    expect(onError).toHaveBeenCalled()
  })

  it('loads older messages', async () => {
    vi.mocked(fetchMessages).mockResolvedValue({
      messages: mockMessages,
      error: null,
      hasMore: false,
    })
    vi.mocked(loadOlderMessages).mockResolvedValue({
      messages: [{ id: 'm0', sender_id: 'u0', content: 'Older', created_at: '2025-12-31T00:00:00Z' }],
      error: null,
      hasMore: false,
    })

    const { result } = renderHook(() =>
      useMessages('my-user', { id: 'u1', type: 'private' })
    )

    // Wait for initial fetch
    await waitFor(() => {
      expect(fetchMessages).toHaveBeenCalled()
    })

    // Now call loadOlder
    await act(async () => {
      await result.current.loadOlderMessages()
    })

    expect(loadOlderMessages).toHaveBeenCalled()
    // Messages should include the older one
    expect(result.current.loadingOlder).toBe(false)
  })

  it('does not load older when no messages', async () => {
    vi.mocked(fetchMessages).mockResolvedValue({
      messages: [],
      error: null,
      hasMore: false,
    })

    const { result } = renderHook(() =>
      useMessages('my-user', { id: 'u1', type: 'private' })
    )

    await waitFor(() => {
      expect(fetchMessages).toHaveBeenCalled()
    })

    await act(async () => {
      await result.current.loadOlderMessages()
    })
    expect(loadOlderMessages).not.toHaveBeenCalled()
  })

  it('provides sendMessage function', async () => {
    vi.mocked(fetchMessages).mockResolvedValue({
      messages: [],
      error: null,
      hasMore: false,
    })
    vi.mocked(sendMessage).mockResolvedValue({
      data: { id: 'new-msg', sender_id: 'my-user', content: 'test', created_at: '2026-01-01T00:00:00Z' },
      error: null,
    })

    const { result } = renderHook(() =>
      useMessages('my-user', { id: 'u1', type: 'private' })
    )

    await waitFor(() => {
      expect(fetchMessages).toHaveBeenCalled()
    })

    await act(async () => {
      await result.current.sendMessage('test message')
    })

    expect(sendMessage).toHaveBeenCalled()
  })

  it('provides deleteMessage function', async () => {
    vi.mocked(fetchMessages).mockResolvedValue({
      messages: mockMessages,
      error: null,
      hasMore: false,
    })
    vi.mocked(deleteMessage).mockResolvedValue({ error: null })

    const { result } = renderHook(() =>
      useMessages('my-user', { id: 'u1', type: 'private' })
    )

    await waitFor(() => {
      expect(fetchMessages).toHaveBeenCalled()
    })

    await act(async () => {
      await result.current.deleteMessage('m1')
    })

    expect(deleteMessage).toHaveBeenCalledWith('m1', 'my-user')
  })

  it('provides deleteMessage for group messages', async () => {
    vi.mocked(fetchMessages).mockResolvedValue({
      messages: mockMessages,
      error: null,
      hasMore: false,
    })
    vi.mocked(deleteGroupMessage).mockResolvedValue({ error: null })

    const { result } = renderHook(() =>
      useMessages('my-user', { id: 'group-id', type: 'group' })
    )

    await waitFor(() => {
      expect(fetchMessages).toHaveBeenCalled()
    })

    await act(async () => {
      await result.current.deleteMessage('m1')
    })

    expect(deleteGroupMessage).toHaveBeenCalledWith('m1', 'my-user')
  })

  it('provides scrollToBottom and scrollRef', () => {
    const { result } = renderHook(() =>
      useMessages('my-user', { id: 'u1', type: 'private' })
    )

    expect(typeof result.current.scrollToBottom).toBe('function')
    expect(result.current.scrollRef).toBeDefined()
  })

  it('returns loading state', () => {
    vi.mocked(fetchMessages).mockImplementation(
      () => new Promise(() => {}) // never resolves
    )

    const { result } = renderHook(() =>
      useMessages('my-user', { id: 'u1', type: 'private' })
    )

    expect(result.current.loading).toBe(true)
  })

  it('handles error in sendMessage', async () => {
    const onError = vi.fn()
    vi.mocked(fetchMessages).mockResolvedValue({
      messages: [],
      error: null,
      hasMore: false,
    })
    vi.mocked(sendMessage).mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'permission denied' },
    })

    const { result } = renderHook(() =>
      useMessages('my-user', { id: 'u1', type: 'private' }, onError)
    )

    await waitFor(() => {
      expect(fetchMessages).toHaveBeenCalled()
    })

    await act(async () => {
      await result.current.sendMessage('hello')
    })

    expect(onError).toHaveBeenCalled()
  })
})
