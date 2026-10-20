'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Search, Play, Pause, Music, Clock, ExternalLink } from 'lucide-react'

export interface SelectedSong {
  title: string
  artist: string
  artworkUrl: string
  previewUrl: string
  duration?: number
  licenseUrl?: string
  source?: string
}

interface MusicResult extends SelectedSong {
  id: string
}

interface MusicPickerProps {
  onSelect: (song: SelectedSong) => void
  onClose: () => void
}

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds))
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
}

export function MusicPicker({ onSelect, onClose }: MusicPickerProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MusicResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestId = useRef(0)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const normalized = query.trim()
    if (!normalized) {
      setResults([])
      setError('')
      setLoading(false)
      return
    }

    const currentRequest = ++requestId.current
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      setError('')
      try {
        const response = await fetch(`/api/music/search?q=${encodeURIComponent(normalized)}`)
        const data = await response.json()
        if (currentRequest !== requestId.current) return
        if (!response.ok) {
          setResults([])
          setError(data.error || 'Music search failed. Please try again.')
        } else {
          setResults(Array.isArray(data.results) ? data.results : [])
        }
      } catch {
        if (currentRequest === requestId.current) {
          setResults([])
          setError('Could not connect to music search. Please try again.')
        }
      } finally {
        if (currentRequest === requestId.current) setLoading(false)
      }
    }, 350)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  useEffect(() => () => { audioRef.current?.pause() }, [])

  const togglePreview = (track: MusicResult) => {
    if (playingId === track.id) {
      audioRef.current?.pause()
      setPlayingId(null)
      return
    }
    audioRef.current?.pause()
    const audio = new Audio(track.previewUrl)
    audio.preload = 'none'
    void audio.play().catch(() => {
      setError('This track could not be played. Try another song.')
      setPlayingId(null)
    })
    audio.onended = () => setPlayingId(null)
    audio.onerror = () => {
      setPlayingId(null)
      setError('This track is currently unavailable. Try another song.')
    }
    audioRef.current = audio
    setPlayingId(track.id)
  }

  const handleSelect = (track: MusicResult) => {
    audioRef.current?.pause()
    setPlayingId(null)
    onSelect({
      title: track.title,
      artist: track.artist,
      artworkUrl: track.artworkUrl,
      previewUrl: track.previewUrl,
      duration: track.duration,
      licenseUrl: track.licenseUrl,
      source: track.source || 'Jamendo',
    })
  }

  return (
    <div className="fixed inset-0 z-[140] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="flex h-[82dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-card text-card-foreground sm:h-[min(720px,82dvh)] sm:max-w-lg sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Add music to story"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-border p-4">
          <div>
            <h2 className="text-lg font-semibold">Add music</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Full-length independent tracks from Jamendo</p>
          </div>
          <button onClick={onClose} aria-label="Close music picker" className="rounded-full p-2 hover:bg-muted"><X className="h-5 w-5" /></button>
        </header>

        <div className="shrink-0 p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search songs, artists, or genres..."
              className="w-full rounded-full border border-border bg-muted py-2.5 pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-pink-500/40"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {loading && <p className="py-8 text-center text-sm text-muted-foreground">Searching Jamendo…</p>}
          {!loading && error && <p role="alert" className="mx-3 my-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          {!loading && !error && query.trim() && results.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No playable tracks found. Try another search.</p>}
          {!query.trim() && (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              <Music className="mx-auto mb-3 h-10 w-10 opacity-40" />
              Search Jamendo’s independent music catalog. Track availability and usage terms can vary.
            </div>
          )}
          {results.map((track) => (
            <div key={track.id} className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-accent">
              <button onClick={() => togglePreview(track)} aria-label={playingId === track.id ? 'Pause track' : 'Preview track'} className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                {track.artworkUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={track.artworkUrl} alt="" className="h-full w-full object-cover" />
                ) : <Music className="m-auto h-5 w-5" />}
                <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white">
                  {playingId === track.id ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </span>
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{track.title}</p>
                <p className="truncate text-xs text-muted-foreground">{track.artist}</p>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {formatTime(track.duration || 0)}</span>
                  {track.licenseUrl && <a href={track.licenseUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="inline-flex items-center gap-1 underline underline-offset-2">Licence <ExternalLink className="h-3 w-3" /></a>}
                </div>
              </div>
              <button onClick={() => handleSelect(track)} className="shrink-0 rounded-full border border-pink-500/40 px-3 py-1.5 text-xs font-semibold text-pink-500 transition-colors hover:bg-pink-500/10">Use</button>
            </div>
          ))}
        </div>
        <footer className="shrink-0 border-t border-border px-4 py-2 text-center text-[10px] text-muted-foreground">
          Music provided by Jamendo. Check each track’s licence before publishing.
        </footer>
      </div>
    </div>
  )
}
