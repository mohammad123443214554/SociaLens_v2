'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Music2, Pause, Play, RotateCcw, X } from 'lucide-react'
import type { SelectedSong } from './MusicPicker'

interface MusicAdjustModalProps {
  song: SelectedSong
  initialStart: number
  initialDuration: number
  maxDuration: number
  onClose: () => void
  onApply: (sourceStart: number, clipDuration: number) => void
}

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds))
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
}

export function MusicAdjustModal({
  song,
  initialStart,
  initialDuration,
  maxDuration,
  onClose,
  onApply,
}: MusicAdjustModalProps) {
  const trackDuration = Math.max(1, song.duration || 1)
  const clipLimit = Math.max(1, Math.min(trackDuration, maxDuration))
  const [clipDuration, setClipDuration] = useState(Math.max(1, Math.min(initialDuration, clipLimit)))
  const [sourceStart, setSourceStart] = useState(Math.max(0, Math.min(initialStart, trackDuration - clipDuration)))
  const [playing, setPlaying] = useState(false)
  const [playhead, setPlayhead] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const timelineRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ edge: 'move' | 'start' | 'end'; pointerX: number; start: number; duration: number } | null>(null)


  const stopPreview = () => {
    audioRef.current?.pause()
    setPlaying(false)
  }

  useEffect(() => {
    const audio = new Audio(song.previewUrl)
    audio.preload = 'metadata'
    audioRef.current = audio
    const sync = () => {
      const relative = audio.currentTime - sourceStart
      setPlayhead(Math.max(0, Math.min(clipDuration, relative)))
      if (relative >= clipDuration) {
        audio.pause()
        setPlaying(false)
        audio.currentTime = sourceStart
      }
    }
    audio.addEventListener('timeupdate', sync)
    audio.addEventListener('ended', () => setPlaying(false))
    return () => {
      audio.pause()
      audio.removeEventListener('timeupdate', sync)
      audioRef.current = null
    }
  }, [song.previewUrl, sourceStart, clipDuration])

  const togglePreview = async () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      setPlaying(false)
      return
    }
    try {
      if (audio.currentTime < sourceStart || audio.currentTime >= sourceStart + clipDuration) audio.currentTime = sourceStart
      await audio.play()
      setPlaying(true)
    } catch {
      setPlaying(false)
    }
  }

  const beginTimelineAdjust = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (!target.closest('[data-song-segment]')) return
    const edge = (target.closest('[data-edge]')?.getAttribute('data-edge') as 'start' | 'end' | null) || 'move'
    dragRef.current = { edge, pointerX: event.clientX, start: sourceStart, duration: clipDuration }
    event.currentTarget.setPointerCapture(event.pointerId)
    stopPreview()
    event.preventDefault()
  }

  const moveTimelineAdjust = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    const timeline = timelineRef.current
    if (!drag || !timeline) return
    const delta = ((event.clientX - drag.pointerX) / Math.max(1, timeline.getBoundingClientRect().width)) * trackDuration
    if (drag.edge === 'move') {
      const nextStart = Math.max(0, Math.min(trackDuration - drag.duration, Math.round(drag.start + delta)))
      setSourceStart(nextStart)
    } else if (drag.edge === 'start') {
      const end = drag.start + drag.duration
      const nextStart = Math.max(Math.max(0, end - clipLimit), Math.min(end - 1, Math.round(drag.start + delta)))
      setSourceStart(nextStart)
      setClipDuration(end - nextStart)
    } else {
      const nextDuration = Math.max(1, Math.min(clipLimit, Math.round(drag.duration + delta)))
      setClipDuration(nextDuration)
      setSourceStart(Math.min(drag.start, Math.max(0, trackDuration - nextDuration)))
    }
    setPlayhead(0)
  }

  const endTimelineAdjust = () => { dragRef.current = null }

  const reset = () => {
    stopPreview()
    setSourceStart(0)
    setClipDuration(clipLimit)
    setPlayhead(0)
  }

  return (
    <div className="fixed inset-0 z-[160] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={() => { stopPreview(); onClose() }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Adjust song segment"
        className="w-full max-w-md rounded-t-2xl border border-border bg-card p-4 text-card-foreground shadow-2xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Adjust song</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Choose the exact part for your Story</p>
          </div>
          <button onClick={() => { stopPreview(); onClose() }} aria-label="Close adjust song" className="rounded-full p-2 hover:bg-muted"><X className="h-5 w-5" /></button>
        </header>

        <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-3">
          {song.artworkUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={song.artworkUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
          ) : <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted"><Music2 className="h-5 w-5" /></div>}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{song.title}</p>
            <p className="truncate text-xs text-muted-foreground">{song.artist}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Track length {formatTime(trackDuration)}</p>
          </div>
          <button onClick={() => void togglePreview()} aria-label={playing ? 'Pause selected segment' : 'Preview selected segment'} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
          </button>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-sm font-medium">Drag the strip to choose the song part</p>
          <div className="overflow-hidden rounded-lg border border-border bg-muted p-2">
            <div
              ref={timelineRef}
              onPointerDown={beginTimelineAdjust}
              onPointerMove={moveTimelineAdjust}
              onPointerUp={endTimelineAdjust}
              onPointerCancel={endTimelineAdjust}
              className="relative h-12 touch-none rounded-md bg-muted-foreground/10"
              aria-label="Adjust song segment: drag the strip to move it and drag either edge to resize"
            >
              <div
                data-song-segment
                className="absolute inset-y-0 cursor-grab rounded-md border border-pink-500 bg-pink-500/25 active:cursor-grabbing"
                style={{ left: `${(sourceStart / trackDuration) * 100}%`, width: `${(clipDuration / trackDuration) * 100}%`, minWidth: '8px' }}
              >
                <div data-edge="start" className="absolute inset-y-0 left-0 z-10 w-3 cursor-ew-resize rounded-l bg-pink-500" />
                <div data-edge="end" className="absolute inset-y-0 right-0 z-10 w-3 cursor-ew-resize rounded-r bg-pink-500" />
                {playing && <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-foreground" style={{ left: `${Math.min(100, (playhead / clipDuration) * 100)}%` }} />}
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>{formatTime(sourceStart)}</span>
              <span className="font-medium text-foreground">{formatTime(clipDuration)} selected</span>
              <span>{formatTime(sourceStart + clipDuration)}</span>
            </div>
          </div>
        </div>

        <footer className="mt-5 flex gap-2">
          <button onClick={reset} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-3 text-sm hover:bg-muted"><RotateCcw className="h-4 w-4" /> Reset</button>
          <button onClick={() => { stopPreview(); onClose() }} className="min-h-11 flex-1 rounded-xl border border-border text-sm font-medium hover:bg-muted">Cancel</button>
          <button onClick={() => { stopPreview(); onApply(sourceStart, clipDuration) }} className="min-h-11 flex-1 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground"><Check className="mr-1.5 inline h-4 w-4" /> Apply</button>
        </footer>
      </section>
    </div>
  )
}
