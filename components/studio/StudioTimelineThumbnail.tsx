'use client'

import { useEffect, useState } from 'react'
import { Film, Image as ImageIcon, Music2 } from 'lucide-react'

type TimelineThumbnailProps = {
  src: string
  kind: 'image' | 'video'
  trimStart?: number
  trimEnd?: number
  mode?: 'strip' | 'single'
  count?: number
  className?: string
}

/**
 * Small visual previews for Studio timeline clips.
 * Video frames are sampled from the visible trimmed source range; thumbnails
 * are generated locally and are never uploaded or persisted.
 */
export function StudioTimelineThumbnail({
  src,
  kind,
  trimStart = 0,
  trimEnd,
  mode = 'strip',
  count = 8,
  className = '',
}: TimelineThumbnailProps) {
  const [frames, setFrames] = useState<string[]>([])
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let video: HTMLVideoElement | null = null
    const safeStart = Number.isFinite(trimStart) ? Math.max(0, trimStart) : 0
    const safeEnd = Number.isFinite(trimEnd) ? Math.max(safeStart, trimEnd as number) : safeStart + 1

    setFrames([])
    setFailed(false)

    if (kind !== 'video' || !src) return

    const capture = async () => {
      video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      video.preload = 'auto'
      video.crossOrigin = 'anonymous'
      video.src = src

      const waitForMetadata = () => new Promise<void>((resolve, reject) => {
        if (!video) return reject(new Error('Video unavailable'))
        if (video.readyState >= 1) return resolve()
        const onReady = () => { cleanup(); resolve() }
        const onError = () => { cleanup(); reject(new Error('Video metadata unavailable')) }
        const timeout = window.setTimeout(() => { cleanup(); reject(new Error('Video metadata timeout')) }, 10000)
        const cleanup = () => {
          window.clearTimeout(timeout)
          video?.removeEventListener('loadedmetadata', onReady)
          video?.removeEventListener('error', onError)
        }
        video.addEventListener('loadedmetadata', onReady, { once: true })
        video.addEventListener('error', onError, { once: true })
        video.load()
      })

      const seekTo = (time: number) => new Promise<void>((resolve, reject) => {
        if (!video) return reject(new Error('Video unavailable'))
        const onSeeked = () => { cleanup(); resolve() }
        const onError = () => { cleanup(); reject(new Error('Video seek failed')) }
        const timeout = window.setTimeout(() => { cleanup(); reject(new Error('Video seek timeout')) }, 4000)
        const cleanup = () => {
          window.clearTimeout(timeout)
          video?.removeEventListener('seeked', onSeeked)
          video?.removeEventListener('error', onError)
        }
        video.addEventListener('seeked', onSeeked, { once: true })
        video.addEventListener('error', onError, { once: true })
        try {
          video.currentTime = Math.max(0, Math.min(time, Math.max(0, (video.duration || time) - 0.04)))
        } catch {
          cleanup()
          reject(new Error('Video seek unavailable'))
        }
      })

      try {
        await waitForMetadata()
        if (!video || cancelled) return
        const sourceEnd = Math.min(Number.isFinite(video.duration) ? video.duration : safeEnd, safeEnd)
        const sourceStart = Math.min(safeStart, Math.max(0, sourceEnd - 0.04))
        const span = Math.max(0, sourceEnd - sourceStart)
        const frameCount = mode === 'single' ? 1 : Math.max(2, Math.min(10, Math.floor(count)))
        const captured: string[] = []
        for (let index = 0; index < frameCount; index += 1) {
          if (cancelled || !video) break
          const progress = frameCount === 1 ? 0.08 : (index + 0.5) / frameCount
          const time = sourceStart + span * progress
          if (video.readyState >= 2 && Math.abs(video.currentTime - time) < 0.025) {
            // The current decoded frame is already at the requested sample.
          } else {
            await seekTo(time)
          }
          if (cancelled || !video) break
          const canvas = document.createElement('canvas')
          canvas.width = 144
          canvas.height = 82
          const context = canvas.getContext('2d')
          if (!context) continue
          context.drawImage(video, 0, 0, canvas.width, canvas.height)
          captured.push(canvas.toDataURL('image/jpeg', 0.76))
        }
        if (!cancelled && captured.length) setFrames(captured)
        else if (!cancelled) setFailed(true)
      } catch {
        if (!cancelled) setFailed(true)
      } finally {
        if (video) {
          video.pause()
          video.removeAttribute('src')
          video.load()
          video = null
        }
      }
    }

    void capture()
    return () => {
      cancelled = true
      if (video) {
        video.pause()
        video.removeAttribute('src')
        video.load()
        video = null
      }
    }
  }, [src, kind, trimStart, trimEnd, mode, count])

  if (kind === 'image') {
    return <div
      aria-hidden="true"
      className={'h-full w-full overflow-hidden ' + className}
      style={{
        backgroundImage: `url("${src.replace(/["\\\\]/g, '\\\\  if (kind === 'image') {
    return <div className={'h-full w-full overflow-hidden ' + className}>
      <img src={src} alt="" draggable={false} className="h-full w-full object-cover" />
    </div>
  }')}")`,
        backgroundRepeat: 'repeat-x',
        backgroundPosition: 'left center',
        backgroundSize: 'auto 100%',
      }}
    />
  }

  if (frames.length) {
    return <div className={'flex h-full w-full overflow-hidden ' + className}>
      {frames.map((frame, index) => <img key={index} src={frame} alt="" draggable={false} className="h-full min-w-0 flex-1 object-cover" />)}
    </div>
  }

  return <div className={'flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-900/80 via-[#25105d] to-fuchsia-900/70 ' + className}>
    {failed ? <ImageIcon className="h-4 w-4 text-violet-100/80" /> : <Film className="h-4 w-4 animate-pulse text-violet-100/80" />}
  </div>
}

