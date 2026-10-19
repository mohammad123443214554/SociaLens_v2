'use client'

import { useEffect, useMemo, useRef } from 'react'
import { StoriesBar } from '@/components/stories/StoriesBar'
import { HomeGreetingBanner } from '@/components/feed/HomeGreetingBanner'
import { ReelViewer } from '@/components/shared/ReelViewer'
import { PostCaption } from '@/components/shared/PostCaption'
import { useFeedPosts, useReelsPosts } from '@/lib/hooks/usePosts'
import { useUser } from '@/lib/hooks/useUser'
import { createClient } from '@/lib/supabase/client'
import { useQueryClient } from '@tanstack/react-query'
import { dedupeById } from '@/lib/utils/adInsertion'

export default function FeedPage() {
  const { user } = useUser()
  const { data, isLoading, hasNextPage: hasMoreFeed, fetchNextPage: fetchMoreFeed, isFetchingNextPage: fetchingMoreFeed } = useFeedPosts(user?.id)
  const { data: reelsData, isLoading: reelsLoading, hasNextPage: hasMoreReels, fetchNextPage: fetchMoreReels, isFetchingNextPage: fetchingMoreReels } = useReelsPosts(user?.id)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const feedPosts = data?.pages.flatMap(page => page.posts) ?? []
  const reels = reelsData?.pages.flatMap(page => page.posts) ?? []
  const posts = useMemo(() => {
    const unique = dedupeById([...reels, ...feedPosts])
    const buckets = [
      unique.filter(post => post.media_type === 'video' && post.media_url),
      unique.filter(post => post.media_type === 'image' && post.media_url),
      unique.filter(post => !post.media_url && post.content?.trim()),
    ]
    const mixed: typeof unique = []
    let index = 0
    while (buckets.some(bucket => index < bucket.length)) {
      for (const bucket of buckets) if (bucket[index]) mixed.push(bucket[index])
      index += 1
    }
    return mixed
  }, [feedPosts, reels])

  useEffect(() => {
    const target = loadMoreRef.current
    if (!target || (!hasMoreFeed && !hasMoreReels)) return
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return
      if (hasMoreFeed && !fetchingMoreFeed) void fetchMoreFeed()
      if (hasMoreReels && !fetchingMoreReels) void fetchMoreReels()
    }, { rootMargin: '600px 0px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [hasMoreFeed, hasMoreReels, fetchingMoreFeed, fetchingMoreReels, fetchMoreFeed, fetchMoreReels])

  const supabase = createClient()
  const queryClient = useQueryClient()

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


  return (
    <div className="w-full min-w-0 px-3 sm:px-4 xl:px-6">
      {/* Time-based greeting banner, placed above Stories */}
      <HomeGreetingBanner />

      {/* Stories */}
      <StoriesBar />

      {/* Mixed personalized grid: reels, photo posts and text posts */}
      <section className="my-4 overflow-hidden rounded-xl border border-border/70 bg-card/30 p-3 shadow-sm sm:rounded-2xl sm:p-4">
        <div className="mb-3"><h2 className="text-sm font-bold tracking-wide text-foreground sm:text-base">Discover</h2><p className="text-xs text-muted-foreground">Reels · Posts · Text Posts</p></div>
        {isLoading || reelsLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-muted sm:rounded-2xl" />)}</div>
        ) : posts.length ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            {posts.map(post => {
              const content = post.content?.trim() ?? ''
              const firstLine = content.split(/\r?\n/).map(line => line.trim()).find(Boolean) ?? ''
              const title = firstLine.replace(/^\*\*(.*?)\*\*$/, '$1')
              const isVideo = post.media_type === 'video' && !!post.media_url
              const isImage = post.media_type === 'image' && !!post.media_url
              const trigger = (
                <button type="button" aria-label={(isVideo ? 'Play reel: ' : 'Open post: ') + (title || (isVideo ? 'Reel' : 'Post'))} className="relative block aspect-[3/4] w-full overflow-hidden bg-muted text-left">
                  {isVideo ? <video src={post.media_url!} muted playsInline preload="metadata" className="pointer-events-none h-full w-full object-cover" /> : isImage ? <img src={post.media_url!} alt="" loading="lazy" className="pointer-events-none h-full w-full object-cover" /> : <div className="h-full w-full bg-muted/50 p-3 sm:p-4"><p className="line-clamp-7 whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground sm:text-sm">{title || content}</p></div>}
                </button>
              )
              return (
                <article key={post.id} className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm transition-colors hover:border-pink-400/50 sm:rounded-2xl">
                  <ReelViewer post={post} trigger={trigger} />
                  <div className="flex min-h-[76px] min-w-0 flex-1 flex-col p-2 sm:min-h-[88px] sm:p-3">
                    {title && <p className="line-clamp-2 break-words text-[11px] font-semibold leading-snug text-foreground sm:text-xs">{title}</p>}
                    {content && <PostCaption content={content} expandMode="dialog" titleClassName="hidden" captionClassName="hidden" buttonClassName="mt-auto pt-2 text-[10px] font-semibold text-pink-400 hover:text-fuchsia-400 sm:text-xs" />}
                  </div>
                </article>
              )
            })}
          </div>
        ) : <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">No posts to discover yet.</p>}
        {(hasMoreFeed || hasMoreReels || fetchingMoreFeed || fetchingMoreReels) && <div ref={loadMoreRef} className="flex justify-center py-4 text-xs text-muted-foreground">{fetchingMoreFeed || fetchingMoreReels ? 'Loading more posts…' : ''}</div>}
      </section>
    </div>
  )
}
