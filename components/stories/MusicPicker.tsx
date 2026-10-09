'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Search, Play, Pause, Music } from 'lucide-react'

export interface SelectedSong {
  title: string
  artist: string
  artworkUrl: string
  previewUrl: string
}

interface MusicResult {
  id: string
  title: string
  artist: string
  artworkUrl: string
  previewUrl: string
}

interface MusicPickerProps {
  onSelect: (song: SelectedSong) => void
  onClose: () => void
}

export function MusicPicker({ onSelect, onClose }: MusicPickerProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MusicResult[]>([])
  const [loading, setLoading] = useState(false)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!query.trim()) {
      setResults([])
      return
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/music/search?q=${encodeURIComponent(query.trim())}`)
        const data = await res.json()
        setResults(data.results || [])
      } catch {
        setResults([])
      }
      setLoading(false)
    }, 400)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  useEffect(() => {
    return () => { audioRef.current?.pause() }
  }, [])

  const togglePreview = (track: MusicResult) => {
    if (playingId === track.id) {
      audioRef.current?.pause()
      setPlayingId(null)
      return
    }

    audioRef.current?.pause()
    const audio = new Audio(track.previewUrl)
    audio.play().catch(() => {})
    audio.onended = () => setPlayingId(null)
    audioRef.current = audio
    setPlayingId(track.id)
  }

  const handleSelect = (track: MusicResult) => {
    audioRef.current?.pause()
    onSelect({
      title: track.title,
      artist: track.artist,
      artworkUrl: track.artworkUrl,
      previewUrl: track.previewUrl,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-card w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl h-[80vh] sm:h-[70vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <h2 className="font-bold text-lg">Add Music</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search box */}
        <div className="p-4 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search any song, artist..."
              className="w-full bg-muted rounded-full pl-9 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-pink-500/40"
            />
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {loading && (
            <p className="text-center text-sm text-muted-foreground py-8">Searching...</p>
          )}

          {!loading && query && results.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">No songs found. Try another search.</p>
          )}

          {!loading && !query && (
            <div className="text-center text-sm text-muted-foreground py-12 px-6">
              <Music className="h-10 w-10 mx-auto mb-2 opacity-40" />
              Search for any song from around the world to add to your story.
            </div>
          )}

          {results.map((track) => (
            <div
              key={track.id}
              className="flex items-center gap-3 p-2 rounded-xl hover:bg-accent transition-colors"
            >
              <button onClick={() => togglePreview(track)} className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={track.artworkUrl} alt={track.title} className="h-12 w-12 rounded-lg object-cover" />
                <div className="absolute inset-0 rounded-lg bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                  {playingId === track.id ? (
                    <Pause className="h-5 w-5 text-white" />
                  ) : (
                    <Play className="h-5 w-5 text-white" />
                  )}
                </div>
              </button>
              <div className="flex-1 min-w-0" onClick={() => handleSelect(track)} role="button">
                <p className="text-sm font-medium truncate">{track.title}</p>
                <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
              </div>
              <button
                onClick={() => handleSelect(track)}
                className="text-xs font-semibold text-pink-500 px-3 py-1.5 rounded-full border border-pink-500/40 hover:bg-pink-500/10 transition-colors shrink-0"
              >
                Use
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