/** A compact waveform derived from decoded audio samples, not decorative random bars. */
export function StudioTimelineWaveform({ src, className = '' }: { src: string; className?: string }) {
  const [bars, setBars] = useState<number[]>([])

  useEffect(() => {
    let cancelled = false
    let context: AudioContext | null = null
    const closeContext = () => {
      const activeContext = context
      context = null
      if (activeContext && activeContext.state !== 'closed') {
        void activeContext.close().catch(() => undefined)
      }
    }
    const decode = async () => {
      try {
        const response = await fetch(src)
        if (!response.ok) throw new Error('Audio preview unavailable')
        const buffer = await response.arrayBuffer()
        if (cancelled) return
        const AudioContextClass = window.AudioContext
        context = new AudioContextClass()
        const decoded = await context.decodeAudioData(buffer.slice(0))
        const channel = decoded.getChannelData(0)
        const count = 180
        const samplesPerBar = Math.max(1, Math.floor(channel.length / count))
        const next = Array.from({ length: count }, (_, index) => {
          const start = index * samplesPerBar
          const end = Math.min(channel.length, start + samplesPerBar)
          let peak = 0
          for (let sample = start; sample < end; sample += 1) peak = Math.max(peak, Math.abs(channel[sample]))
          return Math.max(8, Math.min(100, Math.round(peak * 100)))
        })
        if (!cancelled) setBars(next)
      } catch {
        if (!cancelled) setBars([])
      } finally {
        closeContext()
      }
    }
    setBars([])
    void decode()
    return () => { cancelled = true; closeContext() }
  }, [src])

  return <div aria-hidden="true" className={'flex h-full items-center justify-around gap-px overflow-hidden px-2 ' + className}>
    {bars.length ? bars.map((height, index) => <span key={index} className="min-w-[1px] flex-1 rounded-full bg-fuchsia-300/90 shadow-[0_0_5px_rgba(217,70,239,.45)]" style={{ height: height + '%' }} />) : <div className="flex items-center gap-2 text-fuchsia-100/70"><Music2 className="h-4 w-4" /><span className="text-[9px]">Audio waveform</span></div>}
  </div>
}
