'use client'

import { useEffect } from 'react'
import { useReelsPosts } from '@/lib/hooks/usePosts'
import { ReelsFeed } from '@/components/reels/ReelsFeed'
import { useUser } from '@/lib/hooks/useUser'
import { dedupeById } from '@/lib/utils/adInsertion'

const BACKFILL_PAUSE_MS = 13_000

export default function ReelsPage() {
  const { user } = useUser()
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
          if (result?.retryable && Number.isFinite(result.retryAfterMs)) {
            console.warn('Gemini analysis temporarily unavailable; retrying after backoff', result.reason)
            pauseTimer = setTimeout(() => { void processNext() }, Math.max(15_000, Math.min(120_000, result.retryAfterMs)))
            return
          }
          console.warn('Reel recommendation backfill stopped', result?.reason || response.status)
          return
        }
        if (result.pending && result.interactionId) {
          pauseTimer = setTimeout(() => { void processNext(result.interactionId) }, 4_000)
          return
        }
        // Do not invalidate/refetch visible feeds after background analysis.
        // Re-ranking during a swipe/scroll changes the active Reel and feels like an unexpected reload.
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
  }, [user?.id])

  const reels = dedupeById(data?.pages.flatMap(page => page.posts) ?? [])

  return (
    <div className="flex justify-center items-center bg-background h-[100dvh] lg:h-[calc(100vh-3.5rem)] overflow-hidden">
      <div className="relative bg-black w-full h-full lg:max-w-[420px] lg:h-[92%] lg:rounded-xl lg:overflow-hidden">
        <ReelsFeed reels={reels} isLoading={isLoading} onLoadMore={fetchNextPage} hasMore={!!hasNextPage} isLoadingMore={isFetchingNextPage} />
      </div>
    </div>
  )
}
