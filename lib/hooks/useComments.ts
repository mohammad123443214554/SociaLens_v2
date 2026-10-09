'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { EnrichedComment } from '@/lib/types/database.types'
import { canAccessByPrivacy } from '@/lib/utils/privacyAccess'
import { QUICK_REACTION_EMOJIS } from '@/lib/utils/reactionEmojis'

export type CommentTarget = 'post' | 'story'

// Quick-pick reaction emojis shown right on each comment - same set used
// for story reactions elsewhere in the app, for a consistent feel.
export const COMMENT_REACTION_EMOJIS = QUICK_REACTION_EMOJIS

function tableConfig(target: CommentTarget) {
  return target === 'story'
    ? {
        comments: 'story_comments',
        likes: 'story_comment_likes',
        reactions: 'story_comment_reactions',
        deletes: 'story_comment_deletes',
        parentField: 'story_id' as const,
        notifyComment: 'story_comment' as const,
        notifyCommentLike: 'story_comment_like' as const,
        notifyCommentReact: 'story_comment_react' as const,
        notifyCommentReply: 'story_comment_reply' as const,
      }
    : {
        comments: 'comments',
        likes: 'comment_likes',
        reactions: 'comment_reactions',
        deletes: 'comment_deletes',
        parentField: 'post_id' as const,
        notifyComment: 'comment' as const,
        notifyCommentLike: 'comment_like' as const,
        notifyCommentReact: 'comment_react' as const,
        notifyCommentReply: 'comment_reply' as const,
      }
}

// ------------------------------------------------------------------
// Fetch + assemble the full thread for a post or a story: top-level
// comments with their replies nested underneath, each carrying its own
// like count/status and reaction summary. Comments hidden by their
// author are dropped for anyone except that author and the post/story
// owner; comments this viewer "deleted for me" are dropped just for them.
// ------------------------------------------------------------------
export function useCommentThread(target: CommentTarget, targetId?: string, userId?: string, ownerId?: string) {
  const supabase = createClient()
  const cfg = tableConfig(target)

  return useQuery({
    queryKey: ['comment-thread', target, targetId, userId],
    queryFn: async (): Promise<EnrichedComment[]> => {
      if (!targetId) return []

      // Post/story owners can restrict who's even allowed to see the
      // comments section at all (Post/Story Comment Privacy in
      // Settings). The owner themselves can always see every comment on
      // their own content, no matter what this is set to.
      if (ownerId && userId !== ownerId) {
        const privacyField = target === 'story' ? 'story_comment_privacy' : 'post_comment_privacy'
        const { data: ownerProfile } = await supabase.from('profiles').select(privacyField).eq('id', ownerId).single()
        const level = (ownerProfile as any)?.[privacyField]
        const allowed = await canAccessByPrivacy(supabase, userId, ownerId, level, target === 'story' ? 'story_comment' : 'post_comment')
        if (!allowed) return []
      }

      const { data: rows, error } = await supabase
        .from(cfg.comments)
        .select('*, profiles(*)')
        .eq(cfg.parentField, targetId)
        .order('created_at', { ascending: true })
      if (error) throw error
      const all = (rows || []) as any[]
      if (all.length === 0) return []

      const ids = all.map((c) => c.id)

      const [likesRes, reactionsRes, deletesRes] = await Promise.all([
        supabase.from(cfg.likes).select('comment_id, user_id').in('comment_id', ids),
        supabase.from(cfg.reactions).select('comment_id, user_id, emoji').in('comment_id', ids),
        userId
          ? supabase.from(cfg.deletes).select('comment_id').eq('user_id', userId)
          : Promise.resolve({ data: [] as any[] }),
      ])

      const deletedIds = new Set((deletesRes.data || []).map((d: any) => d.comment_id))

      const likeCounts = new Map<string, number>()
      const myLikes = new Set<string>()
      for (const l of (likesRes.data || []) as any[]) {
        likeCounts.set(l.comment_id, (likeCounts.get(l.comment_id) || 0) + 1)
        if (userId && l.user_id === userId) myLikes.add(l.comment_id)
      }

      const reactionCounts = new Map<string, Record<string, number>>()
      const myReactions = new Map<string, string>()
      for (const r of (reactionsRes.data || []) as any[]) {
        const bucket = reactionCounts.get(r.comment_id) || {}
        bucket[r.emoji] = (bucket[r.emoji] || 0) + 1
        reactionCounts.set(r.comment_id, bucket)
        if (userId && r.user_id === userId) myReactions.set(r.comment_id, r.emoji)
      }

      // Hidden comments stay visible to the person who wrote them, and to
      // the post/story owner looking at their own post/story - nobody else.
      const canSeeHidden = (c: any) => c.user_id === userId || (!!ownerId && ownerId === userId)
      const visible = all.filter((c) => !deletedIds.has(c.id) && (!c.hidden || canSeeHidden(c)))

      const enrich = (c: any): EnrichedComment => ({
        id: c.id,
        user_id: c.user_id,
        content: c.content,
        parent_id: c.parent_id ?? null,
        hidden: !!c.hidden,
        created_at: c.created_at,
        profiles: c.profiles,
        likes_count: likeCounts.get(c.id) || 0,
        is_liked: myLikes.has(c.id),
        my_reaction: myReactions.get(c.id) || null,
        reaction_counts: reactionCounts.get(c.id) || {},
        replies: [],
      })

      const topLevel = visible.filter((c) => !c.parent_id).map(enrich)
      const byId = new Map(topLevel.map((c) => [c.id, c]))

      // Replying to a reply always writes with parent_id already pointing
      // at the top-level comment (see useAddComment below), so this
      // lookup normally succeeds directly. The fallback just protects
      // against any older/edge-case rows that still point at a reply.
      for (const r of visible.filter((c) => c.parent_id)) {
        const directParent = byId.get(r.parent_id)
        if (directParent) {
          directParent.replies.push(enrich(r))
          continue
        }
        const grandParentId = all.find((c) => c.id === r.parent_id)?.parent_id
        const topParent = grandParentId ? byId.get(grandParentId) : undefined
        if (topParent) topParent.replies.push(enrich(r))
      }

      for (const c of topLevel) {
        c.replies.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      }

      return topLevel
    },
    enabled: !!targetId,
  })
}

