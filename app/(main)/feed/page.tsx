'use client'

import { useMemo } from 'react'
import { PostCard } from '@/components/feed/PostCard'
import { PostSkeleton } from '@/components/feed/PostSkeleton'
import { AdPostSlot } from '@/components/ads/AdPostSlot'
import { StoriesBar } from '@/components/stories/StoriesBar'
import { HomeGreetingBanner } from '@/components/feed/HomeGreetingBanner'
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
    <div className="max-w-xl mx-auto">
      {/* Time-based greeting banner, placed above Stories */}
      <HomeGreetingBanner />

      {/* Stories */}
      <StoriesBar />

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
