import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, MessageCircle, Send, User, Coins } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../services/supabase'
import { useToast } from '../../context/ToastContext'
import ReportButton from '../../components/ReportButton'
import { ImageKitService } from '../../services/imageKitService'
import { getRoleLabel, getUserInitial } from '../profile/profileMeta'
import { sanitizePlainText } from '../../utils/safeContent'

const MAX_REWEAR_MESSAGE = 2000
const REWEAR_MESSAGES_PAGE_SIZE = 30
const MAX_REWEAR_MESSAGES_IN_MEMORY = 150

function capRecentMessages(list) {
  if (list.length <= MAX_REWEAR_MESSAGES_IN_MEMORY) return list
  return list.slice(-MAX_REWEAR_MESSAGES_IN_MEMORY)
}

function ProfileAvatar({ profile }) {
  if (profile?.avatar_url) {
    return (
      <img
        src={ImageKitService.getOptimizedUrl(profile.avatar_url)}
        alt={profile.full_name || 'Profil'}
        className="w-full h-full object-cover"
      />
    )
  }

  return (
    <div className="w-full h-full flex items-center justify-center text-gray-400 font-black text-sm">
      {getUserInitial(profile?.full_name || 'U')}
    </div>
  )
}

export default function ReWearInbox() {
  const toast = useToast()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const routePostId = searchParams.get('post')
  const routeConversationId = searchParams.get('conversation')
  const [myId, setMyId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [chatLoading, setChatLoading] = useState(false)
  const [conversations, setConversations] = useState([])
  const [activeConversation, setActiveConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [messagesOffset, setMessagesOffset] = useState(0)
  const [hasOlderMessages, setHasOlderMessages] = useState(false)
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false)
  const [newMessage, setNewMessage] = useState('')
  const [chatError, setChatError] = useState('')
  const [sending, setSending] = useState(false)
  const [purchaseLoading, setPurchaseLoading] = useState(false)
  const messagesEndRef = useRef(null)
  const shouldAutoScrollRef = useRef(true)

  const activePartner = activeConversation?.partner || null
  const activePost = activeConversation?.post || null
  const isBuyerInConversation = Boolean(activeConversation && myId && activeConversation.buyer_id === myId)
  const canCompletePurchase = Boolean(
    activeConversation
    && activeConversation.status === 'active'
    && activePost
    && activePost.status === 'active'
    && Number(activePost.price_teb_gabki || 0) > 0
    && isBuyerInConversation
  )

  useEffect(() => {
    let mounted = true

    async function loadSession() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!mounted) return

      if (!session?.user?.id) {
        setChatError('Zaloguj się ponownie, aby otworzyć skrzynkę ReWear.')
        setLoading(false)
        return
      }

      setMyId(session.user.id)
    }

    loadSession().catch(error => {
      console.error('Failed to load ReWear inbox session:', error)
      if (!mounted) return
      setChatError('Nie udało się odczytać sesji użytkownika.')
      setLoading(false)
    })

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!myId) return

    let cancelled = false

    async function bootstrapInbox() {
      setLoading(true)
      setChatError('')

      try {
        let resolvedConversationId = routeConversationId

        if (routePostId) {
          const numericPostId = Number(routePostId)
          if (!Number.isFinite(numericPostId) || numericPostId <= 0) {
            throw new Error('Nieprawidłowy identyfikator ogłoszenia ReWear.')
          }

          const { data, error } = await supabase.rpc('start_rewear_conversation', {
            p_post_id: numericPostId
          })

          if (error) throw error

          resolvedConversationId = data || resolvedConversationId
        }

        const nextConversations = await fetchConversations(myId)
        if (cancelled) return

        const targetId = resolvedConversationId || routeConversationId
        if (targetId) {
          const matchedConversation = nextConversations.find(item => item.id === targetId)
          if (matchedConversation) {
            setActiveConversation(matchedConversation)
            const nextParams = new URLSearchParams(searchParams)
            nextParams.delete('post')
            nextParams.set('conversation', matchedConversation.id)
            setSearchParams(nextParams, { replace: true })
          } else {
            setChatError('Nie udało się otworzyć rozmowy dla tego ogłoszenia.')
          }
        }
      } catch (error) {
        console.error('Failed to bootstrap ReWear inbox:', error)
        if (!cancelled) {
          setChatError(error?.message || 'Nie udało się otworzyć skrzynki ReWear.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    bootstrapInbox()

    return () => {
      cancelled = true
    }
  }, [myId, routePostId, routeConversationId, setSearchParams])

  useEffect(() => {
    if (!activeConversation?.id) return

    let cancelled = false
    setMessages([])
    setMessagesOffset(0)
    setHasOlderMessages(false)

    async function loadMessages() {
      setChatLoading(true)

      try {
        const { items, totalCount } = await fetchMessagesPage(activeConversation.id, { offset: 0 })
        if (!cancelled) {
          setMessages(items)
          setMessagesOffset(items.length)
          setHasOlderMessages(totalCount > items.length)
          setChatError('')
          shouldAutoScrollRef.current = true
        }
      } catch (error) {
        console.error('Failed to fetch ReWear messages:', error)
        if (!cancelled) {
          setChatError('Nie udało się załadować wiadomości ReWear.')
        }
      } finally {
        if (!cancelled) setChatLoading(false)
      }
    }

    loadMessages()

    const channel = supabase
      .channel(`rewear_conversation_${activeConversation.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'rewear_messages'
      }, async payload => {
        if (payload.new.conversation_id !== activeConversation.id) return
        const hydratedMessage = await hydrateMessages([payload.new])
        setMessages(prev => {
          if (prev.some(message => message.id === payload.new.id)) return prev
          return capRecentMessages([...prev, ...(hydratedMessage || [])])
        })
        fetchConversations(myId).catch(error => {
          console.warn('Failed to refresh ReWear conversations after realtime event:', error)
        })
        shouldAutoScrollRef.current = true
        scrollToBottom()
      })
      .subscribe(status => {
        if (status === 'CHANNEL_ERROR') {
          setChatError('Połączenie z rozmową ReWear zostało przerwane. Odśwież widok.')
        }
      })

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [activeConversation?.id, myId])

  useEffect(() => {
    if (!shouldAutoScrollRef.current) {
      shouldAutoScrollRef.current = true
      return
    }
    scrollToBottom()
  }, [messages.length])

  function scrollToBottom() {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 80)
  }

  async function fetchConversations(userId) {
    const { data, error } = await supabase
      .from('rewear_conversations')
      .select('*')
      .or(`seller_id.eq.${userId},buyer_id.eq.${userId}`)
      .order('last_message_at', { ascending: false })

    if (error) throw error

    const hydrated = await hydrateConversations(data || [], userId)
    setConversations(hydrated)

    if (activeConversation?.id) {
      const nextActive = hydrated.find(item => item.id === activeConversation.id)
      if (nextActive) setActiveConversation(nextActive)
    }

    return hydrated
  }

  async function hydrateConversations(rows, userId) {
    if (!rows.length) return []

    const postIds = [...new Set(rows.map(row => row.post_id).filter(Boolean))]
    const profileIds = [...new Set(rows.flatMap(row => [row.seller_id, row.buyer_id]).filter(Boolean))]
    const conversationIds = rows.map(row => row.id)

    const [postsResult, profilesResult, messagesResult] = await Promise.all([
      supabase.from('rewear_posts').select('id, title, image_url, status, seller_id').in('id', postIds),
      supabase.from('profiles').select('id, full_name, avatar_url, role').in('id', profileIds),
      supabase.from('rewear_messages').select('id, conversation_id, content, created_at').in('conversation_id', conversationIds).order('created_at', { ascending: false })
    ])

    const postsMap = new Map((postsResult.data || []).map(post => [post.id, post]))
    const profilesMap = new Map((profilesResult.data || []).map(profile => [profile.id, profile]))
    const previewsMap = new Map()

    for (const message of messagesResult.data || []) {
      if (!previewsMap.has(message.conversation_id)) {
        previewsMap.set(message.conversation_id, message)
      }
    }

    return rows.map(row => {
      const isSellerView = row.seller_id === userId
      const partnerId = isSellerView ? row.buyer_id : row.seller_id
      return {
        ...row,
        post: postsMap.get(row.post_id) || null,
        partner: profilesMap.get(partnerId) || null,
        preview: previewsMap.get(row.id) || null,
        isSellerView
      }
    })
  }

  async function hydrateMessages(rows) {
    if (!rows.length) return []

    const senderIds = [...new Set(rows.map(row => row.sender_id).filter(Boolean))]
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, role')
      .in('id', senderIds)

    if (error) throw error

    const profilesMap = new Map((data || []).map(profile => [profile.id, profile]))
    return rows.map(row => ({
      ...row,
      profile: profilesMap.get(row.sender_id) || null
    }))
  }

  async function fetchMessagesPage(conversationId, { offset = 0 } = {}) {
    const { data, error, count } = await supabase
      .from('rewear_messages')
      .select('*', { count: 'exact' })
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .range(offset, offset + REWEAR_MESSAGES_PAGE_SIZE - 1)

    if (error) throw error
    const hydrated = await hydrateMessages((data || []).reverse())
    return {
      items: hydrated,
      totalCount: count || 0
    }
  }

  async function handleLoadOlderMessages() {
    if (!activeConversation?.id || loadingOlderMessages || !hasOlderMessages) return

    setLoadingOlderMessages(true)
    try {
      const { items, totalCount } = await fetchMessagesPage(activeConversation.id, { offset: messagesOffset })
      if (items.length === 0) {
        setHasOlderMessages(false)
        return
      }

      shouldAutoScrollRef.current = false
      setMessages(prev => {
        const existingIds = new Set(prev.map(message => message.id))
        const older = items.filter(message => !existingIds.has(message.id))
        return capRecentMessages([...older, ...prev])
      })
      setMessagesOffset(prev => prev + items.length)
      setHasOlderMessages(messagesOffset + items.length < totalCount)
    } catch (error) {
      console.error('Failed to load older ReWear messages:', error)
      toast.error('Nie udało się załadować starszych wiadomości.')
    } finally {
      setLoadingOlderMessages(false)
    }
  }

  async function handleOpenConversation(conversation) {
    setActiveConversation(conversation)
    setChatError('')
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('post')
    nextParams.set('conversation', conversation.id)
    setSearchParams(nextParams, { replace: true })
  }

  async function handleSendMessage(event) {
    event.preventDefault()

    if (!activeConversation?.id || sending) return

    const safeMessage = sanitizePlainText(newMessage, {
      maxLength: MAX_REWEAR_MESSAGE,
      preserveLineBreaks: true
    })

    if (!safeMessage) return

    setSending(true)
    try {
      const { data, error } = await supabase
        .from('rewear_messages')
        .insert([{
          conversation_id: activeConversation.id,
          sender_id: myId,
          content: safeMessage
        }])
        .select('*')
        .single()

      if (error) throw error

      if (data) {
        const hydrated = await hydrateMessages([data])
        setMessages(prev => {
          if (prev.some(message => message.id === data.id)) return prev
          return capRecentMessages([...prev, ...(hydrated || [])])
        })
      }

      setNewMessage('')
      await fetchConversations(myId)
      shouldAutoScrollRef.current = true
      scrollToBottom()
    } catch (error) {
      console.error('Failed to send ReWear message:', error)
      toast.error(error?.message || 'Nie udało się wysłać wiadomości ReWear.')
    } finally {
      setSending(false)
    }
  }

  async function handleCompletePurchase() {
    if (!activeConversation?.id || purchaseLoading || !canCompletePurchase) return

    const amount = Number(activePost?.price_teb_gabki || 0)
    const confirmed = window.confirm(`Potwierdzasz przekazanie ${amount} TG za to ogłoszenie?`)
    if (!confirmed) return

    setPurchaseLoading(true)
    try {
      const { data, error } = await supabase.rpc('complete_rewear_purchase', {
        p_conversation_id: activeConversation.id
      })

      if (error) throw error

      toast.success(`Przekazano ${data?.transferred_tg || amount} TG. Ogłoszenie oznaczone jako sprzedane.`)
      await fetchConversations(myId)
      const { items, totalCount } = await fetchMessagesPage(activeConversation.id, { offset: 0 })
      setMessages(items)
      setMessagesOffset(items.length)
      setHasOlderMessages(totalCount > items.length)
    } catch (error) {
      console.error('Failed to complete ReWear purchase:', error)
      toast.error(error?.message || 'Nie udało się przekazać TebGąbek.')
    } finally {
      setPurchaseLoading(false)
    }
  }

  const emptyStateMessage = useMemo(() => {
    if (loading) return 'Ładowanie skrzynki ReWear...'
    if (chatError && !conversations.length) return chatError
    return 'Nie masz jeszcze rozmów o ogłoszeniach. Zacznij od wybranego ogłoszenia w ReWear.'
  }, [loading, chatError, conversations.length])

  return (
    <div className="relative min-h-[80vh] pb-6">
      <div className="flex items-center justify-between mb-4 px-1">
        <button
          type="button"
          onClick={() => navigate('/rewear')}
          className="w-10 h-10 rounded-full border border-gray-800 bg-surface text-gray-300 flex items-center justify-center"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white tracking-tight">ReWear Inbox</h2>
          <p className="text-xs text-gray-500">Rozmowy o ogłoszeniach są oddzielone od TEB Talk.</p>
        </div>
        <div className="w-10 h-10 rounded-full border border-primary/30 bg-primary/10 text-primary flex items-center justify-center">
          <MessageCircle size={18} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.1fr)]">
        <section className={`bg-surface border border-gray-800 rounded-3xl overflow-hidden ${activeConversation ? 'hidden lg:block' : ''}`}>
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-white">Twoje rozmowy</div>
              <div className="text-[11px] text-gray-500">Kupujący i sprzedawcy z ReWear</div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/rewear')}
              className="text-xs font-bold text-primary hover:text-white transition"
            >
              Wróć do ofert
            </button>
          </div>

          <div className="max-h-[68vh] overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-gray-500">{emptyStateMessage}</div>
            ) : (
              conversations.map(conversation => {
                const isActive = activeConversation?.id === conversation.id
                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => handleOpenConversation(conversation)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-900/80 transition ${isActive ? 'bg-primary/10' : 'hover:bg-white/[0.03]'}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-2xl overflow-hidden bg-background border border-gray-800 shrink-0">
                        {conversation.post?.image_url ? (
                          <img
                            src={ImageKitService.getOptimizedUrl(conversation.post.image_url)}
                            alt={conversation.post?.title || 'Ogłoszenie'}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-500">
                            <MessageCircle size={18} />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-bold text-white truncate">
                            {conversation.post?.title || 'Ogłoszenie ReWear'}
                          </div>
                          <div className="text-[10px] text-gray-500 whitespace-nowrap">
                            {conversation.last_message_at ? new Date(conversation.last_message_at).toLocaleDateString('pl-PL') : ''}
                          </div>
                        </div>
                        <div className="text-xs text-gray-400 truncate mt-0.5">
                          {conversation.partner?.full_name || 'Użytkownik'}
                          {conversation.partner?.role ? ` • ${getRoleLabel(conversation.partner.role)}` : ''}
                        </div>
                        <div className="text-xs text-gray-500 truncate mt-1">
                          {conversation.preview?.content || 'Rozmowa gotowa do rozpoczęcia.'}
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </section>

        <section className={`bg-surface border border-gray-800 rounded-3xl overflow-hidden flex flex-col h-[calc(100vh-13.5rem)] lg:h-auto lg:min-h-[68vh] ${activeConversation ? '' : 'hidden lg:flex'}`}>
          {activeConversation ? (
            <>
              <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-3 bg-[#1a1a1a]">
                <button
                  type="button"
                  onClick={() => setActiveConversation(null)}
                  className="sm:hidden w-9 h-9 rounded-full border border-gray-800 bg-background text-gray-300 flex items-center justify-center"
                >
                  <ArrowLeft size={16} />
                </button>
                <div className="w-11 h-11 rounded-2xl overflow-hidden bg-background border border-gray-800 shrink-0">
                  <ProfileAvatar profile={activePartner} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-white truncate">
                    {activePartner?.full_name || 'Rozmówca'}
                  </div>
                  <div className="text-[11px] text-gray-500 truncate">
                    {activePost?.title || 'Ogłoszenie ReWear'}
                    {activePost?.status ? ` • ${activePost.status}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/profile/${activePartner?.id}`)}
                  className="text-xs font-bold text-primary hover:text-white transition"
                  disabled={!activePartner?.id}
                >
                  Profil
                </button>
              </div>

              <div className="px-4 py-3 border-b border-gray-900/80 bg-background/60 flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl overflow-hidden bg-surface border border-gray-800 shrink-0">
                  {activePost?.image_url ? (
                    <img
                      src={ImageKitService.getOptimizedUrl(activePost.image_url)}
                      alt={activePost.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500">
                      <User size={18} />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-white break-words line-clamp-2">{activePost?.title || 'Ogłoszenie ReWear'}</div>
                  <div className="text-xs text-gray-500 truncate">
                    Rozmowa dotyczy tego konkretnego ogłoszenia.
                  </div>
                </div>
                {activePost?.id && <ReportButton entityType="rewear_post" entityId={activePost.id} subtle={true} />}
              </div>

              {activePost?.price_teb_gabki > 0 && (
                <div className="px-4 py-3 border-b border-gray-900/80 bg-background/50 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs text-gray-500">Płatność TebGąbkami</div>
                    <div className="text-sm font-bold text-white">Cena: {Number(activePost.price_teb_gabki)} TG</div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCompletePurchase}
                    disabled={!canCompletePurchase || purchaseLoading}
                    className="px-3 py-2 rounded-xl border border-primary/40 bg-primary/15 text-primary font-bold text-xs disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Coins size={14} />
                    {purchaseLoading ? 'Przetwarzanie...' : 'Przekaż TG i oznacz jako sold'}
                  </button>
                </div>
              )}

              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
                {chatLoading ? (
                  <div className="text-center text-sm text-gray-500 py-12">Ładowanie wiadomości...</div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-sm text-gray-500 py-12">Brak wiadomości w tej rozmowie. Możesz zacząć od krótkiego pytania o ofertę.</div>
                ) : (
                  <>
                    {hasOlderMessages && (
                      <div className="flex justify-center pb-2">
                        <button
                          type="button"
                          onClick={handleLoadOlderMessages}
                          disabled={loadingOlderMessages}
                          className="px-3 py-1.5 rounded-full text-xs font-bold border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 disabled:opacity-50"
                        >
                          {loadingOlderMessages ? 'Ładowanie starszych...' : 'Załaduj starsze wiadomości'}
                        </button>
                      </div>
                    )}
                    {messages.map(message => {
                      const isMine = message.sender_id === myId
                      return (
                        <div key={message.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] rounded-3xl px-4 py-3 border ${isMine ? 'bg-primary/20 border-primary/30 text-white' : 'bg-background border-gray-800 text-gray-100'}`}>
                            <div className="flex items-start justify-between gap-3 mb-1">
                              <div className="text-[11px] font-bold text-gray-400">
                                {message.profile?.full_name || 'Użytkownik'}
                              </div>
                              <ReportButton entityType="rewear_message" entityId={message.id} subtle={true} />
                            </div>
                            <div className="text-sm whitespace-pre-wrap break-words">{message.content}</div>
                            <div className="text-[10px] text-gray-500 mt-2 text-right">
                              {new Date(message.created_at).toLocaleString('pl-PL')}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </>
                )}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-800 bg-[#181818] flex gap-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                <textarea
                  value={newMessage}
                  onChange={event => setNewMessage(event.target.value.slice(0, MAX_REWEAR_MESSAGE))}
                  placeholder="Napisz wiadomość o tym ogłoszeniu..."
                  rows={2}
                  maxLength={MAX_REWEAR_MESSAGE}
                  className="flex-1 bg-background border border-gray-800 rounded-2xl px-4 py-3 text-sm text-white outline-none resize-none focus:border-primary"
                />
                <button
                  type="submit"
                  disabled={sending || !newMessage.trim() || activeConversation?.status !== 'active'}
                  className="w-12 h-12 rounded-2xl bg-primary text-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send size={18} />
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-12">
              <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 text-primary flex items-center justify-center mb-4">
                <MessageCircle size={26} />
              </div>
              <div className="text-lg font-bold text-white mb-2">Wybierz rozmowę ReWear</div>
              <p className="text-sm text-gray-500 max-w-xs">Tutaj trafiają tylko rozmowy o konkretnych ogłoszeniach. TEB Talk pozostaje osobnym modułem społecznym.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}