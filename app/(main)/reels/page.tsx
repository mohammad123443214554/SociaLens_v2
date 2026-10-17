'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useReelsPosts } from '@/lib/hooks/usePosts'
import { ReelsFeed } from '@/components/reels/ReelsFeed'
import { useUser } from '@/lib/hooks/useUser'

const BACKFILL_PAUSE_MS = 13_000

export default function ReelsPage() {
  const { user } = useUser()
  const queryClient = useQueryClient()
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useReelsPosts(user?.id)

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    let pauseTimer: ReturnType<typeof setTimeout> | undefined

    const processNext = async (interactionId?: string) => {
      if (cancelled) return
      try {
        const response = await fetch('/api/recommendation/backfill-content', {
          method: 'POST',
          ...(interactionId ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ interactionId }) } : {}),
        })
        const result = await response.json()
        if (cancelled) return
        if (!response.ok || result?.ok !== true) {
          console.warn('Reel recommendation backfill stopped', result?.reason || response.status)
          return
        }
        if (result.pending && result.interactionId) {
          pauseTimer = setTimeout(() => { void processNext(result.interactionId) }, 4_000)
          return
        }
        if (result.processed > 0) {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['reels-posts', user.id] }),
            queryClient.invalidateQueries({ queryKey: ['all-explore-reels', user.id] }),
            queryClient.invalidateQueries({ queryKey: ['explore-top-reels', user.id] }),
          ])
        }
        if (result.remaining === 0 || result.processed === 0) return
        // Leave enough space between Gemini requests to respect the free-tier quota.
        pauseTimer = setTimeout(() => { void processNext() }, BACKFILL_PAUSE_MS)
      } catch (error) {
        console.warn('Reel recommendation backfill unavailable', error)
      }
    }

    void processNext()
    return () => {
      cancelled = true
      if (pauseTimer) clearTimeout(pauseTimer)
    }
  }, [user?.id, queryClient])

  const reels = data?.pages.flatMap(page => page.posts) ?? []

  return (
    <div className="flex justify-center items-center bg-background h-[100dvh] lg:h-[calc(100vh-3.5rem)] overflow-hidden">
      <div className="relative bg-black w-full h-full lg:max-w-[420px] lg:h-[92%] lg:rounded-xl lg:overflow-hidden">
        <ReelsFeed reels={reels} isLoading={isLoading} onLoadMore={fetchNextPage} hasMore={!!hasNextPage} isLoadingMore={isFetchingNextPage} />
      </div>
    </div>
  )
}
