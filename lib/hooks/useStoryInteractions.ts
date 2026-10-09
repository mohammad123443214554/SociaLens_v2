'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/lib/types/database.types'
import { QUICK_REACTION_EMOJIS } from '@/lib/utils/reactionEmojis'

// Quick-pick mood emojis shown directly on the React button, one tap each -
// same set used for comment reactions elsewhere in the app, for a
// consistent feel across the whole app.
export const STORY_REACTION_EMOJIS = QUICK_REACTION_EMOJIS

// ------------------------------------------------------------------
// Likes
// ------------------------------------------------------------------
export function useStoryLike(storyId?: string, userId?: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['story-like', storyId, userId],
    queryFn: async () => {
      if (!storyId) return { liked: false, count: 0 }
      const [{ data: mine }, { count }] = await Promise.all([
        userId
          ? supabase.from('story_likes').select('id').eq('story_id', storyId).eq('user_id', userId).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from('story_likes').select('id', { count: 'exact', head: true }).eq('story_id', storyId),
      ])
      return { liked: !!mine, count: count ?? 0 }
    },
    enabled: !!storyId,
  })
}

export function useToggleStoryLike() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ storyId, userId, liked, storyOwnerId }: { storyId: string; userId: string; liked: boolean; storyOwnerId?: string }) => {
      if (liked) {
        const { error } = await supabase.from('story_likes').delete().eq('story_id', storyId).eq('user_id', userId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('story_likes').insert({ story_id: storyId, user_id: userId })
        if (error) throw error
        if (storyOwnerId && storyOwnerId !== userId) {
          await supabase.from('notifications').insert({
            user_id: storyOwnerId, actor_id: userId, type: 'story_like', story_id: storyId,
          })
        }
      }
    },
    onSuccess: (_, { storyId, userId }) => {
      queryClient.invalidateQueries({ queryKey: ['story-like', storyId, userId] })
    },
  })
}

// ------------------------------------------------------------------
// Reactions - one mood emoji per person per story
// ------------------------------------------------------------------
export function useStoryReaction(storyId?: string, userId?: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['story-reaction', storyId, userId],
    queryFn: async () => {
      if (!storyId || !userId) return null
      const { data } = await supabase
        .from('story_reactions')
        .select('emoji')
        .eq('story_id', storyId)
        .eq('user_id', userId)
        .maybeSingle()
      return data?.emoji ?? null
    },
    enabled: !!storyId && !!userId,
  })
}

export function useSetStoryReaction() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ storyId, userId, emoji, storyOwnerId }: { storyId: string; userId: string; emoji: string; storyOwnerId?: string }) => {
      const { error } = await supabase
        .from('story_reactions')
        .upsert({ story_id: storyId, user_id: userId, emoji }, { onConflict: 'story_id,user_id' })
      if (error) throw error
      if (storyOwnerId && storyOwnerId !== userId) {
        await supabase.from('notifications').insert({
          user_id: storyOwnerId, actor_id: userId, type: 'story_react', emoji, story_id: storyId,
        })
      }
    },
    onSuccess: (_, { storyId, userId }) => {
      queryClient.invalidateQueries({ queryKey: ['story-reaction', storyId, userId] })
    },
  })
}

export function useRemoveStoryReaction() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ storyId, userId }: { storyId: string; userId: string }) => {
      const { error } = await supabase.from('story_reactions').delete().eq('story_id', storyId).eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: (_, { storyId, userId }) => {
      queryClient.invalidateQueries({ queryKey: ['story-reaction', storyId, userId] })
    },
  })
}

