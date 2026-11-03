'use client'

import { useEffect, useRef, useState } from 'react'
import Lottie from 'lottie-react'
import { getCallReactionAssetUrl, type CallReactionAssetId } from '@/lib/call-reactions'

type AnimationData = {
  w: number
  h: number
  layers: unknown[]
  [key: string]: unknown
}

const animationCache = new Map<string, Promise<AnimationData>>()

async function requestAnimation(url: string, cache: RequestCache): Promise<AnimationData> {
  const response = await fetch(url, {
    cache,
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error('Reaction animation request failed (' + response.status + '): ' + url)
  }

  const data = await response.json() as AnimationData
  if (!data || !Array.isArray(data.layers) || !Number.isFinite(data.w) || !Number.isFinite(data.h)) {
    throw new Error('Invalid Lottie animation data: ' + url)
  }
  return data
}

function loadAnimation(reaction: CallReactionAssetId): Promise<AnimationData> {
  const url = getCallReactionAssetUrl(reaction)
  const cached = animationCache.get(url)
  if (cached) return cached

  const request = requestAnimation(url, 'force-cache').catch(async (firstError) => {
    // A stale cached 404/edge response should not permanently hide a reaction.
    try {
      return await requestAnimation(url, 'reload')
    } catch (retryError) {
      console.error('[SociaLens Call] could not load reaction animation:', reaction, firstError, retryError)
      throw retryError
    }
  }).catch((error) => {
    animationCache.delete(url)
    throw error
  })

  animationCache.set(url, request)
  return request
}

interface CallReactionLottieProps {
  reaction: CallReactionAssetId
  loop?: boolean
  onComplete?: () => void
  className?: string
}

export function CallReactionLottie({ reaction, loop = true, onComplete, className }: CallReactionLottieProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [animationData, setAnimationData] = useState<AnimationData | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    if (typeof IntersectionObserver === 'undefined') {
      setIsVisible(true)
      return
    }

    const scrollRoot = host.closest('[data-call-reaction-scroll]')
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setIsVisible(true)
        observer.disconnect()
      }
    }, {
      root: scrollRoot instanceof Element ? scrollRoot : null,
      rootMargin: '160px',
    })
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!isVisible) return
    let active = true
    setAnimationData(null)
    setFailed(false)
    void loadAnimation(reaction).then((data) => {
      if (active) setAnimationData(data)
    }).catch(() => {
      if (active) setFailed(true)
    })
    return () => { active = false }
  }, [reaction, isVisible])

  // Never substitute a sparkle emoji for a real reaction.
  if (failed) {
    return <div ref={hostRef} className={['flex shrink-0 items-center justify-center overflow-hidden', className].filter(Boolean).join(' ')} aria-hidden="true" />
  }

  if (!animationData) {
    return <div ref={hostRef} className={['flex shrink-0 items-center justify-center overflow-hidden', className].filter(Boolean).join(' ')} aria-hidden="true">
      <span className="block h-5 w-5 animate-pulse rounded-full bg-pink-200/20" />
    </div>
  }

  return (
    <div ref={hostRef} className={['flex shrink-0 items-center justify-center overflow-hidden', className].filter(Boolean).join(' ')} aria-hidden="true">
      <Lottie
        animationData={animationData}
        loop={loop}
        autoplay
        onComplete={onComplete}
        style={{ width: '100%', height: '100%', maxWidth: '100%', maxHeight: '100%', display: 'block', overflow: 'hidden' }}
        rendererSettings={{ preserveAspectRatio: 'xMidYMid meet', progressiveLoad: true }}
      />
    </div>
  )
}
