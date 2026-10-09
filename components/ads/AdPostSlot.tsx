'use client'

import { useEffect, useId, useState } from 'react'
import { Heart, MessageCircle, Bookmark, Send } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { NativeAdUnit } from './NativeAdUnit'
import { useUser } from '@/lib/hooks/useUser'
import { getAvatarUrl, formatCount } from '@/lib/utils/helpers'
import { getAdState, toggleAdLike, toggleAdSave, addAdComment, type LocalAdComment } from '@/lib/utils/adInteractions'

// Sits in the Home feed / Explore grid at a randomized position (see
// lib/utils/adInsertion.ts) styled exactly like a real PostCard: same
// header row, same media area, same action-icon row, same "N likes"
// line and inline comment box underneath. Unlike a real post though,
// liking/commenting/saving here is entirely local - it reads and writes
// only this browser's localStorage (lib/utils/adInteractions.ts) and
// never touches Supabase, so an ad can never end up in anyone's real
// Liked list, Saved folders, or notifications, and nobody else ever
// sees a "comment" left on it. The only tell, by design, is the small
// "Sponsored" label where a timestamp would normally sit - same as how
// Instagram labels a sponsored post while keeping it just as tappable
// As any other. Share is left out on purpose: there's nothing real
// behind the ad to forward to someone else.
export function AdPostSlot() {
  const generatedId = useId()
  const adId = `ad-post-${generatedId}`
  const { profile } = useUser()

  const [liked, setLiked] = useState(false)
  const [likesCount, setLikesCount] = useState(0)
  const [saved, setSaved] = useState(false)
  const [comments, setComments] = useState<LocalAdComment[]>([])
  const [showComments, setShowComments] = useState(false)
  const [commentInput, setCommentInput] = useState('')

  // Hydrate from localStorage after mount (server render never has
  // access to it) - this only ever affects this one ad slot's own state.
  useEffect(() => {
    const state = getAdState(adId)
    setLiked(state.liked)
    setLikesCount(state.likesCount)
    setSaved(state.saved)
    setComments(state.comments)
  }, [adId])

  const handleLike = () => {
    const state = toggleAdLike(adId)
    setLiked(state.liked)
    setLikesCount(state.likesCount)
  }

  const handleSave = () => {
    const state = toggleAdSave(adId)
    setSaved(state.saved)
  }

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault()
    if (!commentInput.trim()) return
    const state = addAdComment(adId, commentInput.trim(), {
      name: profile?.username || 'You',
      avatar: profile?.avatar_url,
    })
    setComments(state.comments)
    setCommentInput('')
  }

  return (
    <article className="border-b bg-card">
      <div className="flex items-center gap-2.5 px-4 py-3">
        <div className="h-9 w-9 rounded-full bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center shrink-0">
          <span className="text-white text-sm font-bold">Ad</span>
        </div>
        <div>
          <p className="font-semibold text-sm leading-none">Sponsored</p>
        </div>
      </div>

      <div className="relative w-full bg-muted">
        <NativeAdUnit background="var(--card, #fff)" />
      </div>

      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            onClick={handleLike}
            className="h-9 w-9 flex items-center justify-center rounded-md hover:bg-accent transition-colors"
          >
            <Heart className={`h-5 w-5 transition-all ${liked ? 'fill-red-500 text-red-500 scale-110' : ''}`} />
          </button>
          <button
            onClick={() => setShowComments((v) => !v)}
            className="h-9 w-9 flex items-center justify-center rounded-md hover:bg-accent transition-colors"
          >
            <MessageCircle className={`h-5 w-5 ${showComments ? 'fill-foreground' : ''}`} />
          </button>
        </div>
        <button
          onClick={handleSave}
          className="h-9 w-9 flex items-center justify-center rounded-md hover:bg-accent transition-colors"
        >
          <Bookmark className={`h-5 w-5 ${saved ? 'fill-current' : ''}`} />
        </button>
      </div>

      {likesCount > 0 && <p className="px-4 text-sm font-semibold pb-1">{formatCount(likesCount)} likes</p>}

      {showComments && (
        <div className="border-t px-4 pt-3 pb-3">
          <div className="space-y-3 max-h-48 overflow-y-auto overflow-x-hidden scrollbar-hide mb-3">
            {comments.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">No comments yet!</p>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="flex items-start gap-2.5">
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarImage src={getAvatarUrl(c.authorAvatar ?? null)} />
                    <AvatarFallback>{c.authorName?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <p className="text-sm">
                    <span className="font-semibold mr-1">{c.authorName}</span>
                    {c.content}
                  </p>
                </div>
              ))
            )}
          </div>
          <form onSubmit={handleAddComment} className="flex gap-2">
            <input
              value={commentInput}
              onChange={(e) => setCommentInput(e.target.value)}
              placeholder="Add a comment..."
              className="flex-1 bg-muted rounded-full px-3 py-2 text-sm outline-none border border-transparent focus:border-pink-500"
            />
            <button type="submit" disabled={!commentInput.trim()} className="text-pink-500 disabled:opacity-40 shrink-0">
              <Send className="h-5 w-5" />
            </button>
          </form>
        </div>
      )}
    </article>
  )
}
