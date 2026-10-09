'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Message } from '@/lib/types/database.types'

// How many messages load at once - matches roughly what fits on a phone
// screen a few times over. Older messages only get fetched when someone
// actually scrolls up to them, the same way Instagram/WhatsApp do it,
// instead of pulling a chat's entire history into memory on open.
const PAGE_SIZE = 40

// A locally-added placeholder for a photo/video that's still uploading -
// see addPendingMessage below. `_uploading`/`_uploadFailed` only ever
// exist on the client; they're never written to or read from the
// database.
export type ClientMessage = Message & { _uploading?: boolean; _uploadFailed?: boolean }

export function useRealtimeMessages(chatId: string, currentUserId: string) {
  const [messages, setMessages] = useState<ClientMessage[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [onlineUsers, setOnlineUsers] = useState<string[]>([])
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)
  const [hasMoreOlder, setHasMoreOlder] = useState(false)
  const supabase = createClient()

  // Tracked outside React state (refs, not state) purely so
  // loadOlderMessages below always reads the current cursor/flag without
  // needing to be recreated every time the message list changes.
  const oldestLoadedAtRef = useRef<string | null>(null)
  const hasMoreOlderRef = useRef(false)
  const loadingOlderRef = useRef(false)

  useEffect(() => {
    if (!chatId) return

    // Load only the most recent page of messages, not the whole history.
    const loadMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)
      if (!data) return
      const ordered = [...data].reverse()
      setMessages(ordered)
      oldestLoadedAtRef.current = ordered[0]?.created_at ?? null
      hasMoreOlderRef.current = data.length === PAGE_SIZE
      setHasMoreOlder(hasMoreOlderRef.current)
    }
    loadMessages()

    // Lightweight backstop, same idea as the one used for incoming calls:
    // Supabase realtime websockets can silently drop (mobile tabs getting
    // throttled in the background, wifi/cellular handoff, the socket just
    // going quiet) without the UI ever finding out, which is exactly what
    // causes "message only shows up after I refresh the page". This
    // Re-fetches the last few messages every few seconds and merges in
    // anything realtime missed, so a message never has to wait for a
    // manual refresh - at most a few seconds behind, never stuck. Only
    // ever touches the most recent handful of messages, so this stays
    // cheap no matter how long the chat's full history is.
    const backstopPoll = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false })
        .limit(20)
      if (!data) return
      setMessages((prev) => {
        const byId = new Map(prev.map((m) => [m.id, m]))
        for (const m of data) byId.set(m.id, m as Message)
        return Array.from(byId.values()).sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )
      })
    }
    const backstopInterval = setInterval(backstopPoll, 5000)

    // Realtime subscription for new/edited/removed messages - INSERT covers
    // new messages, UPDATE covers edits and read receipts, DELETE covers
    // unsend, all reflected live for both people in the chat.
    const channel = supabase
      .channel(`chat:${chatId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          const incoming = payload.new as Message
          // Guards against showing the sender's own message twice - once
          // from the optimistic insert below, once from this realtime echo.
          setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]))
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          const updated = payload.new as Message
          // Whoever clicked "delete for me" - sender or recipient - should
          // only ever lose it from their own view, matching the same rule
          // the SELECT policy enforces server-side.
          const iAmSender = updated.sender_id === currentUserId
          if ((updated.deleted_for_sender && iAmSender) || (updated.deleted_for_recipient && !iAmSender)) {
            setMessages((prev) => prev.filter((m) => m.id !== updated.id))
            return
          }
          setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          setMessages((prev) => prev.filter((m) => m.id !== (payload.old as Message).id))
        }
      )
      // Broadcast for typing indicator
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.userId !== currentUserId) {
          setIsTyping(true)
          setTimeout(() => setIsTyping(false), 2000)
        }
      })
      // Presence for online status
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ userId: string }>()
        const online = Object.values(state).flat().map((p) => p.userId)
        setOnlineUsers(online)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ userId: currentUserId })
          // Catch anything sent in the gap between the initial load above
          // and the subscription actually going live.
          backstopPoll()
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          // The backstop poll above keeps messages flowing even while
          // disconnected - Supabase's client will retry the socket itself.
          console.warn('[chat] realtime channel', status, '- relying on backstop poll until it reconnects')
        }
      })

    return () => {
      clearInterval(backstopInterval)
      supabase.removeChannel(channel)
    }
  }, [chatId, currentUserId])

  const sendTypingIndicator = useCallback(async () => {
    await supabase.channel(`chat:${chatId}`).send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: currentUserId },
    })
  }, [chatId, currentUserId])

  // Fetches the next page of older messages (before whatever's currently
  // the oldest loaded one) and prepends them - called when the person
  // scrolls up to the top of what's loaded so far.
  const loadOlderMessages = useCallback(async () => {
    if (!chatId || loadingOlderRef.current || !hasMoreOlderRef.current || !oldestLoadedAtRef.current) return
    loadingOlderRef.current = true
    setIsLoadingOlder(true)
    try {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .lt('created_at', oldestLoadedAtRef.current)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)
      if (data && data.length > 0) {
        const ordered = [...data].reverse()
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id))
          return [...ordered.filter((m) => !existingIds.has(m.id)), ...prev]
        })
        oldestLoadedAtRef.current = ordered[0]?.created_at ?? oldestLoadedAtRef.current
        hasMoreOlderRef.current = data.length === PAGE_SIZE
      } else {
        hasMoreOlderRef.current = false
      }
      setHasMoreOlder(hasMoreOlderRef.current)
    } finally {
      loadingOlderRef.current = false
      setIsLoadingOlder(false)
    }
  }, [chatId])

  const sendMessage = useCallback(
    async (payload: {
      content?: string
      replyToId?: string | null
      mediaUrl?: string
      mediaType?: 'image' | 'video' | 'audio'
      durationSeconds?: number
      sticker?: string
    }) => {
      const { data, error } = await supabase.from('messages').insert({
        chat_id: chatId,
        sender_id: currentUserId,
        content: payload.content?.trim() || '',
        reply_to_id: payload.replyToId || null,
        media_url: payload.mediaUrl || null,
        media_type: payload.mediaType || null,
        media_duration_seconds: payload.durationSeconds ?? null,
        sticker: payload.sticker || null,
      }).select().single()
      if (error) throw error

      // Show it immediately rather than waiting on the realtime echo to
      // come back - the realtime INSERT handler above is guarded against
      // adding it a second time once that echo does arrive.
      if (data) {
        setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data as Message]))
        // Fire-and-forget - notifies the other person even if they don't
        // have SociaLens open right now. Never blocks/breaks sending if it fails.
        fetch('/api/push/notify-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId: data.id }),
        }).catch(() => {})
      }

      // Update last message preview in the chat list. Generic, type-based
      // labels only - never the actual text someone typed - so a chat
      // preview never leaks what was said to anyone glancing at the list
      // without opening the conversation. Sending anything also "revives"
      // the chat for both sides if either had deleted it, same as most
      // chat apps - a fresh message brings the thread back.
      const preview = payload.sticker
        ? `${payload.sticker} Sticker`
        : payload.mediaType === 'image' ? '📷 Photo'
        : payload.mediaType === 'video' ? '🎥 Video'
        : payload.mediaType === 'audio' ? '🎤 Voice message'
        : '💬 New message'
      const previewType = payload.sticker
        ? 'sticker'
        : payload.mediaType === 'image' ? 'image'
        : payload.mediaType === 'video' ? 'video'
        : payload.mediaType === 'audio' ? 'audio'
        : 'text'
      await supabase
        .from('chats')
        .update({
          last_message: preview,
          last_message_time: new Date().toISOString(),
          last_message_type: previewType,
          last_message_sender_id: currentUserId,
          deleted_by: [],
        })
        .eq('id', chatId)
    },
    [chatId, currentUserId]
  )

  // Optimistic local updates so the person acting (unsend/delete-for-me/
  // edit) sees it happen instantly, instead of waiting on the realtime
  // round-trip - the other participant still gets it live via the
  // subscription above.
  const removeMessageLocally = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId))
  }, [])

  const patchMessageLocally = useCallback((messageId: string, patch: Partial<Message>) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, ...patch } : m)))
  }, [])

  // Lets a photo/video show up in the thread the instant it's picked,
  // "Sending..." overlay and all, while the actual upload happens in the
  // background - see MessageInput's handleSubmit. This is what makes
  // sending a video FEEL instant even though the bytes are still moving;
  // the alternative (blocking the whole composer until the upload
  // finishes) is the slow-feeling behavior this replaces.
  const addPendingMessage = useCallback((tempId: string, payload: {
    content?: string
    replyToId?: string | null
    mediaUrl: string
    mediaType: 'image' | 'video'
  }) => {
    const pending: ClientMessage = {
      id: tempId,
      chat_id: chatId,
      sender_id: currentUserId,
      content: payload.content?.trim() || '',
      post_id: null,
      story_id: null,
      is_aperonix_reply: false,
      is_read: false,
      deleted_for_sender: false,
      deleted_for_recipient: false,
      is_edited: false,
      reply_to_id: payload.replyToId || null,
      media_url: payload.mediaUrl,
      media_type: payload.mediaType,
      media_duration_seconds: null,
      sticker: null,
      is_system: false,
      created_at: new Date().toISOString(),
      _uploading: true,
    }
    setMessages((prev) => [...prev, pending])
  }, [chatId, currentUserId])

  // Upload finished - do the real insert (via the normal sendMessage path)
  // and swap the placeholder out for it.
  const resolvePendingMessage = useCallback(async (tempId: string, payload: Parameters<typeof sendMessage>[0]) => {
    await sendMessage(payload)
    setMessages((prev) => prev.filter((m) => m.id !== tempId))
  }, [sendMessage])

  // Upload failed - leave the bubble in place but flip it to a dismissable
  // error state instead of silently losing what the person tried to send.
  const failPendingMessage = useCallback((tempId: string) => {
    setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, _uploading: false, _uploadFailed: true } : m)))
  }, [])

  return {
    messages,
    isTyping,
    onlineUsers,
    sendMessage,
    sendTypingIndicator,
    removeMessageLocally,
    patchMessageLocally,
    addPendingMessage,
    resolvePendingMessage,
    failPendingMessage,
    loadOlderMessages,
    hasMoreOlder,
    isLoadingOlder,
  }
}
