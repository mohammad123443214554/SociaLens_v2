'use client'

import { useEffect, useState } from 'react'
import { Heart, MessageCircle } from 'lucide-react'
import { ReelViewer } from '@/components/shared/ReelViewer'
import { useUser } from '@/lib/hooks/useUser'
import { createClient } from '@/lib/supabase/client'
import { useQueryClient } from '@tanstack/react-query'
import { PostWithProfile } from '@/lib/types/database.types'
import { formatCount } from '@/lib/utils/helpers'

export function HomePostEngagement({ post }: { post: PostWithProfile }) {
  const { user } = useUser()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [liked, setLiked] = useState(!!post.is_liked)
  const [likesCount, setLikesCount] = useState(Number(post.likes_count) || 0)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setLikesCount(Number(post.likes_count) || 0)
    if (post.is_liked !== undefined) {
      setLiked(post.is_liked)
      return
    }
    if (!user) {
      setLiked(false)
      return
    }
    let active = true
    supabase.from('likes').select('id').eq('post_id', post.id).eq('user_id', user.id).maybeSingle()
      .then(({ data }) => { if (active) setLiked(!!data) })
    return () => { active = false }
  }, [post.id, post.likes_count, post.is_liked, user?.id])

  const handleLike = async () => {
    if (!user || busy) return
    setBusy(true)
    const wasLiked = liked
    setLiked(!wasLiked)
    setLikesCount(count => Math.max(0, count + (wasLiked ? -1 : 1)))
    try {
      if (wasLiked) {
        const { error } = await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', user.id)
        if (error) throw error
        await supabase.rpc('decrement_likes', { post_id: post.id })
      } else {
        const { error } = await supabase.from('likes').insert({ post_id: post.id, user_id: user.id })
        if (error) throw error
        await supabase.rpc('increment_likes', { post_id: post.id })
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['feed-posts'] }),
        queryClient.invalidateQueries({ queryKey: ['reels-posts'] }),
      ])
    } catch {
      setLiked(wasLiked)
      setLikesCount(count => Math.max(0, count + (wasLiked ? 1 : -1)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-5 border-t border-border/60 px-3 py-2.5 sm:px-4">
      <button type="button" onClick={() => void handleLike()} disabled={!user || busy} aria-label={liked ? 'Unlike post' : 'Like post'} className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground transition-colors hover:text-pink-400 disabled:cursor-not-allowed">
        <Heart className={`h-[17px] w-[17px] ${liked ? 'fill-pink-500 text-pink-500' : ''}`} />
        <span className="text-xs font-medium tabular-nums">{formatCount(likesCount)}</span>
      </button>
      <ReelViewer post={post} initialShowComments trigger={
        <button type="button" aria-label="Open comments" className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground transition-colors hover:text-pink-400">
          <MessageCircle className="h-[17px] w-[17px]" />
          <span className="text-xs font-medium tabular-nums">{formatCount(Number(post.comments_count) || 0)}</span>
        </button>
      } />
    </div>
  )
}
