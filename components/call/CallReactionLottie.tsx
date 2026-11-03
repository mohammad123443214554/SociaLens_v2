'use client'

import { useEffect, useState } from 'react'
import Lottie from 'lottie-react'
import { getCallReactionAssetUrl, type CallReactionAssetId } from '@/lib/call-reactions'

type AnimationData = Record<string, unknown>

const animationCache = new Map<string, Promise<AnimationData>>()

function loadAnimation(reaction: CallReactionAssetId): Promise<AnimationData> {
  const url = getCallReactionAssetUrl(reaction)
  const cached = animationCache.get(url)
  if (cached) return cached

  const request = fetch(url, { cache: 'force-cache' }).then(async (response) => {
    if (!response.ok) throw new Error(`Could not load call reaction: ${reaction}`)
    return response.json() as Promise<AnimationData>
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
  const [animationData, setAnimationData] = useState<AnimationData | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    setAnimationData(null)
    setFailed(false)
    void loadAnimation(reaction).then((data) => {
      if (active) setAnimationData(data)
    }).catch((error) => {
      console.warn('[SociaLens Call] reaction animation unavailable:', reaction, error)
      if (active) setFailed(true)
    })
    return () => { active = false }
  }, [reaction])

  if (failed) {
    return <div className={className} aria-hidden="true"><span className="text-2xl">✨</span></div>
  }

  if (!animationData) {
    return <div className={className} aria-hidden="true"><span className="block h-5 w-5 animate-pulse rounded-full bg-pink-200/20" /></div>
  }

  return (
    <div className={className} aria-hidden="true">
      <Lottie
        animationData={animationData}
        loop={loop}
        autoplay
        onComplete={onComplete}
        style={{ width: '100%', height: '100%' }}
        rendererSettings={{ preserveAspectRatio: 'xMidYMid meet' }}
      />
    </div>
  )
}
