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
  const [optionsPosition, setOptionsPosition] = useState({ top: 0, right: 0 })
  const [portalReady, setPortalReady] = useState(false)
  const optionsButtonRef = useRef<HTMLButtonElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const dialogScrollRef = useRef<HTMLDivElement>(null)
  const { user, profile } = useUser()
  const supabase = createClient()
  const queryClient = useQueryClient()
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
      if (!error) await supabase.rpc('increment_likes', { post_id: post.id })
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

  const handleRepost = () => {
    if (!user) return
    toggleRepost.mutate({ postId: post.id, userId: user.id, postOwnerId: post.user_id, repost: !isReposted })
  }


  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent className="flex max-h-[94dvh] w-[calc(100%-1rem)] max-w-xl flex-col gap-0 overflow-hidden rounded-2xl border-border/80 bg-background p-0 shadow-2xl sm:max-h-[92vh] sm:w-[calc(100%-2rem)] sm:rounded-2xl">
          <div ref={dialogScrollRef} className="flex min-h-0 flex-col overflow-y-auto">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
              <Link href={`/profile/${post.profiles?.username ?? ''}`} onClick={() => setOpen(false)} className="min-w-0 truncate text-sm font-semibold hover:text-pink-400">@{post.profiles?.username ?? 'user'}</Link>
              <div className="mr-8 shrink-0">
                <button ref={optionsButtonRef} type="button" aria-label="More post options" aria-expanded={showOptions} onClick={() => setShowOptions(value => !value)} className="flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"><MoreHorizontal className="h-5 w-5" /></button>
              </div>
            </div>
            <div className={`flex w-full items-center justify-center ${post.media_type === 'video' ? 'bg-black' : 'bg-background'}`}>
              {post.media_type === 'video' ? (
                <video ref={videoRef} src={post.media_url ?? undefined} controls playsInline autoPlay preload="auto" className="max-h-[58dvh] w-full object-contain sm:max-h-[62vh]" aria-label={`Video post by @${post.profiles?.username ?? 'user'}`} />
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
                  <button type="button" onClick={handleLike} aria-label={`Like ${mediaLabel}`} className="flex flex-col items-center justify-center gap-1 text-foreground transition-colors hover:text-foreground/80"><span className="flex h-8 w-8 items-center justify-center"><Heart className={`h-[19px] w-[19px] ${liked ? 'fill-red-500 text-red-500' : ''}`} /></span><span className="whitespace-nowrap text-[10px] leading-none text-muted-foreground">{formatCount(likesCount)} {likesCount === 1 ? 'like' : 'likes'}</span></button>
                  <button type="button" onClick={() => setShowComments(true)} aria-label="Comments" className="flex flex-col items-center justify-center gap-1 text-foreground transition-colors hover:text-foreground/80"><span className={`flex h-8 w-8 items-center justify-center ${showComments ? 'text-pink-500' : ''}`}><MessageCircle className="h-[19px] w-[19px]" /></span><span className="text-[10px] leading-none text-muted-foreground">Comment</span></button>
                  <button type="button" onClick={() => setShowShare(true)} aria-label={`Share ${mediaLabel}`} className="flex flex-col items-center justify-center gap-1 text-foreground transition-colors hover:text-foreground/80"><span className="flex h-8 w-8 items-center justify-center"><Share2 className="h-[19px] w-[19px]" /></span><span className="text-[10px] leading-none text-muted-foreground">Share</span></button>
                  <button type="button" onClick={handleRepost} disabled={!user || toggleRepost.isPending} aria-label="Repost" className="flex flex-col items-center justify-center gap-1 text-foreground transition-colors hover:text-foreground/80"><span className={`flex h-8 w-8 items-center justify-center ${isReposted ? 'text-emerald-400' : ''}`}><Repeat2 className="h-[19px] w-[19px]" /></span><span className="text-[10px] leading-none text-muted-foreground">Repost</span></button>
                </div>
                <SaveButton postId={post.id} className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center text-foreground transition-colors hover:text-foreground/80" iconClassName="h-[19px] w-[19px]" />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {portalReady && showOptions && createPortal(
        <div id={`post-options-${post.id}`} role="menu" aria-label="Post options" style={{ position: 'fixed', top: optionsPosition.top, right: optionsPosition.right }} className="z-[9999] min-w-[180px] overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl">
          <button type="button" role="menuitem" onClick={() => { setShowOptions(false); setOpen(false); onNotInterested?.(post.id) }} className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm hover:bg-accent"><EyeOff className="mr-2 h-4 w-4" />Not interested</button>
          <button type="button" role="menuitem" onClick={() => { setShowOptions(false); if (user) setShowReport(true) }} className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm hover:bg-accent"><Flag className="mr-2 h-4 w-4" />Report</button>
        </div>,
        document.body
      )}
      {showShare && <ShareModal post={post} onClose={() => setShowShare(false)} />}
      {showReport && user && <ReportModal reporterId={user.id} reportedUserId={post.user_id} targetType="post" targetId={post.id} onClose={() => setShowReport(false)} />}
    </>
  )
}
