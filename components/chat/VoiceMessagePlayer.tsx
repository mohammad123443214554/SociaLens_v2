'use client'

import { useEffect, useRef, useState } from 'react'
import { Play, Pause } from 'lucide-react'

interface VoiceMessagePlayerProps {
  url: string
  durationSeconds: number | null
  isOwn: boolean
  playbackRate?: number
}

export function VoiceMessagePlayer({ url, durationSeconds, isOwn, playbackRate = 1 }: VoiceMessagePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0) // 0-100

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate
  }, [playbackRate])

  const toggle = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
    } else {
      audio.playbackRate = playbackRate
      audio.play()
    }
  }

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  return (
    <div className="flex items-center gap-2 min-w-[180px]">
      <button
        onClick={toggle}
        className={cnBtn(isOwn)}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
      </button>
      <div className="flex-1">
        <div className={`h-1 rounded-full overflow-hidden ${isOwn ? 'bg-white/30' : 'bg-foreground/20'}`}>
          <div
            className={`h-full ${isOwn ? 'bg-white' : 'bg-pink-500'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className={`text-[10px] mt-0.5 ${isOwn ? 'text-white/80' : 'text-muted-foreground'}`}>
          {durationSeconds ? formatTime(durationSeconds) : ''}
        </p>
      </div>
      <audio
        ref={audioRef}
        src={url}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setProgress(0) }}
        onTimeUpdate={(e) => {
          const audio = e.currentTarget
          if (audio.duration) setProgress((audio.currentTime / audio.duration) * 100)
        }}
      />
    </div>
  )
}

function cnBtn(isOwn: boolean) {
  return `w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
    isOwn ? 'bg-white/25 text-white' : 'bg-pink-500 text-white'
  }`
}
