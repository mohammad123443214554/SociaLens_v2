'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/lib/types/database.types'

// ------------------------------------------------------------------
// Unsend - removes the message for both people entirely.
// ------------------------------------------------------------------
export function useUnsendMessage() {
  const supabase = createClient()

  return useMutation({
    mutationFn: async ({ messageId }: { messageId: string; chatId: string }) => {
      const { error } = await supabase.from('messages').delete().eq('id', messageId)
      if (error) throw error
    },
  })
}

// ------------------------------------------------------------------
// Delete for me - only the person who clicked it stops seeing it, the
// other side of the conversation still does. Whether it's the sender or
// recipient doing the deleting determines which flag gets set.
// ------------------------------------------------------------------
export function useDeleteMessageForMe() {
  const supabase = createClient()

  return useMutation({
    mutationFn: async ({ messageId, isSender }: { messageId: string; chatId: string; isSender: boolean }) => {
      const column = isSender ? 'deleted_for_sender' : 'deleted_for_recipient'
      const { error } = await supabase.from('messages').update({ [column]: true }).eq('id', messageId)
      if (error) throw error
    },
  })
}

// ------------------------------------------------------------------
// Edit - both people see an "Edited" tag once this has been used.
// ------------------------------------------------------------------
export function useEditMessage() {
  const supabase = createClient()

  return useMutation({
    mutationFn: async ({ messageId, content }: { messageId: string; content: string; chatId: string }) => {
      const { error } = await supabase.from('messages').update({ content, is_edited: true }).eq('id', messageId)
      if (error) throw error
    },
  })
}

// ------------------------------------------------------------------
// Reactions - any emoji, one per person per message.
// ------------------------------------------------------------------
export function useMessageReactions(messageId?: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['message-reactions', messageId],
    queryFn: async () => {
      if (!messageId) return []
      const { data, error } = await supabase
        .from('message_reactions')
        .select('*, profiles(*)')
        .eq('message_id', messageId)
      if (error) throw error
      return (data || []) as unknown as { id: string; user_id: string; emoji: string; profiles: Profile }[]
    },
    enabled: !!messageId,
  })
}

export function useSetMessageReaction() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      messageId,
      userId,
      emoji,
      chatId,
    }: {
      messageId: string
      userId: string
      emoji: string
      /** Passing chatId also drops a "reacted to a message" preview into
       *  the chat list, same as every other message type - optional so
       *  this hook still works anywhere that preview isn't needed. */
      chatId?: string
    }) => {
      const { error } = await supabase
        .from('message_reactions')
        .upsert({ message_id: messageId, user_id: userId, emoji }, { onConflict: 'message_id,user_id' })
      if (error) throw error

      if (chatId) {
        await supabase
          .from('chats')
          .update({
            last_message: emoji,
            last_message_time: new Date().toISOString(),
            last_message_type: 'reaction',
            last_message_sender_id: userId,
          })
          .eq('id', chatId)
      }
    },
    onSuccess: (_, { messageId }) => {
      queryClient.invalidateQueries({ queryKey: ['message-reactions', messageId] })
    },
  })
}

export function useRemoveMessageReaction() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ messageId, userId }: { messageId: string; userId: string }) => {
      const { error } = await supabase.from('message_reactions').delete().eq('message_id', messageId).eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: (_, { messageId }) => {
      queryClient.invalidateQueries({ queryKey: ['message-reactions', messageId] })
    },
  })
}

// ------------------------------------------------------------------
// Forward - sends a copy of a message's content to one or more other
// chats, finding or creating each chat as needed.
// ------------------------------------------------------------------
export interface ForwardableMessage {
  content: string
  media_url?: string | null
  media_type?: 'image' | 'video' | 'audio' | null
  media_duration_seconds?: number | null
  sticker?: string | null
  post_id?: string | null
  story_id?: string | null
}

export function useForwardMessage() {
  const supabase = createClient()

  return useMutation({
    mutationFn: async ({
      message,
      senderId,
      recipientIds,
    }: {
      message: ForwardableMessage
      senderId: string
      recipientIds: string[]
    }) => {
      // Carry over every part of the original message - not just its text -
      // so a forwarded photo/video/voice note/sticker/shared post or reel
      // actually shows up as that same media on the other end, instead of
      // collapsing into a bare caption/title.
      const insertPayload = {
        sender_id: senderId,
        content: message.content,
        media_url: message.media_url ?? null,
        media_type: message.media_type ?? null,
        media_duration_seconds: message.media_duration_seconds ?? null,
        sticker: message.sticker ?? null,
        post_id: message.post_id ?? null,
        story_id: message.story_id ?? null,
        is_forwarded: true,
      }

      const lastMessageType: 'text' | 'post' | 'reel' | 'image' | 'video' | 'audio' | 'sticker' =
        message.post_id || message.story_id ? 'post'
        : message.sticker ? 'sticker'
        : message.media_type === 'image' ? 'image'
        : message.media_type === 'video' ? 'video'
        : message.media_type === 'audio' ? 'audio'
        : 'text'
      const lastMessagePreview =
        message.sticker ? `${message.sticker} Sticker`
        : message.media_type === 'image' ? '📷 Photo'
        : message.media_type === 'video' ? '🎥 Video'
        : message.media_type === 'audio' ? '🎤 Voice message'
        : message.post_id || message.story_id ? '📎 Shared a post'
        : '💬 New message'

      for (const recipientId of recipientIds) {
        let chatId: string | null = null
        const { data: existing } = await supabase
          .from('chats')
          .select('id')
          .or(`and(participant1_id.eq.${senderId},participant2_id.eq.${recipientId}),and(participant1_id.eq.${recipientId},participant2_id.eq.${senderId})`)
          .maybeSingle()

        if (existing) {
          chatId = existing.id
        } else {
          const { data: created } = await supabase
            .from('chats')
            .insert({ participant1_id: senderId, participant2_id: recipientId })
            .select('id').single()
          chatId = created?.id || null
        }
        if (!chatId) continue

        await supabase.from('messages').insert({ chat_id: chatId, ...insertPayload })
        await supabase.from('chats').update({
          last_message: lastMessagePreview,
          last_message_time: new Date().toISOString(),
          last_message_type: lastMessageType,
          last_message_sender_id: senderId,
        }).eq('id', chatId)
      }
    },
  })
}

// ------------------------------------------------------------------
// Fetches a small preview of whichever message is being replied to, for
// the quoted snippet shown above a reply bubble.
// ------------------------------------------------------------------
export function useReplyPreview(replyToId?: string | null) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['message-reply-preview', replyToId],
    queryFn: async () => {
      if (!replyToId) return null
      const { data } = await supabase
        .from('messages')
        .select('id, content, sender_id, media_type, media_url, sticker, profiles:sender_id(username)')
        .eq('id', replyToId)
        .maybeSingle()
      return data as unknown as {
        id: string; content: string; sender_id: string
        media_type: 'image' | 'video' | 'audio' | 'call' | null; media_url: string | null; sticker: string | null
        profiles: { username: string }
      } | null
    },
    enabled: !!replyToId,
  })
}
