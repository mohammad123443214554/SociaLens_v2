'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useReelsPosts } from '@/lib/hooks/usePosts'
import { ReelsFeed } from '@/components/reels/ReelsFeed'
import { useUser } from '@/lib/hooks/useUser'

export default function ReelsPage() {
  const { user } = useUser()
  const queryClient = useQueryClient()
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useReelsPosts(user?.id)

  // Older reels predate the recommendation classifier. Each signed-in visit
  // repairs a small bounded batch, then refreshes rankings with the new labels.
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    fetch('/api/recommendation/backfill-content', { method: 'POST' })
      .then(async response => {
        if (!response.ok) return
        const result = await response.json()
        if (!cancelled && result?.processed > 0) {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['reels-posts', user.id] }),
            queryClient.invalidateQueries({ queryKey: ['all-explore-reels', user.id] }),
            queryClient.invalidateQueries({ queryKey: ['explore-top-reels', user.id] }),
          ])
        }
      })
      .catch(error => console.warn('Reel recommendation backfill unavailable', error))
    return () => { cancelled = true }
  }, [user?.id, queryClient])
  const reels = data?.pages.flatMap(page => page.posts) ?? []

  return (
    <div className="flex justify-center items-center bg-background h-[100dvh] lg:h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Edge-to-edge on mobile (matches every other reels/shorts app);
          a centered phone-width card only on desktop, where there's
          plenty of room around it. A fixed height here - never min-height
          - is what stops the whole page from scrolling behind the reel:
          content taller than the viewport used to leak out and scroll the
          page itself along with it. */}
      <div className="relative bg-black w-full h-full lg:max-w-[420px] lg:h-[92%] lg:rounded-xl lg:overflow-hidden">
        <ReelsFeed reels={reels} isLoading={isLoading} onLoadMore={fetchNextPage} hasMore={!!hasNextPage} isLoadingMore={isFetchingNextPage} />
      </div>
    </div>
  )
}
