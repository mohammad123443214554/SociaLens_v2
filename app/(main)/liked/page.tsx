'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Heart, X, Play, Send, MessageCircle, Share2 } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useUser } from '@/lib/hooks/useUser'
import { createClient } from '@/lib/supabase/client'
import { PostWithProfile } from '@/lib/types/database.types'
import { PageLoader } from '@/components/shared/LoadingSpinner'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ShareModal } from '@/components/shared/ShareModal'
import { PostCaption } from '@/components/shared/PostCaption'
import { SaveButton } from '@/components/shared/SaveButton'
import { getAvatarUrl, formatTimeAgo, formatCount } from '@/lib/utils/helpers'

const LIKED_POST_SELECT = 'post_id, created_at, posts(*, profiles!posts_user_id_fkey(*))'

export default function LikedPage() {
  const { user, loading } = useUser()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [selectedPost, setSelectedPost] = useState<PostWithProfile | null>(null)
  const [sharePost, setSharePost] = useState<PostWithProfile | null>(null)
  const [liked, setLiked] = useState(false)
  const [likesCount, setLikesCount] = useState(0)
  const [comments, setComments] = useState<any[]>([])
  const [commentsLoaded, setCommentsLoaded] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const { data: likedPosts = [], isLoading } = useQuery({
    queryKey: ['liked-posts', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('likes')
        .select(LIKED_POST_SELECT)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map((d: any) => d.posts).filter(Boolean) as PostWithProfile[]
    },
    enabled: !!user,
  })

  const openPost = async (post: PostWithProfile) => {
    setSelectedPost(post)
    setLikesCount(post.likes_count)
    setLiked(true)
    setComments([])
    setCommentsLoaded(false)
    setNewComment('')
    const { data: cmts } = await supabase.from('comments').select('*, profiles(*)')
      .eq('post_id', post.id).order('created_at', { ascending: true })
    setComments(cmts || [])
    setCommentsLoaded(true)
  }

  const handleLike = async () => {
    if (!user || !selectedPost) return
    const newLiked = !liked
    setLiked(newLiked)
    setLikesCount(prev => newLiked ? prev + 1 : prev - 1)
    if (newLiked) {
      await supabase.from('likes').insert({ post_id: selectedPost.id, user_id: user.id })
      await supabase.rpc('increment_likes', { post_id: selectedPost.id })
      if (user.id !== selectedPost.user_id) {
        await supabase.from('notifications').insert({ user_id: selectedPost.user_id, actor_id: user.id, type: 'like', post_id: selectedPost.id })
      }
    } else {
      await supabase.from('likes').delete().eq('post_id', selectedPost.id).eq('user_id', user.id)
      await supabase.rpc('decrement_likes', { post_id: selectedPost.id })
    }
    queryClient.invalidateQueries({ queryKey: ['liked-posts', user?.id] })
  }

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !selectedPost || !newComment.trim()) return
    setSubmitting(true)
    const { data } = await supabase.from('comments')
      .insert({ post_id: selectedPost.id, user_id: user.id, content: newComment.trim() })
      .select('*, profiles(*)').single()
    if (data) {
      setComments(prev => [...prev, data])
      await supabase.rpc('increment_comments', { post_id: selectedPost.id })
      if (user.id !== selectedPost.user_id) {
        await supabase.from('notifications').insert({ user_id: selectedPost.user_id, actor_id: user.id, type: 'comment', message: newComment.trim(), post_id: selectedPost.id })
      }
    }
    setNewComment('')
    setSubmitting(false)
  }

  const handleShare = () => {
    if (!selectedPost) return
    setSharePost(selectedPost)
  }

  if (loading) return <PageLoader />

  const videos = likedPosts.filter(p => p.media_type === 'video')
  const images = likedPosts.filter(p => p.media_type === 'image' || p.media_type === 'none')

  return (
    <div className="max-w-xl mx-auto pb-20">
      <div className="sticky top-14 z-10 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-2 pl-9 lg:pl-0"><Heart className="h-5 w-5 text-pink-500 fill-pink-500" /><h1 className="text-xl font-bold">Liked Videos</h1></div>
        <p className="text-xs text-muted-foreground mt-0.5 pl-9 lg:pl-0">{likedPosts.length} liked posts</p>
      </div>

      {isLoading ? (
        <div className="p-4 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}</div>
      ) : likedPosts.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-24 text-muted-foreground text-center"><div className="w-20 h-20 rounded-full bg-pink-500/10 flex items-center justify-center"><Heart className="h-10 w-10 text-pink-500/50" /></div><div><p className="text-lg font-semibold">No liked posts yet</p><p className="text-sm mt-1">Posts and videos you like will appear here</p></div></div>
      ) : (
        <div className="p-4 space-y-6">
          {videos.length > 0 && (
            <div><h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Videos ({videos.length})</h2><div className="grid grid-cols-2 gap-2">
              {videos.map(post => <button key={post.id} onClick={() => openPost(post)} className="relative rounded-xl overflow-hidden bg-black aspect-[9/16] group"><video src={post.media_url ?? ''} className="w-full h-full object-cover" preload="metadata" muted /><div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" /><div className="absolute inset-0 flex items-center justify-center opacity-70 group-hover:opacity-100 transition-opacity"><div className="bg-black/40 rounded-full p-3"><Play className="h-6 w-6 text-white fill-white" /></div></div><div className="absolute bottom-2 left-2 right-2"><p className="text-white text-xs font-medium truncate">@{post.profiles?.username}</p></div><Heart className="absolute top-2 right-2 h-4 w-4 fill-red-500 text-red-500 drop-shadow" /></button>)}
            </div></div>
          )}
          {images.length > 0 && (
            <div><h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Posts ({images.length})</h2><div className="grid grid-cols-3 gap-1">
              {images.map(post => <button key={post.id} onClick={() => openPost(post)} className="relative aspect-square rounded-lg overflow-hidden bg-muted group">{post.media_url ? <Image src={post.media_url} alt="" fill className="object-cover" /> : <div className="flex items-center justify-center h-full p-2 bg-gradient-to-br from-pink-500/10 to-purple-500/10"><PostCaption content={post.content ?? ''} variant="titleOnly" titleClassName="text-xs text-center text-muted-foreground line-clamp-3" /></div>}<Heart className="absolute top-1 right-1 h-3 w-3 fill-red-500 text-red-500 drop-shadow" /></button>)}
            </div></div>
          )}
        </div>
      )}

      {selectedPost && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center" onClick={() => setSelectedPost(null)}>
          <div className="flex flex-col md:flex-row w-full max-w-3xl max-h-[90vh] bg-card rounded-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex-1 bg-black flex items-center justify-center min-h-[300px]">{selectedPost.media_type === 'video' ? <video src={selectedPost.media_url ?? ''} controls autoPlay className="w-full max-h-[60vh] md:max-h-[90vh]" style={{ objectFit: 'contain' }} /> : selectedPost.media_url ? <Image src={selectedPost.media_url} alt="" width={500} height={500} className="w-full object-contain max-h-[60vh] md:max-h-[90vh]" /> : <div className="p-6 w-full">{selectedPost.content && <PostCaption content={selectedPost.content} forceExpanded titleClassName="text-white text-base" captionClassName="text-white/90 text-sm" buttonClassName="text-white/70 text-xs hover:underline font-medium" />}</div>}</div>
            <div className="w-full md:w-80 flex flex-col bg-card">
              <div className="flex items-center justify-between p-4 border-b"><div className="flex items-center gap-3"><Link href={`/profile/${selectedPost.profiles?.username}`} onClick={() => setSelectedPost(null)}><Avatar className="h-8 w-8"><AvatarImage src={getAvatarUrl(selectedPost.profiles?.avatar_url)} /><AvatarFallback>{selectedPost.profiles?.username?.[0]?.toUpperCase()}</AvatarFallback></Avatar></Link><Link href={`/profile/${selectedPost.profiles?.username}`} onClick={() => setSelectedPost(null)} className="font-semibold text-sm hover:underline">@{selectedPost.profiles?.username}</Link></div><button onClick={() => setSelectedPost(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button></div>
              {selectedPost.content && <div className="px-4 py-3 border-b"><PostCaption content={selectedPost.content} forceExpanded={!selectedPost.media_url} titleClassName="text-sm" captionClassName="text-sm text-muted-foreground" /></div>}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[100px]">{!commentsLoaded ? <p className="text-xs text-muted-foreground">Loading...</p> : comments.length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">No comments yet!</p> : comments.map(c => <div key={c.id} className="flex gap-2"><Link href={`/profile/${c.profiles?.username}`} className="shrink-0"><Avatar className="h-6 w-6"><AvatarImage src={getAvatarUrl(c.profiles?.avatar_url)} /><AvatarFallback className="text-[10px]">{c.profiles?.username?.[0]?.toUpperCase()}</AvatarFallback></Avatar></Link><div><p className="text-xs"><Link href={`/profile/${c.profiles?.username}`} className="font-semibold mr-1 hover:underline">{c.profiles?.username}</Link>{c.content}</p><p className="text-[10px] text-muted-foreground">{formatTimeAgo(c.created_at)}</p></div></div>)}</div>
              <div className="border-t p-3 space-y-3"><div className="flex items-center gap-3"><button onClick={handleLike} className="flex items-center gap-1.5"><Heart className={`h-6 w-6 transition-all ${liked ? 'fill-red-500 text-red-500' : ''}`} /></button><span className="text-sm font-semibold">{formatCount(likesCount)} likes</span><div className="flex items-center gap-1 text-sm text-muted-foreground"><MessageCircle className="h-4 w-4" />{comments.length}</div><button onClick={handleShare} className="text-muted-foreground hover:text-foreground transition-colors"><Share2 className="h-5 w-5" /></button><SaveButton postId={selectedPost.id} className="ml-auto text-muted-foreground hover:text-foreground transition-colors" iconClassName="h-5 w-5" /></div>
                {user && <form onSubmit={handleComment} className="flex gap-2"><input value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Add a comment..." className="flex-1 bg-muted rounded-full px-3 py-1.5 text-sm outline-none border border-transparent focus:border-pink-500" /><button type="submit" disabled={!newComment.trim() || submitting} className="text-pink-500 disabled:opacity-40"><Send className="h-5 w-5" /></button></form>}
              </div>
            </div>
          </div>
        </div>
      )}

      {sharePost && <ShareModal post={sharePost} onClose={() => setSharePost(null)} />}
    </div>
  )
}
