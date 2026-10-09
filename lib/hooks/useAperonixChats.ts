'use client'

import { useCallback, useEffect, useState } from 'react'

export interface AperonixMessage {
  id: string
  role: 'user' | 'model'
  content: string
  timestamp: number
  // Like/dislike is purely a local, on-device signal - it's never sent to
  // Supabase or anywhere else, so it lives right here next to the message.
  feedback?: 'like' | 'dislike' | null
  // Photo(s)/video the person attached when sending this message. Only
  // Small compressed thumbnails are kept for photos (so localStorage
  // Doesn't fill up over time) - videos aren't thumbnailed at all, just
  // Labeled, since even one video's worth of base64 would blow the quota.
  attachments?: { type: 'image' | 'video'; thumbnailDataUrl?: string }[] | null
}

export interface AperonixConversation {
  id: string
  title: string
  messages: AperonixMessage[]
  createdAt: number
  updatedAt: number
  pinned?: boolean
  // Inherited history from a "connect with new chat" - Aperonix reads this
  // as context for every reply, but it's never rendered in the chat itself,
  // so the screen only ever shows what's actually been said in THIS chat -
  // like starting a new branch in ChatGPT that still remembers the parent.
  contextMessages?: AperonixMessage[]
}

const STORAGE_KEY = 'aperonix-chats'

function loadConversations(): AperonixConversation[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as AperonixConversation[]
    // Older saved chats (from before messages had ids) get one assigned on
    // load so every message can still be targeted for feedback/regenerate.
    return parsed.map(c => ({
      ...c,
      pinned: c.pinned || false,
      messages: c.messages.map(m => ({ ...m, id: m.id || crypto.randomUUID() })),
    }))
  } catch {
    return []
  }
}

function saveConversations(conversations: AperonixConversation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations))
  } catch {
    // localStorage full/unavailable - fail silently, chat still works for this session
  }
}

export function useAperonixChats() {
  const [conversations, setConversations] = useState<AperonixConversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const loadedConvos = loadConversations()
    setConversations(loadedConvos)
    setLoaded(true)
  }, [])

  const persist = useCallback((next: AperonixConversation[]) => {
    setConversations(next)
    saveConversations(next)
  }, [])

  const createConversation = useCallback(() => {
    const newConvo: AperonixConversation = {
      id: crypto.randomUUID(),
      title: 'New chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pinned: false,
    }
    persist([newConvo, ...conversations])
    setActiveId(newConvo.id)
    return newConvo.id
  }, [conversations, persist])

  const deleteConversation = useCallback((id: string) => {
    const next = conversations.filter(c => c.id !== id)
    persist(next)
    if (activeId === id) setActiveId(null)
  }, [conversations, persist, activeId])

  const renameConversation = useCallback((id: string, title: string) => {
    const trimmed = title.trim()
    if (!trimmed) return
    const next = conversations.map(c => c.id === id ? { ...c, title: trimmed } : c)
    persist(next)
  }, [conversations, persist])

  const togglePinConversation = useCallback((id: string) => {
    const next = conversations.map(c => c.id === id ? { ...c, pinned: !c.pinned } : c)
    persist(next)
  }, [conversations, persist])

  // "Connect with new chat" - starts a brand new, visually empty chat (like
  // a fresh branch), but carries the old conversation's full history along
  // as hidden context so Aperonix still remembers everything that was
  // discussed - it just doesn't clutter the screen by re-showing it. The
  // original chat stays untouched in the sidebar.
  const connectAsNewConversation = useCallback((sourceId: string) => {
    const source = conversations.find(c => c.id === sourceId)
    if (!source) return null

    const inheritedContext = [...(source.contextMessages ?? []), ...source.messages]

    const newConvo: AperonixConversation = {
      id: crypto.randomUUID(),
      title: `${source.title} (continued)`,
      messages: [],
      contextMessages: inheritedContext,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pinned: false,
    }
    persist([newConvo, ...conversations])
    setActiveId(newConvo.id)
    return newConvo.id
  }, [conversations, persist])

  // Editing a user message truncates everything after it (the old reply and
  // anything following) since the conversation is about to branch off from
  // this edited point - same as ChatGPT's "edit message" behavior.
  const editUserMessage = useCallback((conversationId: string, messageId: string, newContent: string) => {
    setConversations(prev => {
      const next = prev.map(c => {
        if (c.id !== conversationId) return c
        const idx = c.messages.findIndex(m => m.id === messageId)
        if (idx === -1) return c
        const messages = c.messages.slice(0, idx + 1).map((m, i) =>
          i === idx ? { ...m, content: newContent, timestamp: Date.now() } : m
        )
        return { ...c, messages, updatedAt: Date.now() }
      })
      saveConversations(next)
      return next
    })
  }, [])

  const addMessage = useCallback((conversationId: string, message: Omit<AperonixMessage, 'id'> & { id?: string }) => {
    const withId: AperonixMessage = { ...message, id: message.id || crypto.randomUUID() }
    setConversations(prev => {
      const next = prev.map(c => {
        if (c.id !== conversationId) return c
        const messages = [...c.messages, withId]
        const title = c.messages.length === 0 && message.role === 'user' && c.title === 'New chat'
          ? message.content.slice(0, 40) + (message.content.length > 40 ? '…' : '')
          : c.title
        return { ...c, messages, title, updatedAt: Date.now() }
      })
      saveConversations(next)
      return next
    })
    return withId.id
  }, [])

  // Regenerate uses this to swap a model reply's text in place, keeping its
  // id and position so the like/dislike state resets cleanly for the new
  // answer instead of appending a duplicate message.
  const replaceMessageContent = useCallback((conversationId: string, messageId: string, content: string) => {
    setConversations(prev => {
      const next = prev.map(c => {
        if (c.id !== conversationId) return c
        const messages = c.messages.map(m => m.id === messageId ? { ...m, content, feedback: null, timestamp: Date.now() } : m)
        return { ...c, messages, updatedAt: Date.now() }
      })
      saveConversations(next)
      return next
    })
  }, [])

  // Local-only - like/dislike never touches Supabase, it's just a signal
  // saved on this device the same way the chat itself is.
  const setMessageFeedback = useCallback((conversationId: string, messageId: string, feedback: 'like' | 'dislike' | null) => {
    setConversations(prev => {
      const next = prev.map(c => {
        if (c.id !== conversationId) return c
        const messages = c.messages.map(m => m.id === messageId ? { ...m, feedback } : m)
        return { ...c, messages }
      })
      saveConversations(next)
      return next
    })
  }, [])

  const activeConversation = conversations.find(c => c.id === activeId) ?? null

  // Pinned chats always float to the top (most-recently-updated pinned
  // chat first), then everything else by most-recently-updated.
  const sortedConversations = [...conversations].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
    return b.updatedAt - a.updatedAt
  })

  return {
    conversations: sortedConversations,
    activeId,
    setActiveId,
    activeConversation,
    createConversation,
    deleteConversation,
    renameConversation,
    togglePinConversation,
    connectAsNewConversation,
    addMessage,
    editUserMessage,
    replaceMessageContent,
    setMessageFeedback,
    loaded,
  }
}
