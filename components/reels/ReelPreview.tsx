'use client'

import { useEffect, useRef, useState } from 'react'
import { useVideoPlaybackUrl } from '@/lib/hooks/useVideoPlaybackUrl'
import { getMediaProxyUrl } from '@/lib/utils/media'

interface ReelPreviewProps {
  src: string
  className?: string
  ariaLabel?: string
}

/** Lazy-loads a small reel preview and uses the compatible rendition when ready. */
export function ReelPreview({ src, className, ariaLabel }: ReelPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [nearViewport, setNearViewport] = useState(false)
  const [usingProxy, setUsingProxy] = useState(false)
  const [usingOriginal, setUsingOriginal] = useState(false)
  const [fallbackExhausted, setFallbackExhausted] = useState(false)
  const playbackUrl = useVideoPlaybackUrl(src, nearViewport)
  const selectedUrl = usingOriginal ? src : playbackUrl ?? src
  const videoSrc = nearViewport && !fallbackExhausted ? (usingProxy ? getMediaProxyUrl(selectedUrl) : selectedUrl) : undefined

  useEffect(() => {
    const element = videoRef.current
    if (!element) return
    if (typeof IntersectionObserver === 'undefined') {
      setNearViewport(true)
      return
    }
    const observer = new IntersectionObserver(entries => {
      setNearViewport(Boolean(entries[0]?.isIntersecting))
    }, { rootMargin: '400px 0px', threshold: 0.01 })
    observer.observe(element)
    return () => observer.disconnect()
  }, [src])

  useEffect(() => {
    setUsingProxy(false)
    setUsingOriginal(false)
    setFallbackExhausted(false)
  }, [src])

  return (
    <video
      ref={videoRef}
      src={videoSrc}
      muted
      playsInline
      preload="metadata"
      className={className}
      aria-label={ariaLabel}
      onError={() => {
        if (usingProxy && !usingOriginal) {
          setUsingOriginal(true)
          setUsingProxy(false)
        } else if (!usingProxy && !usingOriginal) {
          setUsingProxy(true)
        } else {
          setFallbackExhausted(true)
        }
      }}
    />
  )
}
