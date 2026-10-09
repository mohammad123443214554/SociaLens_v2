'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { Film, Grid3x3, Lock, Play, Repeat2 } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/hooks/useUser'
import { PostCard } from '@/components/feed/PostCard'
import { PostWithProfile } from '@/lib/types/database.types'
import { PostCaption } from '@/components/shared/PostCaption'
import { InfiniteScrollSentinel } from '@/components/shared/InfiniteScrollSentinel'

interface ProfileTabsFixedProps {
  profileId: string
  isPrivate: boolean
  isFollowing: boolean
  isOwn: boolean
}

const PAGE_SIZE = 24
const POST_SELECT = '*, profiles!posts_user_id_fkey(*)'

export function ProfileTabsFixed({ profileId, isPrivate, isFollowing, isOwn }: ProfileTabsFixedProps) {
  const supabase = createClient()
  const { user } = useUser()
  const queryClient = useQueryClient()
  const canView = !isPrivate || isFollowing || isOwn
  const [selectedPost, setSelectedPost] = useState<PostWithProfile | null>(null)

  const query = useInfiniteQuery({
    queryKey: ['profile-posts-fixed', profileId],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      let postsQuery = supabase
        .from('posts')
        .select(POST_SELECT)
        .eq('user_id', profileId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)
      if (pageParam) postsQuery = postsQuery.lt('created_at', pageParam)

      const [{ data: ownPosts, error: ownError }, { data: reposts, error: repostError }] = await Promise.all([
        postsQuery,
        supabase
          .from('reposts')
          .select('created_at, profiles!reposts_user_id_fkey(id,username,avatar_url,is_verified,verification_type), posts!reposts_post_id_fkey(*, profiles!posts_user_id_fkey(*))')
          .eq('user_id', profileId)
          .order('created_at', { ascending: false })
          .limit(PAGE_SIZE),
      ])

      // Own posts are the primary content here - a real problem fetching
      // those should surface as an error. The reposts side-query is
      // supplementary (it only adds the "reposted" badge posts to the
      // grid), so a hiccup there should never hide the person's actual
      // own posts/reels - it just quietly contributes nothing this time.
      if (ownError) throw ownError
      if (repostError) console.error('profile reposts fetch failed, showing own posts only', repostError)

      const repostedPosts: PostWithProfile[] = (reposts ?? [])
        .filter((r: any) => r.posts)
        .map((r: any) => ({
          ...(r.posts as PostWithProfile),
          created_at: r.created_at,
          reposted_by: r.profiles ? [r.profiles] : [],
        }))

      const merged = [...(ownPosts ?? []), ...repostedPosts]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, PAGE_SIZE) as PostWithProfile[]

      const gotFullPage = (ownPosts?.length ?? 0) === PAGE_SIZE || repostedPosts.length === PAGE_SIZE
      const nextCursor = gotFullPage && merged.length > 0 ? merged[merged.length - 1].created_at : null

      return { posts: merged, nextCursor }
    },
    getNextPageParam: lastPage => lastPage.nextCursor,
    enabled: canView,
    staleTime: 30000,
  })

  const posts = query.data?.pages.flatMap(page => page.posts) ?? []
  const imagePosts = useMemo(() => posts.filter(p => p.media_type === 'image' || !p.media_url), [posts])
  const videoPosts = useMemo(() => posts.filter(p => p.media_type === 'video'), [posts])

  const deletePost = async (postId: string) => {
    if (!user) return
    const { error } = await supabase.from('posts').delete().eq('id', postId).eq('user_id', user.id)
    if (!error) {
      setSelectedPost(null)
      queryClient.invalidateQueries({ queryKey: ['profile-posts-fixed', profileId] })
      queryClient.invalidateQueries({ queryKey: ['feed-posts'] })
      queryClient.invalidateQueries({ queryKey: ['explore-posts'] })
    }
  }

  if (!canView) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
        <Lock className="h-12 w-12" />
        <p className="font-semibold">This account is private</p>
        <p className="text-sm">Follow to see their posts</p>
      </div>
    )
  }

  return (
    <>
      <Tabs defaultValue="posts" className="w-full">
        <TabsList className="w-full rounded-none border-b bg-transparent h-auto">
          <TabsTrigger value="posts" className="flex-1 gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-foreground">
            <Grid3x3 className="h-4 w-4" /> Posts
          </TabsTrigger>
          <TabsTrigger value="reels" className="flex-1 gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-foreground">
            <Film className="h-4 w-4" /> Reels
          </TabsTrigger>
        </TabsList>

        <TabsContent value="posts">
          {query.isLoading ? (
            <div className="grid grid-cols-3 gap-0.5 p-0.5">
              {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="aspect-square" />)}
            </div>
          ) : query.isError ? (
            <div className="py-14 text-center text-sm text-destructive px-4">Posts could not be loaded. Please refresh the page.</div>
          ) : imagePosts.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-muted-foreground"><Grid3x3 className="h-12 w-12 mb-2" /><p>No posts yet</p></div>
          ) : (
            <div className="grid grid-cols-3 gap-0.5 p-0.5">
              {imagePosts.map(post => (
                <button key={post.id} onClick={() => setSelectedPost(post)} className="relative aspect-square bg-muted overflow-hidden group">
                  {post.reposted_by && post.reposted_by.length > 0 && <div className="absolute top-1.5 right-1.5 z-10 bg-black/50 rounded-full p-1"><Repeat2 className="h-3 w-3 text-white" /></div>}
                  {post.media_url ? (
                    <Image src={post.media_url} alt="" fill sizes="33vw" className="object-cover group-hover:scale-105 transition-transform duration-200" />
                  ) : (
                    <div className="flex items-center justify-center h-full p-2 bg-gradient-to-br from-pink-500/10 to-purple-500/10"><PostCaption content={post.content ?? ''} variant="titleOnly" titleClassName="text-xs text-center text-muted-foreground line-clamp-4" /></div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all" />
                </button>
              ))}
            </div>
          )}
          <InfiniteScrollSentinel onIntersect={query.fetchNextPage} hasMore={!!query.hasNextPage} isLoading={query.isFetchingNextPage} />
        </TabsContent>

        <TabsContent value="reels">
          {query.isLoading ? (
            <div className="grid grid-cols-3 gap-0.5 p-0.5">{Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="aspect-[9/16]" />)}</div>
          ) : query.isError ? (
            <div className="py-14 text-center text-sm text-destructive px-4">Reels could not be loaded. Please refresh the page.</div>
          ) : videoPosts.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-muted-foreground"><Film className="h-12 w-12 mb-2" /><p>No reels yet</p></div>
          ) : (
            <div className="grid grid-cols-3 gap-0.5 p-0.5">
              {videoPosts.map(post => (
                <button key={post.id} onClick={() => setSelectedPost(post)} className="relative aspect-[9/16] bg-black overflow-hidden group">
                  <video src={post.media_url ?? ''} className="w-full h-full object-cover" preload="metadata" muted />
                  <div className="absolute inset-0 bg-black/10 group-hover:bg-black/30 transition-all" />
                  <div className="absolute inset-0 flex items-center justify-center"><div className="bg-black/50 rounded-full p-2"><Play className="h-5 w-5 text-white fill-white" /></div></div>
                  {post.reposted_by && post.reposted_by.length > 0 && <div className="absolute top-1.5 left-1.5 bg-black/50 rounded-full p-1"><Repeat2 className="h-3 w-3 text-white" /></div>}
                </button>
              ))}
            </div>
          )}
          <InfiniteScrollSentinel onIntersect={query.fetchNextPage} hasMore={!!query.hasNextPage} isLoading={query.isFetchingNextPage} />
        </TabsContent>
      </Tabs>

      {selectedPost && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-3" onClick={() => setSelectedPost(null)}>
          <div className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-2xl" onClick={e => e.stopPropagation()}>
            <PostCard post={selectedPost} onDelete={deletePost} />
          </div>
        </div>
      )}
    </>
  )
}
