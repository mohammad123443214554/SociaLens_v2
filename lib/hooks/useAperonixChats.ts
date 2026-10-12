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
  archivedAt?: number | null
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

export function useAperonixChats(options: { includeArchived?: boolean } = {}) {
  const includeArchived = options.includeArchived ?? false
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
        let query = supabase
          .from('aperonix_conversations')
          .select('id,title,pinned,context_messages,created_at,updated_at,archived_at')
          .eq('user_id', user.id)
        query = includeArchived ? query.not('archived_at', 'is', null) : query.is('archived_at', null)
        const { data: rows, error } = await query.order('updated_at', { ascending: false })
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
          archivedAt: row.archived_at ? new Date(row.archived_at).getTime() : null,
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
  }, [includeArchived])

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
      archived_at: conversation.archivedAt ? new Date(conversation.archivedAt).toISOString() : null,
    })
    if (error) throw error
  }, [])

  // A new chat is a client-side draft until the user sends the first message.
  // Remove any previous empty draft and do not write this one to Supabase yet.
  const createConversation = useCallback(() => {
    const now = Date.now()
    const newConvo: AperonixConversation = {
      id: crypto.randomUUID(), title: 'New chat', messages: [],
      createdAt: now, updatedAt: now, pinned: false, archivedAt: null,
    }
    setConversations(prev => [newConvo, ...prev.filter(c => c.messages.length > 0)])
    setActiveId(newConvo.id)
    return newConvo.id
  }, [])

  const updateConversationTitle = useCallback((id: string, title: string) => {
    const trimmed = title.trim().replace(/^["'\s]+|["'\s]+$/g, '').slice(0, 80)
    if (!trimmed) return
    const updatedAt = Date.now()
    setConversations(prev => prev.map(c => c.id === id ? { ...c, title: trimmed, updatedAt } : c))
    void (async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sign in to save Aperonix chat titles.')
      const { error } = await supabase.from('aperonix_conversations')
        .update({ title: trimmed, updated_at: new Date(updatedAt).toISOString() })
        .eq('id', id).eq('user_id', user.id)
      if (error) throw error
    })().catch(error => console.error('Could not save Aperonix chat title', error))
  }, [])

  const deleteConversation = useCallback(async (id: string) => {
    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError) throw authError
    if (!user) throw new Error('Please sign in again before deleting this chat.')

    // Read only this user's conversation and its attachment paths. Never remove
    // files outside the signed-in user's storage prefix.
    const { data: rows, error: rowsError } = await supabase.from('aperonix_messages')
      .select('attachments').eq('conversation_id', id).eq('user_id', user.id)
    if (rowsError) throw new Error(`Could not prepare chat deletion: ${rowsError.message}`)
    const paths = (rows || []).flatMap((row: any) => Array.isArray(row.attachments) ? row.attachments : [])
      .map((attachment: any) => attachment?.path)
      .filter((path: unknown): path is string => typeof path === 'string' && path.startsWith(`${user.id}/`))
    if (paths.length) {
      const { error: storageError } = await supabase.storage.from('aperonix-files').remove([...new Set(paths)])
      if (storageError) throw new Error(`Chat files could not be deleted, so the chat was kept: ${storageError.message}`)
    }

    const { error: deleteError } = await supabase.from('aperonix_conversations')
      .delete().eq('id', id).eq('user_id', user.id)
    if (deleteError) throw new Error(`Could not delete chat: ${deleteError.message}`)

    setConversations(prev => prev.filter(c => c.id !== id))
    setActiveId(prev => prev === id ? null : prev)
  }, [])

  const archiveConversation = useCallback(async (id: string) => {
    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError) throw authError
    if (!user) throw new Error('Please sign in again before archiving this chat.')
    const archivedAt = new Date().toISOString()
    const { error } = await supabase.from('aperonix_conversations')
      .update({ archived_at: archivedAt, updated_at: archivedAt })
      .eq('id', id).eq('user_id', user.id)
    if (error) throw new Error(`Could not archive this chat: ${error.message}`)
    setConversations(prev => prev.filter(conversation => conversation.id !== id))
    setActiveId(current => current === id ? (conversations.find(conversation => conversation.id !== id)?.id ?? null) : current)
  }, [conversations])

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
      createdAt: now, updatedAt: now, pinned: false, archivedAt: null,
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

  const addMessage = useCallback(async (conversationId: string, message: Omit<AperonixMessage, 'id'> & { id?: string }): Promise<string> => {
    const withId: AperonixMessage = { ...message, id: message.id || crypto.randomUUID() }
    const now = new Date().toISOString()
    const fallbackTitle = message.attachments?.[0]?.name ? 'File chat' : 'New chat'

    // Persist first, then report success to the caller. This prevents a fast
    // refresh/close from racing an un-awaited background database write.
    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError) throw new Error(`Could not verify your session: ${authError.message}`)
    if (!user) throw new Error('Your session has expired. Sign in again to save this chat.')

    const { data: convo, error: convoReadError } = await supabase
      .from('aperonix_conversations')
      .select('title,pinned,context_messages,created_at')
      .eq('id', conversationId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (convoReadError) throw new Error(`Could not read chat history: ${convoReadError.message}`)

    // The title is generated separately by Aperonix. Never derive it from the
    // first few words of the user's prompt.
    const nextTitle = convo?.title || fallbackTitle
    const { error: convoError } = await supabase.from('aperonix_conversations').upsert({
      id: conversationId,
      user_id: user.id,
      title: nextTitle,
      pinned: convo?.pinned ?? false,
      context_messages: convo?.context_messages ?? [],
      created_at: convo?.created_at ?? now,
      updated_at: now,
    })
    if (convoError) throw new Error(`Could not save chat: ${convoError.message}`)

    const { error: messageError } = await supabase.from('aperonix_messages').upsert({
      id: withId.id,
      conversation_id: conversationId,
      user_id: user.id,
      role: withId.role,
      content: withId.content,
      feedback: withId.feedback ?? null,
      attachments: withId.attachments ?? [],
      created_at: new Date(withId.timestamp).toISOString(),
    })
    if (messageError) throw new Error(`Could not save message: ${messageError.message}`)

    setConversations(prev => prev.map(c => {
      if (c.id !== conversationId) return c
      return {
        ...c,
        title: nextTitle,
        messages: c.messages.some(m => m.id === withId.id)
          ? c.messages.map(m => m.id === withId.id ? withId : m)
          : [...c.messages, withId],
        updatedAt: Date.now(),
      }
    }))
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
    createConversation, deleteConversation, archiveConversation, renameConversation, togglePinConversation,
    connectAsNewConversation, addMessage, updateConversationTitle, editUserMessage, replaceMessageContent,
    setMessageFeedback, loaded,
  }
}