export function useAddComment(target: CommentTarget) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const cfg = tableConfig(target)

  return useMutation({
    mutationFn: async ({
      targetId,
      userId,
      content,
      replyParentId,
      ownerId,
      replyToCommentId,
      replyToUserId,
      replyToContent,
    }: {
      targetId: string
      userId: string
      content: string
      /** Pass the TOP-LEVEL comment id when this is a reply (replies to a
       *  reply should also pass the top-level id, so the thread stays
       *  one level deep). Omit for a fresh top-level comment. */
      replyParentId?: string
      /** Post/story owner - notified about the new comment, same as before. */
      ownerId?: string
      /** The id/author/text of the SPECIFIC comment or reply the Reply
       *  button was pressed on - used only to notify that person
       *  ("replied to your comment"), separate from replyParentId which is
       *  purely about where the row nests in the thread. */
      replyToCommentId?: string
      replyToUserId?: string
      replyToContent?: string
    }) => {
      const insertRow: Record<string, any> = { [cfg.parentField]: targetId, user_id: userId, content: content.trim() }
      if (replyParentId) insertRow.parent_id = replyParentId
      const { data, error } = await supabase.from(cfg.comments).insert(insertRow).select('*, profiles(*)').single()
      if (error) throw error

      if (target === 'post') {
        await supabase.rpc('increment_comments', { post_id: targetId })
      }

      // The post/story owner hears about every comment left on their
      // content, including replies - a reply is still a comment on their post/story.
      if (ownerId && ownerId !== userId) {
        await supabase.from('notifications').insert({
          user_id: ownerId,
          actor_id: userId,
          type: cfg.notifyComment,
          message: content.trim(),
          comment_id: data.id,
          ...(target === 'post' ? { post_id: targetId } : { story_id: targetId }),
        })
      }

      // The person being replied to hears about it too, separately from
      // the owner notification above (and never doubles up with it when
      // the owner IS the person being replied to).
      if (replyToCommentId && replyToUserId && replyToUserId !== userId && replyToUserId !== ownerId) {
        await supabase.from('notifications').insert({
          user_id: replyToUserId,
          actor_id: userId,
          type: cfg.notifyCommentReply,
          message: content.trim(),
          context_text: replyToContent ?? null,
          comment_id: replyToCommentId,
          ...(target === 'post' ? { post_id: targetId } : { story_id: targetId }),
        })
      }

      return data
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['comment-thread', target, vars.targetId] })
    },
  })
}

