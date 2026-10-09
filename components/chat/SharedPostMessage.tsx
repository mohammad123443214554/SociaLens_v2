'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Heart, MessageCircle, Share2, Play, X, Send } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ShareModal } from '@/components/shared/ShareModal'
import { PostCaption } from '@/components/shared/PostCaption'
import { SaveButton } from '@/components/shared/SaveButton'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/hooks/useUser'
import { getAvatarUrl, formatCount, formatTimeAgo } from '@/lib/utils/helpers'
import { PostWithProfile } from '@/lib/types/database.types'

interface SharedPostMessageProps {
  postId: string
}

export function SharedPostMessage({ postId }: SharedPostMessageProps) {
  const [post, setPost] = useState<PostWithProfile | null>(null)
  const [showViewer, setShowViewer] = useState(false)
  const [liked, setLiked] = useState(false)
  const [likesCount, setLikesCount] = useState(0)
  const [comments, setComments] = useState<any[]>([])
  const [newComment, setNewComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const { user } = useUser()
  const supabase = createClient()

  useEffect(() => {
    const fetchPost = async () => {
      const { data } = await supabase
        .from('posts').select('*, profiles(*)')
        .eq('id', postId).single()
      if (data) {
        setPost(data as PostWithProfile)
        setLikesCount(data.likes_count)
      }
    }
    fetchPost()
  }, [postId])

  useEffect(() => {
    if (!user || !postId) return
    supabase.from('likes').select('id').eq('post_id', postId).eq('user_id', user.id)
      .maybeSingle().then(({ data }) => setLiked(!!data))
  }, [postId, user?.id])

  const openViewer = async () => {
    setShowViewer(true)
    const { data } = await supabase.from('comments').select('*, profiles(*)')
      .eq('post_id', postId).order('created_at', { ascending: true })
    setComments(data || [])
  }

  const handleLike = async () => {
    if (!user || !post) return
    const newLiked = !liked
    setLiked(newLiked)
    setLikesCount(prev => newLiked ? prev + 1 : prev - 1)
    if (newLiked) {
      await supabase.from('likes').insert({ post_id: postId, user_id: user.id })
      await supabase.rpc('increment_likes', { post_id: postId })
      if (post && user.id !== post.user_id) {
        await supabase.from('notifications').insert({
          user_id: post.user_id, actor_id: user.id, type: 'like', post_id: postId,
        })
      }
    } else {
      await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', user.id)
      await supabase.rpc('decrement_likes', { post_id: postId })
    }
  }

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !newComment.trim()) return
    setSubmitting(true)
    const { data } = await supabase.from('comments')
      .insert({ post_id: postId, user_id: user.id, content: newComment.trim() })
      .select('*, profiles(*)').single()
    if (data) {
      setComments(prev => [...prev, data])
      await supabase.rpc('increment_comments', { post_id: postId })
      if (post && user.id !== post.user_id) {
        await supabase.from('notifications').insert({
          user_id: post.user_id, actor_id: user.id, type: 'comment', message: newComment.trim(), post_id: postId,
        })
      }
    }
    setNewComment('')
    setSubmitting(false)
  }

  if (!post) return (
    <div className="w-48 h-20 bg-muted/50 rounded-xl animate-pulse" />
  )

  return (
    <>
      {/* Shared post preview card - Instagram style */}
      <button onClick={openViewer}
        className="block w-56 rounded-xl overflow-hidden border bg-card hover:opacity-90 transition-opacity text-left">
        {/* Media preview */}
        {post.media_url && post.media_type === 'image' && (
          <div className="relative w-full aspect-square bg-black">
            <Image src={post.media_url} alt="" fill className="object-cover" />
          </div>
        )}
        {post.media_url && post.media_type === 'video' && (
          <div className="relative w-full aspect-video bg-black flex items-center justify-center">
            <video src={post.media_url} className="w-full h-full object-cover" preload="metadata" muted />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-black/50 rounded-full p-2">
                <Play className="h-5 w-5 text-white fill-white" />
              </div>
            </div>
          </div>
        )}
        {/* Post info */}
        <div className="p-2.5">
          <div className="flex items-center gap-2 mb-1">
            <Avatar className="h-5 w-5">
              <AvatarImage src={getAvatarUrl(post.profiles?.avatar_url)} />
              <AvatarFallback className="text-[8px]">{post.profiles?.username?.[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="text-xs font-semibold truncate">@{post.profiles?.username}</span>
          </div>
          {post.content && (
            <PostCaption content={post.content} variant="titleOnly" titleClassName="text-xs text-muted-foreground line-clamp-2" />
          )}
          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-0.5"><Heart className="h-3 w-3" />{formatCount(likesCount)}</span>
            <span className="flex items-center gap-0.5"><MessageCircle className="h-3 w-3" />{formatCount(post.comments_count)}</span>
          </div>
        </div>
      </button>

      {/* Full viewer modal */}
      {showViewer && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setShowViewer(false)}>
          <div className="flex flex-col md:flex-row w-full max-w-3xl max-h-[90vh] bg-card rounded-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}>

            {/* Media */}
            <div className="flex-1 bg-black flex items-center justify-center min-h-[250px]">
              {post.media_type === 'video' ? (
                <video src={post.media_url ?? ''} controls autoPlay
                  className="w-full max-h-[60vh] md:max-h-[90vh]" style={{ objectFit: 'contain' }} />
              ) : post.media_url ? (
                <Image src={post.media_url} alt="" width={500} height={500}
                  className="w-full object-contain max-h-[60vh] md:max-h-[90vh]" />
              ) : (
                <div className="p-6 text-white w-full">
                  {post.content && (
                    <PostCaption content={post.content} forceExpanded titleClassName="text-white text-base" captionClassName="text-white/90 text-sm" buttonClassName="text-white/70 text-xs hover:underline font-medium" />
                  )}
                </div>
              )}
            </div>

            {/* Right panel */}
            <div className="w-full md:w-80 flex flex-col bg-card max-h-[90vh]">
              {/* Header */}
              <div className="flex items-center justify-between p-3 border-b">
                <div className="flex items-center gap-2">
                  <Link href={`/profile/${post.profiles?.username}`} onClick={e => e.stopPropagation()}>
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={getAvatarUrl(post.profiles?.avatar_url)} />
                      <AvatarFallback>{post.profiles?.username?.[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                  </Link>
                  <Link href={`/profile/${post.profiles?.username}`} onClick={e => e.stopPropagation()} className="font-semibold text-sm hover:underline">@{post.profiles?.username}</Link>
                </div>
                <button onClick={() => setShowViewer(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Caption */}
              {post.content && (
                <div className="px-3 py-2 border-b">
                  <PostCaption content={post.content} forceExpanded={!post.media_url} titleClassName="text-sm" captionClassName="text-sm text-muted-foreground" />
                </div>
              )}

              {/* Comments */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[80px]">
                {comments.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No comments yet!</p>
                ) : comments.map(c => (
                  <div key={c.id} className="flex gap-2">
                    <Link href={`/profile/${c.profiles?.username}`} className="shrink-0">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={getAvatarUrl(c.profiles?.avatar_url)} />
                        <AvatarFallback className="text-[10px]">{c.profiles?.username?.[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                    </Link>
                    <div>
                      <p className="text-xs"><Link href={`/profile/${c.profiles?.username}`} className="font-semibold mr-1 hover:underline">{c.profiles?.username}</Link>{c.content}</p>
                      <p className="text-[10px] text-muted-foreground">{formatTimeAgo(c.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="border-t p-3 space-y-2">
                <div className="flex items-center gap-3">
                  <button onClick={handleLike} className="flex items-center gap-1.5">
                    <Heart className={`h-6 w-6 transition-all ${liked ? 'fill-red-500 text-red-500' : ''}`} />
                  </button>
                  <span className="text-sm font-semibold">{formatCount(likesCount)} likes</span>
                  <button onClick={() => { setShowViewer(false); setShowShare(true) }}
                    className="ml-auto text-muted-foreground hover:text-foreground">
                    <Share2 className="h-5 w-5" />
                  </button>
                  <SaveButton postId={post.id} className="text-muted-foreground hover:text-foreground transition-colors" iconClassName="h-5 w-5" />
                </div>
                {user && (
                  <form onSubmit={handleComment} className="flex gap-2">
                    <input value={newComment} onChange={e => setNewComment(e.target.value)}
                      placeholder="Add a comment..."
                      className="flex-1 bg-muted rounded-full px-3 py-1.5 text-sm outline-none border border-transparent focus:border-pink-500" />
                    <button type="submit" disabled={!newComment.trim() || submitting}
                      className="text-pink-500 disabled:opacity-40">
                      <Send className="h-5 w-5" />
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showShare && post && <ShareModal post={post} onClose={() => setShowShare(false)} />}
    </>
  )
}
