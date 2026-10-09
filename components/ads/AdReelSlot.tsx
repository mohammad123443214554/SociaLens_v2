'use client'

import { useEffect, useId, useState } from 'react'
import { Heart, MessageCircle, Bookmark, Volume2, VolumeX, X, Send } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { NativeAdUnit } from './NativeAdUnit'
import { useUser } from '@/lib/hooks/useUser'
import { getAvatarUrl, formatCount } from '@/lib/utils/helpers'
import { getAdState, toggleAdLike, toggleAdSave, addAdComment, type LocalAdComment } from '@/lib/utils/adInteractions'

interface AdReelSlotProps {
  isActive: boolean
  isMuted: boolean
  onToggleMute: () => void
}

// Sits in the Reels swipe feed at a randomized position (see
// lib/utils/adInsertion.ts) styled exactly like a real reel: full-screen
// dark stage, the same bottom-left "account" info block, and the same
// right-side action rail - so scrolling past it feels identical to
// scrolling past any other reel. Like/comment/save here are functional,
// same as the feed/explore ad fix (AdPostSlot) - but entirely local via
// lib/utils/adInteractions.ts, never Supabase, so they can never show up
// in a real Liked list, Saved folders, or anyone else's notifications.
// Share is left out on purpose - there's nothing real behind the ad to
// forward. The only tell, by design, is the small "Sponsored" label
// where a username would be, matching the Post/Story ad slots.
export function AdReelSlot({ isActive, isMuted, onToggleMute }: AdReelSlotProps) {
  const generatedId = useId()
  const adId = `ad-reel-${generatedId}`
  const { profile } = useUser()

  const [liked, setLiked] = useState(false)
  const [likesCount, setLikesCount] = useState(0)
  const [saved, setSaved] = useState(false)
  const [comments, setComments] = useState<LocalAdComment[]>([])
  const [showComments, setShowComments] = useState(false)
  const [commentInput, setCommentInput] = useState('')

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
    <div className="relative w-full h-full flex-shrink-0 bg-black snap-start snap-always overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center">
        {isActive && <NativeAdUnit background="#000000" />}
      </div>

      <button onClick={onToggleMute} className="absolute top-3 right-3 z-20 h-9 w-9 rounded-full bg-black/30 flex items-center justify-center">
        {isMuted ? <VolumeX className="h-4 w-4 text-white" /> : <Volume2 className="h-4 w-4 text-white" />}
      </button>

      {/* Right-side action rail - visually matches ReelCard's. Like/comment/save
          are real (locally), same as the feed/explore ad fix. */}
      <div className="absolute right-2 bottom-24 z-10 flex flex-col items-center gap-5">
        <button onClick={handleLike} className="flex flex-col items-center gap-1">
          <Heart className={`h-7 w-7 transition-all ${liked ? 'fill-red-500 text-red-500 scale-110' : 'text-white'}`} />
          {likesCount > 0 && <span className="text-white text-xs font-semibold drop-shadow">{formatCount(likesCount)}</span>}
        </button>
        <button onClick={() => setShowComments(true)} className="flex flex-col items-center gap-1">
          <MessageCircle className="h-7 w-7 text-white" />
          {comments.length > 0 && <span className="text-white text-xs font-semibold drop-shadow">{formatCount(comments.length)}</span>}
        </button>
        <button onClick={handleSave} className="flex flex-col items-center gap-1">
          <Bookmark className={`h-7 w-7 ${saved ? 'fill-white text-white' : 'text-white'}`} />
        </button>
      </div>

      {/* Bottom info - same position/shape as a real reel's account row. */}
      <div className="absolute bottom-6 left-3 right-16 z-10 pointer-events-none">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-full border-2 border-white/80 bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center">
            <span className="text-white text-sm font-bold">Ad</span>
          </div>
          <span className="text-white font-semibold text-sm drop-shadow">Sponsored</span>
        </div>
      </div>

      {showComments && (
        <div
          className="fixed inset-0 bg-black/60 z-[100] flex items-end justify-center"
          onClick={() => setShowComments(false)}
        >
          <div
            className="bg-card rounded-t-2xl w-full max-w-md max-h-[70vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b shrink-0">
              <p className="font-semibold">Comments</p>
              <button onClick={() => setShowComments(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide px-4 py-3 space-y-3">
              {comments.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No comments yet!</p>
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
            <form onSubmit={handleAddComment} className="flex gap-2 p-3 border-t shrink-0">
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
        </div>
      )}
    </div>
  )
}
