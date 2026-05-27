// --- useMessages ---
// Manages message fetching, realtime subscription, caching, scroll, send, delete.
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../../services/supabase'
import { WordFilter } from '../../../services/wordFilter'
import { sanitizePlainText, sanitizeImageUrl } from '../../../utils/safeContent'
import { isValidCachedMessage } from '../services/tebtalkCache'
import {
  fetchMessages as queryFetchMessages,
  loadOlderMessages as queryLoadOlder,
  sendMessage as querySendMessage,
  sendImage as querySendImage,
  deleteMessage as queryDeleteMsg,
  deleteGroupMessage as queryDeleteGroupMsg,
} from '../services/tebtalkQueries'

const INITIAL_LIMIT = 120
const OLDER_LIMIT = 80
const MAX_IN_MEMORY = 300
const CACHE_TTL_MS = 30 * 60 * 1000

function cacheKey(myId, chatId, isGroup) {
  return `${myId}:${isGroup ? 'group' : 'private'}:${chatId}`
}

function readCachedMessages(key) {
  try {
    const raw = sessionStorage.getItem(`tebtalk_messages_${key}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.ts !== 'number' ||
      !('data' in parsed)
    ) {
      sessionStorage.removeItem(`tebtalk_messages_${key}`)
      return null
    }
    if (Date.now() - parsed.ts > CACHE_TTL_MS) {
      sessionStorage.removeItem(`tebtalk_messages_${key}`)
      return null
    }
    const data = Array.isArray(parsed.data) ? parsed.data : null
    if (!data) return null
    const valid = data.filter(isValidCachedMessage).slice(-MAX_IN_MEMORY)
    return valid.length ? valid : null
  } catch {
    return null
  }
}

function writeCachedMessages(key, messages) {
  try {
    const trimmed = messages.slice(-250)
    sessionStorage.setItem(
      `tebtalk_messages_${key}`,
      JSON.stringify({ ts: Date.now(), data: trimmed })
    )
  } catch {
    // Ignore.
  }
}

/**
 * useMessages
 *
 * @param {string|null} myId
 * @param {object|null} activeChatUser - { id, type: 'private'|'group' }
 * @param {function} [onError] - Called with error string when something fails.
 * @returns {{
 *   messages: Array,
 *   loading: boolean,
 *   loadingOlder: boolean,
 *   hasOlder: boolean,
 *   error: string|null,
 *   sendMessage: (text: string) => Promise<void>,
 *   sendImage: (url: string) => Promise<void>,
 *   deleteMessage: (msgId: string) => Promise<void>,
 *   loadOlderMessages: () => Promise<void>,
 *   scrollToBottom: () => void,
 *   scrollRef: React.RefObject,
 * }}
 */
export default function useMessages(myId, activeChatUser, onError) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasOlder, setHasOlder] = useState(false)
  const [error, setError] = useState(null)

  const messagesEndRef = useRef(null)
  const cacheRef = useRef(new Map())

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
  }, [])

  const isGroup = activeChatUser?.type === 'group'
  const chatId = activeChatUser?.id

  // Load messages when chat changes
  useEffect(() => {
    if (!myId || !chatId) return

    const key = cacheKey(myId, chatId, isGroup)
    let cancelled = false

    const load = async () => {
      setError(null)

      // Try cache first
      const inMemory = cacheRef.current.get(key)
      if (Array.isArray(inMemory) && inMemory.length) {
        setMessages(inMemory)
        setLoading(false)
        return
      }

      const fromSession = readCachedMessages(key)
      if (fromSession?.length) {
        cacheRef.current.set(key, fromSession)
        setMessages(fromSession)
        setLoading(false)
        return
      }

      // No cache — fetch from server
      setLoading(true)
      const result = await queryFetchMessages(myId, chatId, isGroup, INITIAL_LIMIT)
      if (cancelled) return

      if (result.error) {
        console.error('[useMessages] Fetch error:', result.error)
        setError('Nie udało się pobrać wiadomości.')
        setMessages([])
        setLoading(false)
        onError?.('Nie udało się pobrać wiadomości.')
        return
      }

      setMessages(result.messages)
      setHasOlder(result.hasMore)
      cacheRef.current.set(key, result.messages)
      writeCachedMessages(key, result.messages)
      setLoading(false)
      scrollToBottom()
    }

    load()

    return () => {
      cancelled = true
    }
  }, [myId, chatId, isGroup, scrollToBottom, onError])

  // Persist on message change
  useEffect(() => {
    if (!myId || !chatId || !messages.length) return
    const key = cacheKey(myId, chatId, isGroup)
    cacheRef.current.set(key, messages)
    writeCachedMessages(key, messages)
  }, [messages, myId, chatId, isGroup])

  // Realtime subscription
  useEffect(() => {
    if (!myId || !chatId) return

    const tableName = isGroup ? 'chat_group_messages' : 'direct_messages'
    const channelName = isGroup ? `group_${chatId}` : 'direct_messages'

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: tableName },
        (payload) => {
          const msg = payload.new
          let relevant = false
          if (isGroup) {
            relevant = msg.group_id === chatId
          } else {
            relevant =
              (msg.sender_id === myId && msg.receiver_id === chatId) ||
              (msg.sender_id === chatId && msg.receiver_id === myId)
          }
          if (!relevant) return

          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev
            const merged = [...prev, msg]
            return merged.slice(-MAX_IN_MEMORY)
          })
          scrollToBottom()
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.warn('[useMessages] Subscription error for:', chatId)
          setError('Połączenie z rozmową zostało przerwane. Odśwież widok.')
          onError?.('Połączenie z rozmową zostało przerwane.')
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [myId, chatId, isGroup, scrollToBottom, onError])

  // Load older messages (pagination)
  const loadOlderMessages = useCallback(async () => {
    if (!myId || !chatId || !messages.length || loadingOlder) return
    const oldest = messages[0]
    if (!oldest?.created_at) return

    setLoadingOlder(true)
    const result = await queryLoadOlder(myId, oldest.created_at, chatId, isGroup, OLDER_LIMIT)

    if (result.error) {
      console.error('[useMessages] Load older error:', result.error)
      setError('Nie udało się pobrać starszych wiadomości.')
      setLoadingOlder(false)
      onError?.('Nie udało się pobrać starszych wiadomości.')
      return
    }

    if (!result.messages?.length) {
      setHasOlder(false)
      setLoadingOlder(false)
      return
    }

    setMessages((prev) => {
      const merged = [...result.messages, ...prev]
      return merged.slice(-MAX_IN_MEMORY)
    })
    setHasOlder(result.hasMore)
    setLoadingOlder(false)
  }, [myId, chatId, isGroup, messages, loadingOlder, onError])

  // Send a text message
  const sendMessage = useCallback(
    async (text) => {
      if (!myId || !activeChatUser || !text?.trim()) return

      const sanitized = sanitizePlainText(text, {
        maxLength: 2000,
        preserveLineBreaks: true,
      })
      if (!sanitized) return

      const tempId = Math.random().toString(36).substring(7)
      const optimistic = {
        id: tempId,
        sender_id: myId,
        [isGroup ? 'group_id' : 'receiver_id']: chatId,
        content: WordFilter.clean(sanitized),
        created_at: new Date().toISOString(),
        status: 'sending',
      }

      setMessages((prev) => [...prev, optimistic])
      scrollToBottom()

      const { data, error: sendErr } = await querySendMessage(myId, activeChatUser, sanitized)

      if (sendErr) {
        console.error('[useMessages] Send error:', sendErr)
        const blocked =
          sendErr.code === '42501' ||
          /row-level security|permission denied/i.test(sendErr.message || '')
        const msg = blocked
          ? 'Ta osoba nie przyjmuje od Ciebie wiadomości lub istnieje blokada.'
          : 'Nie udało się wysłać wiadomości.'
        onError?.(msg)
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: 'error' } : m))
        )
      } else if (data) {
        setMessages((prev) => {
          const withoutTemp = prev.filter((m) => m.id !== tempId)
          const alreadyAdded = withoutTemp.some((m) => m.id === data.id)
          return alreadyAdded ? withoutTemp : [...withoutTemp, data]
        })
      }
    },
    [myId, activeChatUser, chatId, isGroup, scrollToBottom, onError]
  )

  // Send an image message
  const sendImage = useCallback(
    async (url) => {
      if (!myId || !activeChatUser) return
      const safeUrl = sanitizeImageUrl(url)
      if (!safeUrl) {
        onError?.('Nieprawidłowy adres obrazu.')
        return
      }

      const { error: sendErr } = await querySendImage(myId, activeChatUser, safeUrl)
      if (sendErr) {
        console.error('[useMessages] Send image error:', sendErr)
        const blocked =
          sendErr.code === '42501' ||
          /row-level security|permission denied/i.test(sendErr.message || '')
        onError?.(blocked ? 'Nie możesz wysłać zdjęcia do tego użytkownika.' : 'Błąd wysyłania zdjęcia.')
      }
    },
    [myId, activeChatUser, onError]
  )

  // Delete a message
  const deleteMessage = useCallback(
    async (msgId) => {
      if (!myId) return

      const deleteFn = isGroup ? queryDeleteGroupMsg : queryDeleteMsg
      const { error: delErr } = await deleteFn(msgId, myId)

      if (delErr) {
        console.error('[useMessages] Delete error:', delErr)
        onError?.('Nie udało się usunąć wiadomości.')
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? { ...m, content: 'Wiadomość usunięta', is_deleted: true }
              : m
          )
        )
      }
    },
    [myId, isGroup, onError]
  )

  return {
    messages,
    loading,
    loadingOlder,
    hasOlder,
    error,
    sendMessage,
    sendImage,
    deleteMessage,
    loadOlderMessages,
    scrollToBottom,
    scrollRef: messagesEndRef,
  }
}
