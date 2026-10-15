'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Copy, Flag, Heart, MessageCircle, MoreHorizontal, Repeat2, Share2, EyeOff, Check } from 'lucide-react'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
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
  const [copied, setCopied] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const { user, profile } = useUser()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { data: isReposted = false } = useIsReposted(post.id, user?.id, post.is_reposted)
  const toggleRepost = useToggleRepost()
  const isOwner = user?.id === post.user_id

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

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/share/post/${post.id}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setShowShare(true)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent className="flex max-h-[88dvh] w-[calc(100%-1rem)] max-w-3xl flex-col gap-0 overflow-hidden rounded-2xl border-border/80 bg-background p-0 shadow-2xl sm:max-h-[88vh] sm:w-[calc(100%-2rem)] sm:rounded-3xl">
          <div className="grid min-h-0 flex-1 overflow-y-auto sm:grid-cols-[minmax(0,1.2fr)_minmax(240px,0.8fr)] sm:overflow-hidden">
            <div className="relative flex max-h-[38dvh] min-h-[180px] items-center justify-center bg-black sm:max-h-[78vh] sm:min-h-0">
              <video ref={videoRef} src={post.media_url ?? undefined} controls playsInline autoPlay preload="auto" className="max-h-[38dvh] w-full object-contain sm:max-h-[78vh]" aria-label={`Reel by @${post.profiles?.username ?? 'user'}`} />
            </div>
            <div className="flex min-h-0 flex-col sm:max-h-[78vh]">
              <div className="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-2.5 sm:px-4 sm:py-3">
                <Link href={`/profile/${post.profiles?.username ?? ''}`} onClick={() => setOpen(false)} className="min-w-0 truncate text-sm font-semibold hover:text-pink-400">@{post.profiles?.username ?? 'user'}</Link>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><button type="button" aria-label="More reel options" className="mr-8 flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"><MoreHorizontal className="h-5 w-5" /></button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="z-[70]">
                    {!isOwner && <DropdownMenuItem onSelect={() => { setOpen(false); onNotInterested?.(post.id) }}><EyeOff className="mr-2 h-4 w-4" />Not interested</DropdownMenuItem>}
                    {!isOwner && user && <DropdownMenuItem onSelect={() => { setShowReport(true) }}><Flag className="mr-2 h-4 w-4" />Report</DropdownMenuItem>}
                    <DropdownMenuItem onSelect={copyLink}>{copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}{copied ? 'Link copied' : 'Copy link'}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
                {post.content?.trim() && <PostCaption content={post.content} expandMode="inline" titleClassName="text-sm leading-relaxed" captionClassName="mt-1 text-sm leading-6 text-muted-foreground" buttonClassName="mt-1 text-xs font-semibold text-pink-400 hover:underline" />}
                {showComments && <div className="mt-4 border-t border-border/70 pt-3"><p className="mb-2 text-xs font-semibold text-muted-foreground">Comments</p><CommentThread target="post" targetId={post.id} currentUserId={user?.id} ownerId={post.user_id} commentRestrictedUntil={profile?.restrict_comment_until} variant="compact" listClassName="max-h-44 mb-2" /></div>}
              </div>
              <div className="border-t border-border/70 px-2.5 py-2.5 sm:px-3">
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-1">
                    <button type="button" onClick={handleLike} aria-label="Like reel" className="flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-1 text-foreground transition-colors hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-muted-foreground"><span className="flex h-8 w-8 items-center justify-center"><Heart className={`h-[19px] w-[19px] ${liked ? 'fill-red-500 text-red-500' : ''}`} /></span><span className="text-[10px] leading-none text-muted-foreground">{formatCount(likesCount)}</span></button>
                    <button type="button" onClick={() => setShowComments(v => !v)} aria-label="Comments" className="flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-1 text-foreground transition-colors hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-muted-foreground"><span className={`flex h-8 w-8 items-center justify-center ${showComments ? 'ring-1 ring-pink-500' : ''}`}><MessageCircle className="h-[19px] w-[19px]" /></span><span className="text-[10px] leading-none text-muted-foreground">{formatCount(post.comments_count)}</span></button>
                    <button type="button" onClick={() => setShowShare(true)} aria-label="Share reel" className="flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-1 text-foreground transition-colors hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-muted-foreground"><span className="flex h-8 w-8 items-center justify-center"><Share2 className="h-[19px] w-[19px]" /></span><span className="text-[10px] leading-none text-muted-foreground">Share</span></button>
                    <button type="button" onClick={handleRepost} disabled={!user || toggleRepost.isPending} aria-label="Repost" className="flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-1 text-foreground transition-colors hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-muted-foreground"><span className={`flex h-8 w-8 items-center justify-center ${isReposted ? 'text-emerald-400' : ''}`}><Repeat2 className="h-[19px] w-[19px]" /></span><span className="text-[10px] leading-none text-muted-foreground">Repost</span></button>
                  </div>
                  <SaveButton postId={post.id} className="flex h-8 w-8 shrink-0 items-center justify-center text-foreground transition-colors hover:text-foreground/80" iconClassName="h-[19px] w-[19px]" />
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {showShare && <ShareModal post={post} onClose={() => setShowShare(false)} />}
      {showReport && user && <ReportModal reporterId={user.id} reportedUserId={post.user_id} targetType="post" targetId={post.id} onClose={() => setShowReport(false)} />}
    </>
  )
}
