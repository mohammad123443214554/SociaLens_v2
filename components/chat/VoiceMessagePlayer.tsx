'use client'

import { useEffect, useRef, useState } from 'react'
import { Play, Pause } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getAvatarUrl } from '@/lib/utils/helpers'

interface VoiceMessagePlayerProps {
  url: string
  durationSeconds: number | null
  isOwn: boolean
  playbackRate?: number
  timestamp?: string
  isRead?: boolean
  seenAvatarUrl?: string | null
}

const FALLBACK_WAVEFORM = Array.from({ length: 42 }, (_, i) => {
  const wave = Math.abs(Math.sin(i * 1.71) * Math.cos(i * 0.37))
  return 0.16 + wave * (i % 7 === 0 ? 0.84 : 0.62)
})

export function VoiceMessagePlayer({ url, durationSeconds, isOwn, playbackRate = 1, timestamp, isRead = false, seenAvatarUrl }: VoiceMessagePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [waveform, setWaveform] = useState<number[]>(FALLBACK_WAVEFORM)
  const [playbackError, setPlaybackError] = useState(false)

  useEffect(() => {
    let cancelled = false
    let context: AudioContext | null = null
    const loadWaveform = async () => {
      try {
        const response = await fetch(url)
        if (!response.ok) throw new Error('Audio waveform unavailable')
        const buffer = await response.arrayBuffer()
        const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!AudioContextClass) return
        context = new AudioContextClass()
        const decoded = await context.decodeAudioData(buffer.slice(0))
        const channel = decoded.getChannelData(0)
        const count = 42
        const bucketSize = Math.max(1, Math.floor(channel.length / count))
        const peaks = Array.from({ length: count }, (_, i) => {
          const start = i * bucketSize
          const end = Math.min(channel.length, start + bucketSize)
          let peak = 0
          for (let j = start; j < end; j += 1) peak = Math.max(peak, Math.abs(channel[j]))
          return peak
        })
        const max = Math.max(...peaks, 0.01)
        if (!cancelled) setWaveform(peaks.map(peak => Math.max(0.12, peak / max)))
      } catch {
        // Cross-origin audio that cannot be decoded still gets a polished waveform.
      } finally {
        if (context && context.state !== 'closed') void context.close()
      }
    }
    void loadWaveform()
    return () => { cancelled = true }
  }, [url])

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate
  }, [playbackRate])

  const toggle = async () => {
    const audio = audioRef.current
    if (!audio || !url) return
    setPlaybackError(false)
    if (playing) {
      audio.pause()
      return
    }
    try {
      audio.playbackRate = playbackRate
      if (audio.networkState === HTMLMediaElement.NETWORK_EMPTY) audio.load()
      await audio.play()
    } catch (error) {
      console.error('[chat] Voice message playback failed:', error)
      setPlaying(false)
      setPlaybackError(true)
    }
  }

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  const duration = durationSeconds ?? audioRef.current?.duration
  const currentDuration = Number.isFinite(duration) && duration ? duration : 0

  return (
    <div className={`w-[min(260px,calc(100vw-170px))] min-w-0 ${isOwn ? 'text-white' : 'text-foreground'}`}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => { void toggle() }}
          aria-label={playing ? 'Pause voice message' : 'Play voice message'}
          className="h-11 w-11 rounded-full shrink-0 flex items-center justify-center bg-gradient-to-br from-violet-500 via-purple-600 to-blue-600 text-white shadow-[0_0_14px_rgba(139,92,246,0.35)] ring-1 ring-white/15"
        >
          {playing ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current ml-0.5" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="h-10 flex items-center justify-between gap-[3px]" aria-label="Voice message waveform">
            {waveform.map((height, index) => {
              const played = index / waveform.length <= progress / 100
              return <span key={index} className={`w-[3px] max-w-[4px] flex-1 rounded-full transition-colors ${played ? 'bg-gradient-to-t from-blue-400 to-fuchsia-400' : isOwn ? 'bg-white/45' : 'bg-violet-400/60'}`} style={{ height: `${Math.max(12, height * 38)}px` }} />
            })}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 pl-[56px] mt-0.5 min-h-[18px]">
        <span className={`text-xs tabular-nums ${isOwn ? 'text-white/80' : 'text-muted-foreground'}`}>{currentDuration ? formatTime(currentDuration) : '0:00'}</span>
        <div className="flex items-center gap-2.5">
          {timestamp && <span className={`text-xs whitespace-nowrap ${isOwn ? 'text-white/70' : 'text-muted-foreground'}`}>{timestamp}</span>}
          {isOwn && (
            isRead && seenAvatarUrl ? (
              <Avatar className="h-[18px] w-[18px] shrink-0 ring-1 ring-violet-400/70" title="Seen">
                <AvatarImage src={getAvatarUrl(seenAvatarUrl) || undefined} />
                <AvatarFallback className="text-[8px] bg-violet-600 text-white">✓</AvatarFallback>
              </Avatar>
            ) : (
              <span className={`inline-flex items-center -space-x-1 ${isRead ? 'text-violet-400' : isOwn ? 'text-white/65' : 'text-muted-foreground'}`} aria-label={isRead ? 'Read' : 'Sent'}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2 6.5 4.7 9 10 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </span>
            )
          )}
        </div>
      </div>
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onLoadedMetadata={(e) => { if (!durationSeconds && Number.isFinite(e.currentTarget.duration)) setProgress(0) }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setProgress(0) }}
        onError={() => { setPlaying(false); setPlaybackError(true) }}
        onTimeUpdate={(e) => {
          const audio = e.currentTarget
          if (audio.duration) setProgress((audio.currentTime / audio.duration) * 100)
        }}
      />
      {playbackError && <p role="status" className="mt-1 pl-[56px] text-[10px] text-red-300">Could not play this voice message. Please try again.</p>}
    </div>
  )
}
