'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Flag, Heart, MessageCircle, MoreHorizontal, Repeat2, Share2, EyeOff } from 'lucide-react'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { ShareModal } from '@/components/shared/ShareModal'
import { ReportModal } from '@/components/shared/ReportModal'
import { CommentThread } from '@/components/shared/CommentThread'
import { PostCaption } from '@/components/shared/PostCaption'
import { SaveButton } from '@/components/shared/SaveButton'
import { useUser } from '@/lib/hooks/useUser'
import { useIsReposted, useToggleRepost } from '@/lib/hooks/useRepost'
import { useTrackEvent } from '@/lib/hooks/useTrackEvent'
import { createClient } from '@/lib/supabase/client'
import { useQueryClient } from '@tanstack/react-query'
import { PostWithProfile } from '@/lib/types/database.types'
import { formatCount } from '@/lib/utils/helpers'

interface ReelViewerProps {
  post: PostWithProfile
  trigger: ReactNode
  onNotInterested?: (postId: string) => void
}

export function ReelViewer({ post, trigger, onNotInterested }: ReelViewerProps) {
  const [open, setOpen] = useState(false)
  const [liked, setLiked] = useState(false)
  const [likesCount, setLikesCount] = useState(Number(post.likes_count) || 0)
  const [showComments, setShowComments] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [showOptions, setShowOptions] = useState(false)
  const [optionsPosition, setOptionsPosition] = useState<{ top: number; right: number } | null>(null)
  const [portalReady, setPortalReady] = useState(false)
  const optionsButtonRef = useRef<HTMLButtonElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackedOpenRef = useRef(false)
  const lastVideoTimeRef = useRef<number | null>(null)
  const watchedSecondsRef = useRef(0)
  const dialogScrollRef = useRef<HTMLDivElement>(null)
  const { user, profile } = useUser()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const track = useTrackEvent()
  const { data: isReposted = false } = useIsReposted(post.id, user?.id, post.is_reposted)
  const toggleRepost = useToggleRepost()
  const mediaLabel = post.media_type === 'video' ? 'reel' : 'post'

  useEffect(() => setPortalReady(true), [])

  useEffect(() => {
    if (!showOptions) return
    const updatePosition = () => {
      const rect = optionsButtonRef.current?.getBoundingClientRect()
      if (!rect) return
      setOptionsPosition({ top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setShowOptions(false) }
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!optionsButtonRef.current?.contains(target) && !document.getElementById(`post-options-${post.id}`)?.contains(target)) setShowOptions(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    document.addEventListener('pointerdown', closeOnOutside)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      document.removeEventListener('keydown', closeOnEscape)
      document.removeEventListener('pointerdown', closeOnOutside)
    }
  }, [showOptions, post.id])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let onCanPlay: (() => void) | undefined
    if (open) {
      const play = () => video.play().catch(() => {})
      if (video.readyState >= 2) play()
      else {
        onCanPlay = play
        video.addEventListener('canplay', onCanPlay, { once: true })
        video.load()
      }
    } else {
      video.pause()
      video.currentTime = 0
    }
    return () => {
      if (onCanPlay) video.removeEventListener('canplay', onCanPlay)
    }
  }, [open, post.media_url])

  useEffect(() => {
    if (!showComments || !open) return
    const frame = window.requestAnimationFrame(() => {
      const container = dialogScrollRef.current
      if (container) container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [showComments, open])

  useEffect(() => {
    if (!open) {
      trackedOpenRef.current = false
      lastVideoTimeRef.current = null
      watchedSecondsRef.current = 0
      return
    }
    if (!trackedOpenRef.current) {
      track({
        target_type: post.media_type === 'video' ? 'reel' : 'post',
        target_id: post.id,
        creator_id: post.user_id,
        event_type: 'view',
      })
      trackedOpenRef.current = true
    }
  }, [open, post.id, post.user_id, post.media_type, track])

  const trackVideoProgress = () => {
    const video = videoRef.current
    if (!video) return
    const current = video.currentTime
    const previous = lastVideoTimeRef.current
    if (previous !== null) {
      const delta = current - previous
      // Ignore seeks and tab-resume jumps; count only normal playback progress.
      if (delta > 0 && delta <= 2.5) watchedSecondsRef.current += delta
    }
    lastVideoTimeRef.current = current
  }

  const flushVideoWatchTime = () => {
    const video = videoRef.current
    const seconds = Math.floor(watchedSecondsRef.current)
    if (seconds >= 1) {
      track({
        target_type: 'reel',
        target_id: post.id,
        creator_id: post.user_id,
        event_type: 'watch_time',
        watch_seconds: seconds,
        video_duration: Number.isFinite(video?.duration) ? video?.duration : undefined,
      })
    }
    watchedSecondsRef.current = 0
    lastVideoTimeRef.current = video?.currentTime ?? null
  }

  const handleVideoEnded = () => {
    flushVideoWatchTime()
    track({ target_type: 'reel', target_id: post.id, creator_id: post.user_id, event_type: 'completion' })
  }

  useEffect(() => {
    if (!user || !open) return
    if (post.is_liked !== undefined) { setLiked(post.is_liked); return }
    supabase.from('likes').select('id').eq('post_id', post.id).eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setLiked(!!data))
  }, [open, post.id, user?.id])

  const handleLike = async () => {
    if (!user) return
    const next = !liked
    setLiked(next)
    setLikesCount(count => Math.max(0, count + (next ? 1 : -1)))
    if (next) {
      const { error } = await supabase.from('likes').insert({ post_id: post.id, user_id: user.id })
      if (!error) {
        await supabase.rpc('increment_likes', { post_id: post.id })
        track({ target_type: post.media_type === 'video' ? 'reel' : 'post', target_id: post.id, creator_id: post.user_id, event_type: 'like' })
      }
      if (!error && user.id !== post.user_id) {
        await supabase.from('notifications').insert({ user_id: post.user_id, actor_id: user.id, type: 'like', post_id: post.id })
      }
    } else {
      const { error } = await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', user.id)
      if (!error) await supabase.rpc('decrement_likes', { post_id: post.id })
    }
    queryClient.invalidateQueries({ queryKey: ['feed-posts'] })
    queryClient.invalidateQueries({ queryKey: ['explore-posts'] })
  }

  const handleNotInterested = async (postId: string) => {
    if (user) {
      const { error } = await supabase.from('post_not_interested').upsert(
        { user_id: user.id, post_id: postId },
        { onConflict: 'user_id,post_id', ignoreDuplicates: true }
      )
      if (error) {
        console.error('Could not save not-interested preference', error)
        return
      }
      // Use the database event RPC so this preference also updates creator
      // and hashtag affinities, not just the raw event log.
      const { error: eventError } = await supabase.rpc('record_content_event', {
        p_user_id: user.id,
        p_target_type: post.media_type === 'video' ? 'reel' : 'post',
        p_target_id: postId,
        p_creator_id: post.user_id,
        p_event_type: 'not_interested',
      })
      if (eventError) console.error('Could not record not-interested learning signal', eventError)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['feed-posts', user.id] }),
        queryClient.invalidateQueries({ queryKey: ['explore-posts', user.id] }),
        queryClient.invalidateQueries({ queryKey: ['reels-posts', user.id] }),
        queryClient.invalidateQueries({ queryKey: ['explore-top-reels'] }),
        queryClient.invalidateQueries({ queryKey: ['explore-photo-posts-top10'] }),
        queryClient.invalidateQueries({ queryKey: ['all-explore-reels'] }),
        queryClient.invalidateQueries({ queryKey: ['all-explore-photo-posts'] }),
      ])
    }
    setShowOptions(false)
    setOpen(false)
    onNotInterested?.(postId)
  }

  const handleRepost = () => {
    if (!user) return
    toggleRepost.mutate({ postId: post.id, userId: user.id, postOwnerId: post.user_id, repost: !isReposted })
  }


  return (
    <>
      <Dialog modal={false} open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent onInteractOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => event.preventDefault()} className="flex max-h-[94dvh] w-[calc(100%-1rem)] max-w-xl flex-col gap-0 overflow-hidden rounded-2xl border-border/80 bg-background p-0 shadow-2xl sm:max-h-[92vh] sm:w-[calc(100%-2rem)] sm:rounded-2xl">
          <div ref={dialogScrollRef} className="flex min-h-0 flex-col overflow-y-auto">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
              <Link href={`/profile/${post.profiles?.username ?? ''}`} onClick={() => setOpen(false)} className="min-w-0 truncate text-sm font-semibold hover:text-pink-400">@{post.profiles?.username ?? 'user'}</Link>
              <div className="mr-8 shrink-0">
                <button ref={optionsButtonRef} type="button" aria-label="More post options" aria-expanded={showOptions} onClick={() => {
                  if (showOptions) {
                    setShowOptions(false)
                    return
                  }
                  const rect = optionsButtonRef.current?.getBoundingClientRect()
                  if (rect) setOptionsPosition({ top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) })
                  setShowOptions(true)
                }} className="flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm transition-colors hover:text-white/80"><MoreHorizontal className="h-5 w-5" /></button>
              </div>
            </div>
            <div className={`flex w-full items-center justify-center ${post.media_type === 'video' ? 'bg-black' : 'bg-background'}`}>
              {post.media_type === 'video' ? (
                <video ref={videoRef} src={post.media_url ?? undefined} controls playsInline autoPlay preload="auto" onTimeUpdate={trackVideoProgress} onPause={flushVideoWatchTime} onEnded={handleVideoEnded} className="max-h-[58dvh] w-full object-contain sm:max-h-[62vh]" aria-label={`Video post by @${post.profiles?.username ?? 'user'}`} />
              ) : (
                <img src={post.media_url ?? undefined} alt={`Post by @${post.profiles?.username ?? 'user'}`} className="max-h-[58dvh] w-full object-contain sm:max-h-[62vh]" />
              )}
            </div>
            {post.content?.trim() && <div className="border-b border-border/60 px-4 py-3">
              <PostCaption content={post.content} expandMode="inline" titleClassName="text-sm leading-relaxed font-semibold" captionClassName="mt-1 text-sm leading-6 text-muted-foreground" buttonClassName="mt-1 text-xs font-semibold text-pink-400 hover:underline" />
            </div>}
            {showComments && <div className="min-h-[180px] max-h-[42dvh] shrink-0 overflow-y-auto border-b border-border/70 px-4 py-3 sm:min-h-[220px]"><p className="mb-3 text-xs font-semibold text-muted-foreground">Comments</p><CommentThread target="post" targetId={post.id} currentUserId={user?.id} ownerId={post.user_id} commentRestrictedUntil={profile?.restrict_comment_until} variant="compact" listClassName="max-h-[36dvh] min-h-[130px] mb-2" /></div>}
            <div className="shrink-0 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center justify-start gap-3 sm:gap-4">
                  <button type="button" onClick={handleLike} aria-label={`Like ${mediaLabel}`} className="flex flex-col items-center gap-0.5"><div className={`p-1.5 rounded-full backdrop-blur-sm ${liked ? 'bg-red-500/20' : 'bg-black/30'}`}><Heart className={`h-5 w-5 ${liked ? 'fill-red-500 text-red-500' : 'text-white'}`} /></div><span className="text-white text-[10px] font-semibold drop-shadow">{formatCount(likesCount)}</span></button>
                  <button type="button" onClick={() => setShowComments(true)} aria-label="Comments" className="flex flex-col items-center gap-0.5"><div className="p-1.5 rounded-full bg-black/30 backdrop-blur-sm"><MessageCircle className="h-5 w-5 text-white" /></div><span className="text-white text-[10px] font-semibold drop-shadow">{formatCount(post.comments_count)}</span></button>
                  <button type="button" onClick={() => { setShowShare(true); track({ target_type: post.media_type === 'video' ? 'reel' : 'post', target_id: post.id, creator_id: post.user_id, event_type: 'share' }) }} aria-label={`Share ${mediaLabel}`} className="flex flex-col items-center gap-0.5"><div className="p-1.5 rounded-full bg-black/30 backdrop-blur-sm"><Share2 className="h-5 w-5 text-white" /></div><span className="text-white text-[10px] font-semibold drop-shadow">Share</span></button>
                  <button type="button" onClick={handleRepost} disabled={!user || toggleRepost.isPending} aria-label="Repost" className="flex flex-col items-center justify-center gap-0.5 disabled:cursor-not-allowed"><div className={`p-1.5 rounded-full backdrop-blur-sm ${isReposted ? 'bg-green-500/20' : 'bg-black/30'}`}><Repeat2 className={`h-5 w-5 ${isReposted ? 'text-green-500 animate-repost-spin' : 'text-white'}`} /></div><span className="text-white text-[10px] font-semibold drop-shadow">Repost</span></button>
                </div>
                <SaveButton postId={post.id} className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center p-1.5 rounded-full bg-black/30 backdrop-blur-sm" iconClassName="h-5 w-5 text-white" />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {portalReady && showOptions && optionsPosition && createPortal(
        <div id={`post-options-${post.id}`} role="menu" aria-label="Post options" onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} style={{ position: 'fixed', top: optionsPosition.top, right: optionsPosition.right }} className="z-[9999] min-w-[180px] overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl">
          <button type="button" role="menuitem" onClick={() => { void handleNotInterested(post.id) }} className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm hover:bg-accent"><EyeOff className="mr-2 h-4 w-4" />Not interested</button>
          <button type="button" role="menuitem" onClick={() => { setShowOptions(false); if (user) setShowReport(true) }} className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm hover:bg-accent"><Flag className="mr-2 h-4 w-4" />Report</button>
        </div>,
        document.body
      )}
      {showShare && <ShareModal post={post} onClose={() => setShowShare(false)} />}
      {showReport && user && <ReportModal reporterId={user.id} reportedUserId={post.user_id} targetType="post" targetId={post.id} onClose={() => setShowReport(false)} />}
    </>
  )
}
