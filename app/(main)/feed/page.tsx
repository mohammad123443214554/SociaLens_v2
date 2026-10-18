'use client'

import { useMemo } from 'react'
import { PostCard } from '@/components/feed/PostCard'
import { PostSkeleton } from '@/components/feed/PostSkeleton'
import { AdPostSlot } from '@/components/ads/AdPostSlot'
import { StoriesBar } from '@/components/stories/StoriesBar'
import { HomeGreetingBanner } from '@/components/feed/HomeGreetingBanner'
import { ReelViewer } from '@/components/shared/ReelViewer'
import { useFeedPosts } from '@/lib/hooks/usePosts'
import { useUser } from '@/lib/hooks/useUser'
import { createClient } from '@/lib/supabase/client'
import { useQueryClient } from '@tanstack/react-query'
import { InfiniteScrollSentinel } from '@/components/shared/InfiniteScrollSentinel'
import { interleaveAds, dedupeById } from '@/lib/utils/adInsertion'

export default function FeedPage() {
  const { user } = useUser()
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useFeedPosts(user?.id)
  const posts = data?.pages.flatMap(page => page.posts) ?? []
  const supabase = createClient()
  const queryClient = useQueryClient()

  // Randomized gaps (3-8 posts apart) rather than a fixed "every 4th
  // post" rhythm, so a sponsored post never falls into a noticeable
  // pattern. Only recomputed when the actual post list changes, so ads
  // Don't jump around position on every unrelated re-render.
  const items = useMemo(() => interleaveAds(dedupeById(posts), 3, 8), [posts])

  const handleDeletePost = async (postId: string) => {
    if (!user) return
    const { data, error } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId)
      .eq('user_id', user.id)
      .select('id')

    if (error || !data || data.length === 0) {
      alert('Could not delete this post. Please try again.')
      return
    }
    queryClient.invalidateQueries({ queryKey: ['feed-posts'] })
  }

  let lastRealPost: typeof posts[number] | null = null

  return (
    <div className="w-full min-w-0 px-3 sm:px-4 xl:px-6">
      {/* Time-based greeting banner, placed above Stories */}
      <HomeGreetingBanner />

      {/* Stories */}
      <StoriesBar />

      {/* One vertically-scrolling, algorithm-ranked section for reels, photo posts and text posts */}
      <section className="my-4 overflow-hidden rounded-xl border border-border/70 bg-card/30 sm:rounded-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-3 sm:px-4">
          <h2 className="text-sm font-bold sm:text-base">Recommended for you</h2>
          <span className="text-[11px] text-muted-foreground sm:text-xs">Reels · Posts · Text Posts</span>
        </div>
        {isLoading ? (
          <div className="space-y-3 p-3 sm:p-4">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />)}
          </div>
        ) : posts.filter(post => post.content?.trim()).length ? (
          <div className="divide-y divide-border/60">
            {posts.filter(post => post.content?.trim()).slice(0, 8).map(post => {
              const content = post.content?.trim() ?? ''
              const title = content.split(/\r?\n/).map(line => line.trim()).find(Boolean) ?? ''
              return (
                <ReelViewer
                  key={post.id}
                  post={post}
                  trigger={
                    <button type="button" className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/40 sm:px-4">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</span>
                      <span className="shrink-0 text-xs font-semibold text-pink-400 hover:text-fuchsia-400">See more</span>
                    </button>
                  }
                />
              )
            })}
          </div>
        ) : (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">No recommended posts available yet.</p>
        )}
      </section>

      {/* feed */}
      <div>
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => <PostSkeleton key={i} />)
          : posts.length === 0
          ? (
            <div className="text-center py-20 text-muted-foreground">
              <p className="text-lg font-medium">No posts to show right now</p>
              <p className="text-sm mt-1">Follow people to fill your feed with their posts</p>
            </div>
          )
          : items.map((item, index) => {
              if (item === 'ad') {
                return <AdPostSlot key={`ad-${index}`} />
              }
              const post = item
              const isFirstSuggested = post.is_suggested && !lastRealPost?.is_suggested
              lastRealPost = post
              return (
                <div key={post.id}>
                  {isFirstSuggested && (
                    <div className="px-4 py-3 text-sm font-semibold text-muted-foreground border-t">
                      Suggested for you
                    </div>
                  )}
                  <PostCard post={post} onDelete={handleDeletePost} />
                </div>
              )
            })
        }
      </div>
      <InfiniteScrollSentinel onIntersect={fetchNextPage} hasMore={!!hasNextPage} isLoading={isFetchingNextPage} />
    </div>
  )
}
