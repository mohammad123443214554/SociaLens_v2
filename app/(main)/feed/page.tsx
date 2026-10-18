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

      {/* Mixed, algorithm-ranked discovery grid, matching Explore's card layout */}
      <section className="my-4 overflow-hidden rounded-xl border border-border/70 bg-card/30 p-3 shadow-sm sm:rounded-2xl sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold tracking-wide text-foreground sm:text-base">Discover</h2>
            <p className="text-xs text-muted-foreground">Reels · Posts · Text Posts</p>
          </div>
        </div>
        {isLoading ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-muted sm:rounded-2xl" />)}
          </div>
        ) : posts.filter(post => post.content?.trim()).length ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            {posts.filter(post => post.content?.trim()).slice(0, 8).map(post => {
              const content = post.content?.trim() ?? ''
              const title = content.split(/\\r?\\n/).map(line => line.trim()).find(Boolean) ?? ''
              const isVideo = post.media_type === 'video' && !!post.media_url
              const isImage = post.media_type === 'image' && !!post.media_url
              return (
                <article key={post.id} className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm transition-colors hover:border-pink-400/50 sm:rounded-2xl">
                  <ReelViewer
                    post={post}
                    trigger={
                      <button type="button" aria-label={`See more: ${title}`} className="flex h-full w-full min-w-0 flex-col text-left">
                        {isVideo || isImage ? (
                          <div className="relative aspect-[3/4] w-full overflow-hidden bg-muted">
                            <img src={post.media_url!} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.02]" />
                            {isVideo && <span className="absolute right-2 top-2 rounded-md bg-black/60 px-1.5 py-1 text-[10px] font-semibold text-white">Reel</span>}
                          </div>
                        ) : (
                          <div className="flex aspect-[3/4] w-full items-start overflow-hidden bg-muted/50 p-3 sm:p-4">
                            <p className="line-clamp-7 whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground sm:text-sm">{title}</p>
                          </div>
                        )}
                        <div className="flex min-h-[76px] min-w-0 flex-1 flex-col p-2 sm:min-h-[88px] sm:p-3">
                          <p className="line-clamp-2 break-words text-[11px] font-semibold leading-snug text-foreground sm:text-xs">{title}</p>
                          <span className="mt-auto pt-2 text-[10px] font-semibold text-pink-400 hover:text-fuchsia-400 sm:text-xs">See more</span>
                        </div>
                      </button>
                    }
                  />
                </article>
              )
            })}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">No posts to discover yet.</p>
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
