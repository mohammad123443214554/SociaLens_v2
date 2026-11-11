'use client'

import { useEffect, useState } from 'react'

/**
 * Resolve a compatible rendition only while a public post video is eligible
 * to load. The original remains the immediate fallback during processing,
 * terminal failure, and temporary status-endpoint errors.
 */
export function useVideoPlaybackUrl(originalUrl: string | null | undefined, enabled: boolean) {
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || !originalUrl) {
      setPlaybackUrl(null)
      return
    }

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    let consecutiveErrors = 0
    setPlaybackUrl(originalUrl)

    const schedule = (delay: number) => {
      if (!cancelled) timer = setTimeout(check, delay)
    }

    const check = async () => {
      try {
        const response = await fetch('/api/media/playback?url=' + encodeURIComponent(originalUrl), {
          cache: 'no-store',
          credentials: 'same-origin',
        })
        if (!response.ok) throw new Error('Playback lookup failed: ' + response.status)
        const result = await response.json() as { status?: string; playbackUrl?: string | null }
        if (cancelled) return
        consecutiveErrors = 0

        if (result.status === 'ready' && result.playbackUrl) {
          setPlaybackUrl(result.playbackUrl)
          return
        }
        if (result.status === 'untracked' || result.status === 'failed') {
          setPlaybackUrl(originalUrl)
          return
        }
        if (result.status !== 'queued' && result.status !== 'processing') {
          setPlaybackUrl(originalUrl)
          return
        }

        setPlaybackUrl(originalUrl)
        attempts += 1
        schedule(Math.min(15000, 3000 + attempts * 1000))
      } catch {
        if (cancelled) return
        consecutiveErrors += 1
        if (consecutiveErrors >= 2) setPlaybackUrl(originalUrl)
        if (consecutiveErrors >= 20) return
        schedule(Math.min(15000, 3000 * consecutiveErrors))
      }
    }

    void check()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [originalUrl, enabled])

  return playbackUrl
}
