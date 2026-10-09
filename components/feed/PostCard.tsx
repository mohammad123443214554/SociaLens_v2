'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Heart, MessageCircle, Share2, MoreHorizontal, Trash2, Repeat2, Flag } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ShareModal } from '@/components/shared/ShareModal'
import { PostCaption } from '@/components/shared/PostCaption'
import { SaveButton } from '@/components/shared/SaveButton'
import { RepostBadge } from '@/components/shared/RepostBadge'
import { VerifiedBadge } from '@/components/shared/VerifiedBadge'
import { CommentThread } from '@/components/shared/CommentThread'
import { ReportModal } from '@/components/shared/ReportModal'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { PostWithProfile } from '@/lib/types/database.types'
import { formatTimeAgo, formatCount, getAvatarUrl } from '@/lib/utils/helpers'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/hooks/useUser'
import { useQueryClient } from '@tanstack/react-query'
import { useIsReposted, useToggleRepost } from '@/lib/hooks/useRepost'
import { BLANK_VIDEO_POSTER, getMediaProxyUrl } from '@/lib/utils/media'

interface PostCardProps {
  post: PostWithProfile
  onDelete?: (postId: string) => void
}

export function PostCard({ post, onDelete }: PostCardProps) {
  const { user, profile } = useUser()
  const [liked, setLiked] = useState(false)
  const [likesCount, setLikesCount] = useState(post.likes_count)
  const [showComments, setShowComments] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const supabase = createClient()
  const queryClient = useQueryClient()
  const articleRef = useRef<HTMLElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const hasCountedViewRef = useRef(false)
  const firstFrameShownRef = useRef(false)
  const [videoNearViewport, setVideoNearViewport] = useState(false)
  const [usingMediaProxy, setUsingMediaProxy] = useState(false)

  const { data: isReposted = false } = useIsReposted(post.id, user?.id, post.is_reposted)
  const toggleRepost = useToggleRepost()

  useEffect(() => {
    if (!user) return
    if (post.is_liked !== undefined) { setLiked(post.is_liked); return }
    supabase.from('likes').select('id').eq('post_id', post.id).eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setLiked(!!data))
  }, [post.id, user?.id])

  // Counts a view the first time this post actually scrolls into view -
  // Not just when the component mounts (it might be far down an
  // Unopened feed) and never more than once per mount, so scrolling past
  // It back and forth doesn't inflate the count.
  useEffect(() => {
    const el = articleRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !hasCountedViewRef.current) {
          hasCountedViewRef.current = true
          supabase.rpc('increment_post_views', { post_id: post.id }).then(() => {})
          observer.disconnect()
        }
      },
      { threshold: 0.5 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [post.id])

  // Pauses this post's video the moment it scrolls mostly out of view -
  // otherwise a video someone started playing keeps running (and making
  // sound) even after they've scrolled well past it in the feed.
  useEffect(() => {
    const videoEl = videoRef.current
    if (!videoEl) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) {
          videoEl.pause()
        }
      },
      { threshold: 0.25 }
    )
    observer.observe(videoEl)
    return () => observer.disconnect()
  }, [post.media_url])

  // Android WebView only hands out a small number of video decoders at a
  // time. A feed scrolled a few pages deep holds 20-30 <video> elements, and
  // every one past that limit silently never presents a frame - it reports
  // itself as playing while showing nothing, which is exactly what feed
  // videos did in the APK. So a post's video only holds a real `src` while
  // it is anywhere near the screen, and hands the decoder back when it is
  // not. 600px of margin means it is always ready before it is visible.
  useEffect(() => {
    const el = articleRef.current
    if (!el || post.media_type !== 'video') return
    const observer = new IntersectionObserver(
      (entries) => setVideoNearViewport(!!entries[0]?.isIntersecting),
      { rootMargin: '600px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [post.id, post.media_type])

  useEffect(() => {
    setUsingMediaProxy(false)
  }, [post.id, post.media_url])

  useEffect(() => {
    const videoEl = videoRef.current
    const directSrc = post.media_url
    const src = directSrc && usingMediaProxy ? getMediaProxyUrl(directSrc) : directSrc
    if (!videoEl || !src || post.media_type !== 'video') return

    if (videoNearViewport) {
      if (videoEl.getAttribute('src') !== src) {
        videoEl.setAttribute('src', src)
        firstFrameShownRef.current = false
        videoEl.load()
      }
    } else if (videoEl.getAttribute('src')) {
      try { videoEl.pause() } catch {}
      videoEl.removeAttribute('src')
      videoEl.load() // releases the decoder and any in-flight range requests
    }
  }, [videoNearViewport, post.media_url, post.media_type, usingMediaProxy])

  // preload="metadata" fetches the duration but never decodes a frame, so in
  // Android WebView the element stayed empty (and got WebView's own grey
  // placeholder painted over it). Nudging currentTime forces exactly one
  // frame to be decoded and presented - that frame becomes the thumbnail,
  // with no stored poster image needed anywhere.
  const handleVideoError = () => {
    if (!usingMediaProxy && post.media_url) setUsingMediaProxy(true)
  }

  const handleVideoMetadata = () => {
    const videoEl = videoRef.current
    if (!videoEl || firstFrameShownRef.current) return
    if (!videoEl.paused || videoEl.currentTime > 0) return
    firstFrameShownRef.current = true
    try { videoEl.currentTime = 0.05 } catch {}
  }

  const toggleComments = () => {
    setShowComments((v) => !v)
  }

  const handleLike = async () => {
    if (!user) return
    const newLiked = !liked
    setLiked(newLiked)
    setLikesCount(prev => newLiked ? prev + 1 : prev - 1)
    if (newLiked) {
      await supabase.from('likes').insert({ post_id: post.id, user_id: user.id })
      await supabase.rpc('increment_likes', { post_id: post.id })
      if (user.id !== post.user_id) {
        await supabase.from('notifications').insert({
          user_id: post.user_id, actor_id: user.id, type: 'like', post_id: post.id,
        })
      }
    } else {
      await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', user.id)
      await supabase.rpc('decrement_likes', { post_id: post.id })
    }
    queryClient.invalidateQueries({ queryKey: ['feed-posts'] })
    queryClient.invalidateQueries({ queryKey: ['explore-posts'] })
  }

  const handleRepost = () => {
    if (!user) return
    toggleRepost.mutate({ postId: post.id, userId: user.id, postOwnerId: post.user_id, repost: !isReposted })
  }

  const isOwner = user?.id === post.user_id

  return (
    <article ref={articleRef} className="border-b bg-card">
      <RepostBadge reposters={post.reposted_by ?? []} variant="inline" />

      <div className="flex items-center justify-between px-4 py-3">
        <Link href={`/profile/${post.profiles.username}`} className="flex items-center gap-2.5">
          <Avatar className="h-9 w-9">
            <AvatarImage src={getAvatarUrl(post.profiles.avatar_url)} />
            <AvatarFallback>{post.profiles.username?.[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold text-sm leading-none flex items-center gap-1">
              {post.profiles.username}
              {post.profiles.is_verified && <VerifiedBadge type={post.profiles.verification_type} className="text-xs" />}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{formatTimeAgo(post.created_at)}</p>
          </div>
        </Link>
        {(isOwner || user) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isOwner ? (
                <DropdownMenuItem className="text-destructive" onClick={() => setShowDeleteConfirm(true)}>
                  <Trash2 className="h-4 w-4 mr-2" /> Delete Post
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => setShowReport(true)}>
                  <Flag className="h-4 w-4 mr-2" /> Report
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {post.media_url && post.media_type === 'image' && (
        <div className="relative w-full bg-muted" style={{ maxHeight: '480px', aspectRatio: '4/3' }}>
          <Image src={post.media_url} alt="Post" fill className="object-contain" sizes="(max-width: 640px) 100vw, 600px" />
        </div>
      )}
      {post.media_url && post.media_type === 'video' && (
        <div className="w-full bg-black" style={{ maxHeight: '480px' }}>
          {/* `src` is attached/detached by the effect above, never here -
              see the decoder-limit note. `poster` is set so WebView never
              falls back to its own grey placeholder artwork, and
              `playsInline` keeps playback inside the feed instead of
              hijacking the whole screen. Controls/fullscreen unchanged. */}
          <video
            ref={videoRef}
            controls
            playsInline
            preload="metadata"
            poster={BLANK_VIDEO_POSTER}
            onLoadedMetadata={handleVideoMetadata}
            onError={handleVideoError}
            className="w-full"
            style={{ maxHeight: '480px', objectFit: 'contain' }}
          />
        </div>
      )}

      {post.content && (
        <div className="px-4 pt-2 pb-1">
          <PostCaption
            content={post.content}
            forceExpanded={!post.media_url}
            prefix={<span className="font-semibold mr-1">{post.profiles.username} </span>}
          />
        </div>
      )}

      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={handleLike}>
            <Heart className={`h-5 w-5 transition-all ${liked ? 'fill-red-500 text-red-500 scale-110' : ''}`} />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={toggleComments}>
            <MessageCircle className={`h-5 w-5 ${showComments ? 'fill-foreground' : ''}`} />
          </Button>
          <div className="flex items-center">
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setShowShare(true)}>
              <Share2 className="h-5 w-5" />
            </Button>
            {post.shares_count > 0 && <span className="text-xs text-muted-foreground -ml-1 mr-1">{formatCount(post.shares_count)}</span>}
          </div>
          <div className="flex items-center">
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={handleRepost} disabled={toggleRepost.isPending}>
              <Repeat2 className={`h-5 w-5 ${isReposted ? 'text-green-500 animate-repost-spin' : ''}`} />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <SaveButton postId={post.id} className="h-9 w-9 flex items-center justify-center rounded-md hover:bg-accent transition-colors" />
        </div>
      </div>

      {likesCount > 0 && <p className="px-4 text-sm font-semibold pb-1">{formatCount(likesCount)} likes</p>}

      {showComments && (
        <div className="border-t px-4 pt-3 pb-3">
          <CommentThread
            target="post"
            targetId={post.id}
            currentUserId={user?.id}
            ownerId={post.user_id}
            commentRestrictedUntil={profile?.restrict_comment_until}
            listClassName="max-h-48 mb-3"
          />
        </div>
      )}

      {showShare && <ShareModal post={post} onClose={() => setShowShare(false)} />}
      {showReport && user && (
        <ReportModal
          reporterId={user.id}
          reportedUserId={post.user_id}
          targetType="post"
          targetId={post.id}
          onClose={() => setShowReport(false)}
        />
      )}
      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete this post?"
          description="This can't be undone. Your post will be permanently removed."
          confirmLabel="Delete"
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={() => {
            setShowDeleteConfirm(false)
            onDelete?.(post.id)
          }}
        />
      )}
    </article>
  )
}
