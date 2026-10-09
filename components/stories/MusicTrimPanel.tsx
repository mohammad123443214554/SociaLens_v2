'use client'

import { useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, Check, RefreshCw, Trash2 } from 'lucide-react'
import type { SelectedSong } from './MusicPicker'

interface MusicTrimPanelProps {
  song: SelectedSong
  initialStart: number
  initialDuration: number
  sceneDuration: number
  isGlobal?: boolean
  onCancel: () => void
  onDone: (start: number, duration: number) => void
  onRemove: () => void
  onChangeSong: () => void
}

const CLIP_LENGTH = 30 // ITunes preview clips are ~30 seconds
// Purely decorative bar heights to look like a waveform (we don't have real
// amplitude data from the preview clip, this just needs to look right).
const BAR_HEIGHTS = Array.from({ length: 46 }, (_, i) => 30 + Math.abs(Math.sin(i * 0.7)) * 60 + (i % 3) * 5)

export function MusicTrimPanel({ song, initialStart, initialDuration, sceneDuration, isGlobal, onCancel, onDone, onRemove, onChangeSong }: MusicTrimPanelProps) {
  const [start, setStart] = useState(Math.min(initialStart, CLIP_LENGTH - 2))
  const [duration, setDuration] = useState(Math.min(initialDuration, sceneDuration, CLIP_LENGTH - start))
  const [playing, setPlaying] = useState(false)
  const [playheadPct, setPlayheadPct] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const playheadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ mode: 'left' | 'right' | 'move'; startX: number; origStart: number; origDuration: number } | null>(null)

  useEffect(() => () => {
    audioRef.current?.pause()
    if (playheadTimerRef.current) clearInterval(playheadTimerRef.current)
  }, [])

  const stopAudio = () => {
    audioRef.current?.pause()
    setPlaying(false)
    if (playheadTimerRef.current) clearInterval(playheadTimerRef.current)
  }

  const togglePreview = () => {
    if (playing) { stopAudio(); return }
    const audio = new Audio(song.previewUrl)
    audio.currentTime = start
    audio.play().catch(() => {})
    const stopAt = setTimeout(() => stopAudio(), duration * 1000)
    audio.onended = () => { setPlaying(false); clearTimeout(stopAt) }
    audioRef.current = audio
    setPlaying(true)

    // Moves a little line across the waveform as the song plays, so it's
    // obvious how far into the clip playback currently is.
    playheadTimerRef.current = setInterval(() => {
      setPlayheadPct(((audio.currentTime - start) / duration) * 100)
    }, 50)
  }

  const pxToSeconds = (px: number) => {
    const width = trackRef.current?.getBoundingClientRect().width || 1
    return (px / width) * CLIP_LENGTH
  }

  const beginDrag = (mode: 'left' | 'right' | 'move') => (e: React.PointerEvent) => {
    e.stopPropagation()
    stopAudio()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { mode, startX: e.clientX, origStart: start, origDuration: duration }
  }

  const onDragMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const deltaSec = pxToSeconds(e.clientX - drag.current.startX)
    const { mode, origStart, origDuration } = drag.current

    if (mode === 'left') {
      const newStart = Math.max(0, Math.min(origStart + deltaSec, origStart + origDuration - 1))
      setStart(newStart)
      setDuration(origStart + origDuration - newStart)
    } else if (mode === 'right') {
      const newDuration = Math.max(1, Math.min(origDuration + deltaSec, CLIP_LENGTH - origStart, sceneDuration))
      setDuration(newDuration)
    } else {
      const newStart = Math.max(0, Math.min(origStart + deltaSec, CLIP_LENGTH - origDuration))
      setStart(newStart)
    }
  }

  const endDrag = () => { drag.current = null }

  const leftPct = (start / CLIP_LENGTH) * 100
  const widthPct = (duration / CLIP_LENGTH) * 100

  return (
    // Small, compact, floats near the bottom (above the timeline/footer)
    // instead of a big banner - closer to how Facebook/Instagram do it.
    <div className="fixed bottom-24 left-4 right-4 z-[110] bg-[#1c1c1e] rounded-2xl shadow-2xl px-3 py-2.5 space-y-2">
      <p className="text-white text-xs font-medium truncate px-1">{song.title} &middot; {song.artist}</p>
      <div className="flex items-center gap-2">
        <button
          onClick={togglePreview}
          className="h-9 w-9 shrink-0 rounded-full bg-pink-500 flex items-center justify-center text-white"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
        </button>

        {/* Compact waveform + trim window */}
        <div ref={trackRef} className="relative flex-1 h-9 rounded-lg bg-black/40 overflow-hidden touch-none" onPointerMove={onDragMove} onPointerUp={endDrag}>
          {/* Waveform bars */}
          <div className="absolute inset-0 flex items-center justify-between px-1 gap-[1.5px]">
            {BAR_HEIGHTS.map((h, i) => (
              <span key={i} className="flex-1 bg-white/25 rounded-full" style={{ height: `${h}%` }} />
            ))}
          </div>
          {/* Trim window */}
          <div
            onPointerDown={beginDrag('move')}
            className="absolute top-0 bottom-0 bg-pink-500/30 border-y-2 border-pink-500 cursor-grab active:cursor-grabbing"
            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
          >
            <div onPointerDown={beginDrag('left')} className="absolute left-0 top-0 bottom-0 w-2.5 -ml-1.5 bg-pink-500 rounded-l-sm cursor-ew-resize" />
            <div onPointerDown={beginDrag('right')} className="absolute right-0 top-0 bottom-0 w-2.5 -mr-1.5 bg-pink-500 rounded-r-sm cursor-ew-resize" />
            {/* Playhead - shows exactly how far playback has gotten */}
            {playing && (
              <div
                className="absolute top-0 bottom-0 w-[2px] bg-white shadow-[0_0_4px_rgba(255,255,255,0.9)]"
                style={{ left: `${Math.min(100, Math.max(0, playheadPct))}%` }}
              />
            )}
          </div>
        </div>

        <button
          onClick={() => { setStart(0); setDuration(Math.min(sceneDuration, CLIP_LENGTH)); stopAudio() }}
          className="h-9 w-9 shrink-0 rounded-full bg-white/10 flex items-center justify-center text-white"
          title="Reset"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <button
          onClick={() => { stopAudio(); onDone(start, duration) }}
          className="h-9 w-9 shrink-0 rounded-full bg-white flex items-center justify-center text-black"
          title="Done"
        >
          <Check className="h-4 w-4" />
        </button>
      </div>

      {/* Clear, explicit actions - easy to miss as icons alone, so these are
          plain labeled buttons. */}
      <div className="flex items-center gap-2 pt-0.5">
        <button
          onClick={() => { stopAudio(); onChangeSong() }}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white/10 text-white text-xs font-medium hover:bg-white/20 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Change Song
        </button>
        <button
          onClick={() => { stopAudio(); onRemove() }}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-500/15 text-red-400 text-xs font-medium hover:bg-red-500/25 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" /> {isGlobal ? 'Remove Song' : 'Remove From This Scene'}
        </button>
      </div>
    </div>
  )
}
