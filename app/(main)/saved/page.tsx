'use client'

import { useState } from 'react'
import { Bookmark, X, Play, Send, MessageCircle, Share2, Heart, Folder, FolderPlus, ChevronLeft, Trash2 } from 'lucide-react'
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
import {
  useSavedFolders,
  useSavedPostsInFolder,
  useCreateFolder,
  useDeleteFolder,
  MAX_SAVED_FOLDERS,
} from '@/lib/hooks/useSavedPosts'

export default function SavedPostsPage() {
  const { user, loading } = useUser()
  const supabase = createClient()

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [showCreateFolder, setShowCreateFolder] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [folderError, setFolderError] = useState('')

  const [selectedPost, setSelectedPost] = useState<PostWithProfile | null>(null)
  const [sharePost, setSharePost] = useState<PostWithProfile | null>(null)
  const [liked, setLiked] = useState(false)
  const [likesCount, setLikesCount] = useState(0)
  const [comments, setComments] = useState<any[]>([])
  const [commentsLoaded, setCommentsLoaded] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const { data: folders = [], isLoading: foldersLoading } = useSavedFolders(user?.id)
  const { data: savedRows = [], isLoading: postsLoading } = useSavedPostsInFolder(selectedFolderId ?? undefined)
  const createFolder = useCreateFolder()
  const deleteFolder = useDeleteFolder()

  const selectedFolder = folders.find(f => f.id === selectedFolderId)
  const savedPosts: PostWithProfile[] = savedRows.map((r: any) => r.posts).filter(Boolean)

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !folderName.trim()) return
    setFolderError('')
    try {
      await createFolder.mutateAsync({ userId: user.id, name: folderName.trim() })
      setShowCreateFolder(false)
      setFolderName('')
    } catch (err: any) {
      setFolderError(err.message || 'Something went wrong')
    }
  }

  const handleDeleteFolder = async (folderId: string) => {
    if (!user) return
    if (!confirm('Delete this folder? Posts saved inside it will be un-saved (the posts themselves are not deleted).')) return
    await deleteFolder.mutateAsync({ userId: user.id, folderId })
    if (selectedFolderId === folderId) setSelectedFolderId(null)
  }

  const openPost = async (post: PostWithProfile) => {
    if (!user) return
    setSelectedPost(post)
    setLikesCount(post.likes_count)
    setComments([])
    setCommentsLoaded(false)
    setNewComment('')
    const { data: likeRow } = await supabase.from('likes').select('id').eq('post_id', post.id).eq('user_id', user.id).maybeSingle()
    setLiked(!!likeRow)
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
        await supabase.from('notifications').insert({
          user_id: selectedPost.user_id, actor_id: user.id, type: 'like', post_id: selectedPost.id,
        })
      }
    } else {
      await supabase.from('likes').delete().eq('post_id', selectedPost.id).eq('user_id', user.id)
      await supabase.rpc('decrement_likes', { post_id: selectedPost.id })
    }
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
        await supabase.from('notifications').insert({
          user_id: selectedPost.user_id, actor_id: user.id, type: 'comment', message: newComment.trim(), post_id: selectedPost.id,
        })
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

  return (
    <div className="max-w-xl mx-auto pb-20">
      <div className="sticky top-14 z-10 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-2 pl-9 lg:pl-0">
          {selectedFolderId ? (
            <button onClick={() => setSelectedFolderId(null)} className="text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-5 w-5" />
            </button>
          ) : (
            <Bookmark className="h-5 w-5 text-pink-500 fill-pink-500" />
          )}
          <h1 className="text-xl font-bold">{selectedFolder ? selectedFolder.name : 'Saved Posts'}</h1>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 pl-9 lg:pl-0">
          {selectedFolderId ? `${savedPosts.length} saved posts` : `${folders.length}/${MAX_SAVED_FOLDERS} folders`}
        </p>
      </div>

      {!selectedFolderId ? (
        // ---------- Folder list view ----------
        <div className="p-4">
          <button
            onClick={() => setShowCreateFolder(true)}
            disabled={folders.length >= MAX_SAVED_FOLDERS}
            className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-dashed border-pink-500/30 hover:border-pink-500 hover:bg-pink-500/5 transition-colors text-pink-500 disabled:opacity-40 disabled:hover:border-pink-500/30 disabled:hover:bg-transparent mb-4"
          >
            <FolderPlus className="h-5 w-5" />
            <span className="text-sm font-semibold">
              {folders.length >= MAX_SAVED_FOLDERS ? `Folder limit reached (${MAX_SAVED_FOLDERS}/${MAX_SAVED_FOLDERS})` : 'Create Folder'}
            </span>
          </button>

          {foldersLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
            </div>
          ) : folders.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-20 text-muted-foreground text-center">
              <div className="w-20 h-20 rounded-full bg-pink-500/10 flex items-center justify-center">
                <Bookmark className="h-10 w-10 text-pink-500/50" />
              </div>
              <div>
                <p className="text-lg font-semibold">No folders yet</p>
                <p className="text-sm mt-1">Create a folder to start saving posts</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {folders.map(folder => (
                <div
                  key={folder.id}
                  onClick={() => setSelectedFolderId(folder.id)}
                  className="relative p-4 rounded-xl border hover:border-pink-500/40 hover:bg-accent/50 transition-colors cursor-pointer group"
                >
                  <Folder className="h-6 w-6 text-pink-500 mb-2" />
                  <p className="text-sm font-semibold truncate pr-5">{folder.name}</p>
                  <button
                    onClick={e => { e.stopPropagation(); handleDeleteFolder(folder.id) }}
                    className="absolute top-3 right-3 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        // ---------- Posts inside a folder ----------
        <div className="p-4">
          {postsLoading ? (
            <div className="grid grid-cols-3 gap-1">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="aspect-square w-full rounded-lg" />)}
            </div>
          ) : savedPosts.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-20 text-muted-foreground text-center">
              <div className="w-20 h-20 rounded-full bg-pink-500/10 flex items-center justify-center">
                <Bookmark className="h-10 w-10 text-pink-500/50" />
              </div>
              <div>
                <p className="text-lg font-semibold">This folder is empty</p>
                <p className="text-sm mt-1">Posts you save into it will show up here</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1">
              {savedPosts.map(post => (
                <button key={post.id} onClick={() => openPost(post)}
                  className="relative aspect-square rounded-lg overflow-hidden bg-muted group">
                  {post.media_type === 'video' && post.media_url ? (
                    <video src={post.media_url} className="w-full h-full object-cover" preload="metadata" muted />
                  ) : post.media_url ? (
                    <Image src={post.media_url} alt="" fill className="object-cover" />
                  ) : (
                    <div className="flex items-center justify-center h-full p-2 bg-gradient-to-br from-pink-500/10 to-purple-500/10">
                      <PostCaption content={post.content ?? ''} variant="titleOnly" titleClassName="text-xs text-center text-muted-foreground line-clamp-3" />
                    </div>
                  )}
                  {post.media_type === 'video' && (
                    <div className="absolute top-1.5 right-1.5"><Play className="h-3.5 w-3.5 text-white fill-white drop-shadow" /></div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Folder Modal */}
      {showCreateFolder && (
        <div
          className="fixed inset-0 bg-black/60 z-[100] flex items-end sm:items-center justify-center p-4"
          onClick={() => { setShowCreateFolder(false); setFolderName(''); setFolderError('') }}
        >
          <form
            onSubmit={handleCreateFolder}
            className="bg-card rounded-2xl w-full max-w-sm p-5"
            onClick={e => e.stopPropagation()}
          >
            <p className="font-semibold mb-1">Create a folder</p>
            <p className="text-xs text-muted-foreground mb-3">Organize your saved posts into folders.</p>
            <input
              autoFocus
              value={folderName}
              onChange={e => setFolderName(e.target.value)}
              placeholder="Folder name"
              maxLength={40}
              className="w-full bg-muted rounded-xl px-3 py-2 text-sm outline-none border border-transparent focus:border-pink-500"
            />
            {folderError && <p className="text-xs text-red-500 mt-2">{folderError}</p>}
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => { setShowCreateFolder(false); setFolderName(''); setFolderError('') }}
                className="flex-1 py-2 rounded-xl border text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!folderName.trim() || createFolder.isPending}
                className="flex-1 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white text-sm font-medium disabled:opacity-50"
              >
                {createFolder.isPending ? 'Creating...' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Post Viewer Modal */}
      {selectedPost && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center"
          onClick={() => setSelectedPost(null)}>
          <div className="flex flex-col md:flex-row w-full max-w-3xl max-h-[90vh] bg-card rounded-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="flex-1 bg-black flex items-center justify-center min-h-[300px]">
              {selectedPost.media_type === 'video' ? (
                <video src={selectedPost.media_url ?? ''} controls autoPlay
                  className="w-full max-h-[60vh] md:max-h-[90vh]" style={{ objectFit: 'contain' }} />
              ) : selectedPost.media_url ? (
                <Image src={selectedPost.media_url} alt="" width={500} height={500}
                  className="w-full object-contain max-h-[60vh] md:max-h-[90vh]" />
              ) : (
                <div className="p-6 w-full">
                  {selectedPost.content && (
                    <PostCaption content={selectedPost.content} forceExpanded titleClassName="text-white text-base" captionClassName="text-white/90 text-sm" buttonClassName="text-white/70 text-xs hover:underline font-medium" />
                  )}
                </div>
              )}
            </div>
            <div className="w-full md:w-80 flex flex-col bg-card">
              <div className="flex items-center justify-between p-4 border-b">
                <div className="flex items-center gap-3">
                  <Link href={`/profile/${selectedPost.profiles?.username}`} onClick={() => setSelectedPost(null)}>
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={getAvatarUrl(selectedPost.profiles?.avatar_url)} />
                      <AvatarFallback>{selectedPost.profiles?.username?.[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                  </Link>
                  <Link href={`/profile/${selectedPost.profiles?.username}`} onClick={() => setSelectedPost(null)}
                    className="font-semibold text-sm hover:underline">@{selectedPost.profiles?.username}</Link>
                </div>
                <button onClick={() => setSelectedPost(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              {selectedPost.content && (
                <div className="px-4 py-3 border-b">
                  <PostCaption content={selectedPost.content} forceExpanded={!selectedPost.media_url} titleClassName="text-sm" captionClassName="text-sm text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[100px]">
                {!commentsLoaded ? (
                  <p className="text-xs text-muted-foreground">Loading...</p>
                ) : comments.length === 0 ? (
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
              <div className="border-t p-3 space-y-3">
                <div className="flex items-center gap-3">
                  <button onClick={handleLike} className="flex items-center gap-1.5">
                    <Heart className={`h-6 w-6 transition-all ${liked ? 'fill-red-500 text-red-500' : ''}`} />
                  </button>
                  <span className="text-sm font-semibold">{formatCount(likesCount)} likes</span>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MessageCircle className="h-4 w-4" />{comments.length}
                  </div>
                  <button onClick={handleShare} className="text-muted-foreground hover:text-foreground transition-colors">
                    <Share2 className="h-5 w-5" />
                  </button>
                  <SaveButton postId={selectedPost.id} className="text-pink-500 hover:text-pink-600 transition-colors" iconClassName="h-5 w-5" />
                </div>
                {user && (
                  <form onSubmit={handleComment} className="flex gap-2">
                    <input value={newComment} onChange={e => setNewComment(e.target.value)}
                      placeholder="Add a comment..."
                      className="flex-1 bg-muted rounded-full px-3 py-1.5 text-sm outline-none border border-transparent focus:border-pink-500" />
                    <button type="submit" disabled={!newComment.trim() || submitting} className="text-pink-500 disabled:opacity-40">
                      <Send className="h-5 w-5" />
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {sharePost && (
        <ShareModal post={sharePost} onClose={() => setSharePost(null)} />
      )}
    </div>
  )
}