export function useToggleCommentLike(target: CommentTarget) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const cfg = tableConfig(target)

  return useMutation({
    mutationFn: async ({
      commentId,
      userId,
      liked,
      commentAuthorId,
      commentContent,
    }: {
      commentId: string
      userId: string
      liked: boolean
      targetId: string
      /** Who wrote the comment and what it said - only used to send them
       *  a "liked your comment" notification when liking (not unliking). */
      commentAuthorId?: string
      commentContent?: string
    }) => {
      if (liked) {
        const { error } = await supabase.from(cfg.likes).delete().eq('comment_id', commentId).eq('user_id', userId)
        if (error) throw error
      } else {
        const { error } = await supabase.from(cfg.likes).insert({ comment_id: commentId, user_id: userId })
        if (error) throw error
        if (commentAuthorId && commentAuthorId !== userId) {
          await supabase.from('notifications').insert({
            user_id: commentAuthorId,
            actor_id: userId,
            type: cfg.notifyCommentLike,
            message: commentContent ?? null,
            comment_id: commentId,
          })
        }
      }
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['comment-thread', target, vars.targetId] })
    },
  })
}

export function useSetCommentReaction(target: CommentTarget) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const cfg = tableConfig(target)

  return useMutation({
    mutationFn: async ({
      commentId,
      userId,
      emoji,
      commentAuthorId,
      commentContent,
    }: {
      commentId: string
      userId: string
      emoji: string
      targetId: string
      commentAuthorId?: string
      commentContent?: string
    }) => {
      const { error } = await supabase
        .from(cfg.reactions)
        .upsert({ comment_id: commentId, user_id: userId, emoji }, { onConflict: 'comment_id,user_id' })
      if (error) throw error
      if (commentAuthorId && commentAuthorId !== userId) {
        await supabase.from('notifications').insert({
          user_id: commentAuthorId,
          actor_id: userId,
          type: cfg.notifyCommentReact,
          message: commentContent ?? null,
          emoji,
          comment_id: commentId,
        })
      }
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['comment-thread', target, vars.targetId] })
    },
  })
}

export function useRemoveCommentReaction(target: CommentTarget) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const cfg = tableConfig(target)

  return useMutation({
    mutationFn: async ({ commentId, userId }: { commentId: string; userId: string; targetId: string }) => {
      const { error } = await supabase.from(cfg.reactions).delete().eq('comment_id', commentId).eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['comment-thread', target, vars.targetId] })
    },
  })
}

// Full delete - removed for everyone. RLS only allows the comment's own
// author to do this, same as before.
export function useDeleteComment(target: CommentTarget) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const cfg = tableConfig(target)

  return useMutation({
    mutationFn: async ({ commentId, targetId }: { commentId: string; targetId: string }) => {
      const { error } = await supabase.from(cfg.comments).delete().eq('id', commentId)
      if (error) throw error
      if (target === 'post') {
        await supabase.rpc('decrement_comments', { post_id: targetId })
      }
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['comment-thread', target, vars.targetId] })
    },
  })
}

// "Delete for me" - stays visible to everyone else, just gone from this
// viewer's own list from now on.
export function useDeleteCommentForMe(target: CommentTarget) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const cfg = tableConfig(target)

  return useMutation({
    mutationFn: async ({ commentId, userId }: { commentId: string; userId: string; targetId: string }) => {
      const { error } = await supabase.from(cfg.deletes).insert({ comment_id: commentId, user_id: userId })
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['comment-thread', target, vars.targetId] })
    },
  })
}

// Hide/unhide - only the comment's own author can do this (matching
// RLS's existing "update own comment" policy). While hidden, nobody but
// that author and the post/story owner can see the comment at all.
export function useSetCommentHidden(target: CommentTarget) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const cfg = tableConfig(target)

  return useMutation({
    mutationFn: async ({ commentId, hidden }: { commentId: string; hidden: boolean; targetId: string }) => {
      const { error } = await supabase.from(cfg.comments).update({ hidden }).eq('id', commentId)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['comment-thread', target, vars.targetId] })
    },
  })
}

// Full list of who reacted to a comment and with what emoji - fetched
// on demand (only when the reaction breakdown popup is actually opened)
// since most viewers never need this and it isn't part of the main
// thread query.
export function useCommentReactors(target: CommentTarget, commentId?: string, enabled = true) {
  const supabase = createClient()
  const cfg = tableConfig(target)

  return useQuery({
    queryKey: ['comment-reactors', target, commentId],
    queryFn: async () => {
      if (!commentId) return []
      const { data, error } = await supabase
        .from(cfg.reactions)
        .select('emoji, created_at, profiles(*)')
        .eq('comment_id', commentId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as { emoji: string; created_at: string; profiles: any }[]
    },
    enabled: enabled && !!commentId,
  })
}

// Total comment count (top-level + all replies) for badges/icons -
// derived straight from an already-fetched thread so it always matches
// exactly what's on screen.
export function countThread(thread: EnrichedComment[]): number {
  return thread.reduce((sum, c) => sum + 1 + c.replies.length, 0)
}
