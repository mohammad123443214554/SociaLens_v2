'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface AperonixAttachment {
  id?: string
  name: string
  path: string
  mimeType: string
  size: number
  kind: 'image' | 'video' | 'audio' | 'document' | 'file'
  thumbnailDataUrl?: string
}

export interface AperonixMessage {
  id: string
  role: 'user' | 'model'
  content: string
  timestamp: number
  feedback?: 'like' | 'dislike' | null
  attachments?: AperonixAttachment[] | null
}

export interface AperonixConversation {
  id: string
  title: string
  messages: AperonixMessage[]
  createdAt: number
  updatedAt: number
  pinned?: boolean
  contextMessages?: AperonixMessage[]
}

function rowToMessage(row: any): AperonixMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content || '',
    timestamp: new Date(row.created_at).getTime(),
    feedback: row.feedback ?? null,
    attachments: Array.isArray(row.attachments) ? row.attachments : null,
  }
}

export function useAperonixChats() {
  const [conversations, setConversations] = useState<AperonixConversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { if (!cancelled) setLoaded(true); return }
        const { data: rows, error } = await supabase
          .from('aperonix_conversations')
          .select('id,title,pinned,context_messages,created_at,updated_at')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
        if (error) throw error
        const ids = (rows || []).map((row: any) => row.id)
        let messageRows: any[] = []
        if (ids.length) {
          const result = await supabase.from('aperonix_messages')
            .select('id,conversation_id,role,content,feedback,attachments,created_at')
            .in('conversation_id', ids).order('created_at', { ascending: true })
          if (result.error) throw result.error
          messageRows = result.data || []
        }
        const mapped = (rows || []).map((row: any) => ({
          id: row.id,
          title: row.title,
          pinned: !!row.pinned,
          contextMessages: Array.isArray(row.context_messages) ? row.context_messages : [],
          createdAt: new Date(row.created_at).getTime(),
          updatedAt: new Date(row.updated_at).getTime(),
          messages: messageRows.filter((m: any) => m.conversation_id === row.id).map(rowToMessage),
        })) as AperonixConversation[]
        if (!cancelled) setConversations(mapped)
      } catch (error) {
        console.error('Could not load Aperonix history from Supabase', error)
      } finally {
        if (!cancelled) setLoaded(true)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  const persistConversation = useCallback(async (conversation: AperonixConversation) => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Sign in to save Aperonix chats.')
    const { error } = await supabase.from('aperonix_conversations').upsert({
      id: conversation.id,
      user_id: user.id,
      title: conversation.title,
      pinned: !!conversation.pinned,
      context_messages: conversation.contextMessages ?? [],
      created_at: new Date(conversation.createdAt).toISOString(),
      updated_at: new Date(conversation.updatedAt).toISOString(),
    })
    if (error) throw error
  }, [])

  const createConversation = useCallback(() => {
    const now = Date.now()
    const newConvo: AperonixConversation = {
      id: crypto.randomUUID(), title: 'New chat', messages: [],
      createdAt: now, updatedAt: now, pinned: false,
    }
    setConversations(prev => [newConvo, ...prev])
    setActiveId(newConvo.id)
    void persistConversation(newConvo).catch(error => console.error('Could not create Aperonix chat', error))
    return newConvo.id
  }, [persistConversation])

  const deleteConversation = useCallback((id: string) => {
    setConversations(prev => prev.filter(c => c.id !== id))
    setActiveId(prev => prev === id ? null : prev)
    void (async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: rows } = await supabase.from('aperonix_messages')
        .select('attachments').eq('conversation_id', id)
      const paths = (rows || []).flatMap((row: any) => Array.isArray(row.attachments) ? row.attachments : [])
        .map((attachment: any) => attachment?.path)
        .filter((path: unknown): path is string => typeof path === 'string' && path.startsWith(`${user.id}/`))
      if (paths.length) {
        const { error: storageError } = await supabase.storage.from('aperonix-files').remove(paths)
        if (storageError) console.error('Could not clean up Aperonix files', storageError)
      }
      const { error } = await supabase.from('aperonix_conversations').delete().eq('id', id)
      if (error) console.error('Could not delete Aperonix chat', error)
    })()
  }, [])

  const renameConversation = useCallback((id: string, title: string) => {
    const trimmed = title.trim()
    if (!trimmed) return
    let updated: AperonixConversation | undefined
    setConversations(prev => prev.map(c => {
      if (c.id !== id) return c
      updated = { ...c, title: trimmed, updatedAt: Date.now() }
      return updated
    }))
    if (updated) void persistConversation(updated).catch(error => console.error('Could not rename Aperonix chat', error))
  }, [persistConversation])

  const togglePinConversation = useCallback((id: string) => {
    let updated: AperonixConversation | undefined
    setConversations(prev => prev.map(c => {
      if (c.id !== id) return c
      updated = { ...c, pinned: !c.pinned, updatedAt: Date.now() }
      return updated
    }))
    if (updated) void persistConversation(updated).catch(error => console.error('Could not update Aperonix chat', error))
  }, [persistConversation])

  const connectAsNewConversation = useCallback((sourceId: string) => {
    const source = conversations.find(c => c.id === sourceId)
    if (!source) return null
    const now = Date.now()
    const newConvo: AperonixConversation = {
      id: crypto.randomUUID(),
      title: `${source.title} (continued)`,
      messages: [],
      contextMessages: [...(source.contextMessages ?? []), ...source.messages],
      createdAt: now, updatedAt: now, pinned: false,
    }
    setConversations(prev => [newConvo, ...prev])
    setActiveId(newConvo.id)
    void persistConversation(newConvo).catch(error => console.error('Could not continue Aperonix chat', error))
    return newConvo.id
  }, [conversations, persistConversation])

  const editUserMessage = useCallback((conversationId: string, messageId: string, newContent: string) => {
    let keptIds: string[] = []
    setConversations(prev => prev.map(c => {
      if (c.id !== conversationId) return c
      const idx = c.messages.findIndex(m => m.id === messageId)
      if (idx < 0) return c
      const messages = c.messages.slice(0, idx + 1).map((m, i) => i === idx ? { ...m, content: newContent, timestamp: Date.now() } : m)
      keptIds = messages.map(m => m.id)
      return { ...c, messages, updatedAt: Date.now() }
    }))
    void (async () => {
      const supabase = createClient()
      await supabase.from('aperonix_messages').update({ content: newContent }).eq('id', messageId)
      if (keptIds.length) await supabase.from('aperonix_messages').delete().eq('conversation_id', conversationId).not('id', 'in', `(${keptIds.join(',')})`)
    })().catch(error => console.error('Could not edit Aperonix message', error))
  }, [])

  const addMessage = useCallback((conversationId: string, message: Omit<AperonixMessage, 'id'> & { id?: string }) => {
    const withId: AperonixMessage = { ...message, id: message.id || crypto.randomUUID() }
    setConversations(prev => prev.map(c => {
      if (c.id !== conversationId) return c
      const title = c.messages.length === 0 && message.role === 'user' && c.title === 'New chat'
        ? (message.content.slice(0, 40) || message.attachments?.[0]?.name || 'File chat').slice(0, 40)
        : c.title
      return { ...c, messages: [...c.messages, withId], title, updatedAt: Date.now() }
    }))
    void (async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sign in to save Aperonix messages.')
      const { data: convo } = await supabase.from('aperonix_conversations')
        .select('title,pinned,context_messages,created_at').eq('id', conversationId).maybeSingle()
      const nextTitle = message.role === 'user' && (!convo || convo.title === 'New chat')
        ? (message.content.slice(0, 40) || message.attachments?.[0]?.name || 'File chat').slice(0, 40)
        : (convo?.title || 'New chat')
      const { error: convoError } = await supabase.from('aperonix_conversations').upsert({
        id: conversationId, user_id: user.id, title: nextTitle,
        pinned: convo?.pinned ?? false, context_messages: convo?.context_messages ?? [],
        created_at: convo?.created_at ?? new Date().toISOString(), updated_at: new Date().toISOString(),
      })
      if (convoError) throw convoError
      const { error } = await supabase.from('aperonix_messages').upsert({
        id: withId.id, conversation_id: conversationId, user_id: user.id,
        role: withId.role, content: withId.content,
        feedback: withId.feedback ?? null, attachments: withId.attachments ?? [],
        created_at: new Date(withId.timestamp).toISOString(),
      })
      if (error) throw error
    })().catch(error => console.error('Could not save Aperonix message', error))
    return withId.id
  }, [])

  const replaceMessageContent = useCallback((conversationId: string, messageId: string, content: string) => {
    setConversations(prev => prev.map(c => c.id !== conversationId ? c : {
      ...c, updatedAt: Date.now(),
      messages: c.messages.map(m => m.id === messageId ? { ...m, content, feedback: null, timestamp: Date.now() } : m),
    }))
    void createClient().from('aperonix_messages').update({ content, feedback: null }).eq('id', messageId)
      .then(({ error }) => { if (error) console.error('Could not update Aperonix reply', error) })
  }, [])

  const setMessageFeedback = useCallback((conversationId: string, messageId: string, feedback: 'like' | 'dislike' | null) => {
    setConversations(prev => prev.map(c => c.id !== conversationId ? c : {
      ...c, messages: c.messages.map(m => m.id === messageId ? { ...m, feedback } : m),
    }))
    void (async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      if (feedback === null) {
        await supabase.from('aperonix_feedback').delete().eq('user_id', user.id).eq('message_id', messageId)
        await supabase.from('aperonix_messages').update({ feedback: null }).eq('id', messageId)
      } else {
        const { error } = await supabase.from('aperonix_messages').update({ feedback }).eq('id', messageId)
        if (error) throw error
        const { error: feedbackError } = await supabase.from('aperonix_feedback').upsert({
          user_id: user.id, conversation_id: conversationId, message_id: messageId, feedback,
        }, { onConflict: 'user_id,message_id' })
        if (feedbackError) throw feedbackError
      }
    })().catch(error => console.error('Could not save Aperonix feedback', error))
  }, [])

  const activeConversation = conversations.find(c => c.id === activeId) ?? null
  const sortedConversations = [...conversations].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
    return b.updatedAt - a.updatedAt
  })

  return {
    conversations: sortedConversations, activeId, setActiveId, activeConversation,
    createConversation, deleteConversation, renameConversation, togglePinConversation,
    connectAsNewConversation, addMessage, editUserMessage, replaceMessageContent,
    setMessageFeedback, loaded,
  }
}