// ------------------------------------------------------------------
// Comments now live in lib/hooks/useComments.ts (useCommentThread /
// useAddComment / etc. with target='story') so the same like, react,
// reply, hide, and delete-for-me features work for both post and
// story comments from one place.
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// "Reply to your story" - sends a normal chat message that also carries
// which story it replied to (story_id), so the chat bubble can render it
// with the story preview above the text, Instagram-style.
// ------------------------------------------------------------------
export function useReplyToStory() {
  const supabase = createClient()

  return useMutation({
    mutationFn: async ({
      storyId,
      storyOwnerId,
      senderId,
      content,
    }: {
      storyId: string
      storyOwnerId: string
      senderId: string
      content: string
    }) => {
      let chatId: string | null = null
      const { data: existing } = await supabase
        .from('chats')
        .select('id')
        .or(
          `and(participant1_id.eq.${senderId},participant2_id.eq.${storyOwnerId}),` +
          `and(participant1_id.eq.${storyOwnerId},participant2_id.eq.${senderId})`
        )
        .maybeSingle()

      if (existing) {
        chatId = existing.id
      } else {
        const { data: created, error: createError } = await supabase
          .from('chats')
          .insert({ participant1_id: senderId, participant2_id: storyOwnerId })
          .select('id')
          .single()
        // Row Level Security blocks this insert if the story owner's
        // message_privacy setting doesn't allow the sender to message them.
        if (createError || !created) throw new Error('Message is not available.')
        chatId = created.id
      }

      const { error: msgError } = await supabase.from('messages').insert({
        chat_id: chatId,
        sender_id: senderId,
        content: content.trim(),
        story_id: storyId,
      })
      // Same RLS gate applies on every message insert, even into an
      // already-existing chat, so re-check message_privacy failures here too.
      if (msgError) throw new Error('Message is not available.')

      await supabase.from('chats').update({
        last_message: '💬 Replied to a story',
        last_message_time: new Date().toISOString(),
        last_message_type: 'story',
        last_message_sender_id: senderId,
      }).eq('id', chatId)

      return chatId
    },
  })
}

// ------------------------------------------------------------------
// Views - who has watched this story (owner-only, Instagram-style).
// ------------------------------------------------------------------
export function useRecordStoryView() {
  const supabase = createClient()

  return useMutation({
    mutationFn: async ({ storyId, viewerId }: { storyId: string; viewerId: string }) => {
      const { error } = await supabase
        .from('story_views')
        .insert({ story_id: storyId, viewer_id: viewerId })
      // 23505 = unique_violation - they've already viewed this story before,
      // that's expected and fine, not a real error.
      if (error && (error as any).code !== '23505') {
        // Logged so it's visible in the browser console (F12) if something
        // like an RLS policy is blocking this - a silently-swallowed
        // mutation error is otherwise impossible to debug from the UI.
        console.error('Failed to record story view:', error)
        throw error
      }
    },
  })
}

export function useStoryViews(storyId?: string, enabled = true) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['story-views', storyId],
    queryFn: async () => {
      if (!storyId) return []
      const { data, error } = await supabase
        .from('story_views')
        .select('viewer_id, viewed_at, profiles(*)')
        .eq('story_id', storyId)
        .order('viewed_at', { ascending: false })
      if (error) throw error
      return (data || []) as unknown as { viewer_id: string; viewed_at: string; profiles: Profile }[]
    },
    enabled: !!storyId && enabled,
  })
}

// ------------------------------------------------------------------
// Who liked - shown to the owner when they tap the like count.
// ------------------------------------------------------------------
export function useStoryLikers(storyId?: string, enabled = true) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['story-likers', storyId],
    queryFn: async () => {
      if (!storyId) return []
      const { data, error } = await supabase
        .from('story_likes')
        .select('user_id, created_at, profiles(*)')
        .eq('story_id', storyId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as unknown as { user_id: string; created_at: string; profiles: Profile }[]
    },
    enabled: !!storyId && enabled,
  })
}

// ------------------------------------------------------------------
// Who reacted (and with what emoji) - shown to the owner next to the
// like-viewers button.
// ------------------------------------------------------------------
export function useStoryReactors(storyId?: string, enabled = true) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['story-reactors', storyId],
    queryFn: async () => {
      if (!storyId) return []
      const { data, error } = await supabase
        .from('story_reactions')
        .select('user_id, emoji, created_at, profiles(*)')
        .eq('story_id', storyId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as unknown as { user_id: string; emoji: string; created_at: string; profiles: Profile }[]
    },
    enabled: !!storyId && enabled,
  })
}
