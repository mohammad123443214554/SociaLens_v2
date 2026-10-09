'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useUser } from '@/lib/hooks/useUser'

export type ContentEventType =
  | 'view' | 'watch_time' | 'completion' | 'rewatch' | 'like' | 'comment'
  | 'save' | 'share' | 'follow' | 'profile_visit' | 'skip' | 'not_interested' | 'report'

interface QueuedEvent {
  user_id: string
  target_type: 'post' | 'reel' | 'story'
  target_id: string
  creator_id?: string | null
  event_type: ContentEventType
  watch_seconds?: number
  video_duration?: number
}

const FLUSH_INTERVAL_MS = 4000
// These matter enough (and are rare enough) to send right away instead of
// waiting for the timer - a "like" shouldn't sit in a queue for 4 seconds
// before it starts influencing the algorithm.
const IMMEDIATE_EVENTS = new Set<ContentEventType>(['follow', 'save', 'share', 'not_interested', 'report'])

let queue: QueuedEvent[] = []
let flushTimer: ReturnType<typeof setInterval> | null = null

function flush() {
  if (queue.length === 0) return
  const batch = queue
  queue = []
  const body = JSON.stringify({ events: batch })
  // sendBeacon survives the page/tab closing mid-flush (e.g. swiping away
  // from a Reel) - fetch with keepalive as the fallback where it's not
  // available.
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' })
    const ok = navigator.sendBeacon('/api/events/track', blob)
    if (ok) return
  }
  fetch('/api/events/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {})
}

// Mount once per session (e.g. in the main layout) so the flush timer and
// queue are shared app-wide, not duplicated per component.
export function useEventFlusher() {
  useEffect(() => {
    if (!flushTimer) flushTimer = setInterval(flush, FLUSH_INTERVAL_MS)
    const onHide = () => { if (document.visibilityState === 'hidden') flush() }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
    }
  }, [])
}

// Used by any component that wants to log a recommendation signal -
// ReelCard/PostCard watch time, likes/saves/shares, "Not Interested", a
// profile visit, etc. Silently does nothing if signed out.
export function useTrackEvent() {
  const { user } = useUser()
  const userIdRef = useRef(user?.id)
  userIdRef.current = user?.id

  return useCallback((event: Omit<QueuedEvent, 'user_id'>) => {
    const userId = userIdRef.current
    if (!userId) return
    queue.push({ ...event, user_id: userId })
    if (IMMEDIATE_EVENTS.has(event.event_type)) flush()
  }, [])
}
