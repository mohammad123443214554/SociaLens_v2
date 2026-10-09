'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { X, Heart, MessageCircle, Send } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { NativeAdUnit } from './NativeAdUnit'
import { useUser } from '@/lib/hooks/useUser'
import { getAvatarUrl, cn } from '@/lib/utils/helpers'
import { getAdState, toggleAdLike, setAdReaction, addAdComment, type LocalAdComment } from '@/lib/utils/adInteractions'
import { QUICK_REACTION_EMOJIS } from '@/lib/utils/reactionEmojis'

interface AdStoryViewerProps {
  onClose: () => void
  /** Only passed when this ad story is reached by finishing (or tapping
   *  forward past) the very last real story - lets a left-side tap take
   *  The person back into that real story instead of just closing,
   *  same as tapping back on any other story in the row. */
  onGoBack?: () => void
}

const DURATION_MS = 6000

// Deliberately a separate, simple component rather than reusing the real
// StoryViewer - that component is built entirely around real story rows
// (media_url, view/reply tracking, RPC calls, etc.), and hooking a fake
// ad "story" into all of that would be fragile. This mirrors just the
// parts that matter for the illusion: a top progress bar that fills and
// auto-advances, a Sponsored label where a username sits, left/right tap
// zones (matching a real story's prev/next behavior), and working
// like/react/comment - all local-only via lib/utils/adInteractions.ts,
// never Supabase, so none of it ever reaches anyone else or shows up on
// a real Liked/notifications list.
export function AdStoryViewer({ onClose, onGoBack }: AdStoryViewerProps) {
  const generatedId = useId()
  const adId = `ad-story-${generatedId}`
  const { profile } = useUser()

  const [progress, setProgress] = useState(0)
  const [liked, setLiked] = useState(false)
  const [reaction, setReaction] = useState<string | null>(null)
  const [comments, setComments] = useState<LocalAdComment[]>([])
  const [showReactionBar, setShowReactionBar] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [commentInput, setCommentInput] = useState('')
  const startRef = useRef(Date.now())
  const elapsedRef = useRef(0)

  useEffect(() => {
    const state = getAdState(adId)
    setLiked(state.liked)
    setReaction(state.reaction)
    setComments(state.comments)
  }, [adId])

  // Same pause-on-interaction behavior as the real StoryViewer - opening
  // the reaction row or the comment panel freezes the progress clock
  // instead of the bar racing ahead while someone's mid-comment.
  const paused = showReactionBar || showComments
  useEffect(() => {
    if (paused) {
      elapsedRef.current += Date.now() - startRef.current
      return
    }
    startRef.current = Date.now()
    const interval = setInterval(() => {
      const pct = Math.min(100, ((elapsedRef.current + Date.now() - startRef.current) / DURATION_MS) * 100)
      setProgress(pct)
      if (pct >= 100) {
        clearInterval(interval)
        onClose()
      }
    }, 50)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused])

  const handleLike = () => {
    const state = toggleAdLike(adId)
    setLiked(state.liked)
  }

  const handleReact = (emoji: string) => {
    const state = setAdReaction(adId, emoji)
    setReaction(state.reaction)
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
    <div className="fixed inset-0 bg-black z-[200] flex flex-col">
      <div className="absolute top-2 left-2 right-2 z-20 flex gap-1">
        <div className="h-0.5 flex-1 bg-white/30 rounded-full overflow-hidden">
          <div className="h-full bg-white transition-[width] duration-75 ease-linear" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="absolute top-6 left-3 right-3 z-20 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center">
            <span className="text-white text-xs font-bold">Ad</span>
          </div>
          <span className="text-white font-semibold text-sm drop-shadow">Sponsored</span>
        </div>
        <button onClick={onClose} className="text-white p-1">
          <X className="h-6 w-6" />
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <NativeAdUnit background="#000000" />
      </div>

      {/* Tap zones for prev/next, kept short of the bottom action bar -
          same layout as the real StoryViewer's. Left third goes back to
          the previous story when there is one; right two-thirds advances
          (there's nothing after the ad, so that just closes). */}
      <button
        onClick={() => (onGoBack ? onGoBack() : onClose())}
        className="absolute left-0 top-0 h-[calc(100%-84px)] w-1/3 z-10"
        aria-label="Previous story"
      />
      <button onClick={onClose} className="absolute right-0 top-0 h-[calc(100%-84px)] w-2/3 z-10" aria-label="Next story" />

      {/* Bottom action bar - like/react/comment, mirroring the real
          StoryViewer's non-owner action row. */}
      <div className="absolute bottom-0 left-0 right-0 z-30 px-3 pb-4 pt-3 bg-gradient-to-t from-black/60 to-transparent">
        {showReactionBar && (
          <div className="flex items-center gap-2.5 mb-3 bg-black/40 backdrop-blur-sm rounded-full py-2 px-3 mx-auto max-w-[85vw] overflow-x-auto flex-nowrap scrollbar-hide">
            {QUICK_REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleReact(emoji)}
                className={cn('text-2xl shrink-0 transition-transform hover:scale-125', reaction === emoji && 'scale-125')}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <button onClick={handleLike} className="text-white shrink-0">
            <Heart className={cn('h-6 w-6', liked && 'fill-red-500 text-red-500')} />
          </button>
          <button onClick={() => setShowReactionBar((v) => !v)} className="text-2xl leading-none shrink-0">
            {reaction || '😊'}
          </button>
          <button onClick={() => setShowComments(true)} className="text-white shrink-0 flex items-center gap-1">
            <MessageCircle className="h-6 w-6" />
            {comments.length > 0 && <span className="text-xs font-semibold">{comments.length}</span>}
          </button>
        </div>
      </div>

      {/* Comments panel - same shape as the real story's, but a flat
          local-only list instead of CommentThread/Supabase. */}
      {showComments && (
        <div className="absolute inset-0 z-40 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowComments(false)} />
          <div className="relative bg-card rounded-t-2xl max-h-[60%] flex flex-col text-foreground">
            <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
              <h3 className="font-bold">Comments</h3>
              <button onClick={() => setShowComments(false)} className="p-1 rounded-full hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-3 space-y-3">
              {comments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No comments yet.</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="flex items-start gap-2.5">
                    <Avatar className="h-8 w-8 shrink-0">
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
            {profile && (
              <form onSubmit={handleAddComment} className="flex gap-2 p-3 border-t border-border shrink-0">
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
            )}
          </div>
        </div>
      )}
    </div>
  )
}
