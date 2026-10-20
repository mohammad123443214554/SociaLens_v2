'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, ImagePlus, Loader2, Music2, Type, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MusicPicker, SelectedSong } from './MusicPicker'
import { FontPicker } from './FontPicker'
import { useCreateStory, DraftPhotoScene } from '@/lib/hooks/useStories'
import { StoryAudienceModal } from './StoryAudienceModal'
import type { GlobalMusic, StoryVisibility } from '@/lib/types/database.types'

interface PhotoStoryModalProps {
  userId: string
  onClose: () => void
  onBack: () => void
  initialFile?: File
}

const makeId = () => Math.random().toString(36).slice(2, 10)

export function PhotoStoryModal({ userId, onClose, onBack, initialFile }: PhotoStoryModalProps) {
  const [file, setFile] = useState<File | null>(initialFile || null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [overlayText, setOverlayText] = useState('')
  const [overlayX, setOverlayX] = useState(50)
  const [overlayY, setOverlayY] = useState(50)
  const [font, setFont] = useState<string | null>(null)
  const [showFontPicker, setShowFontPicker] = useState(false)
  const [showTextInput, setShowTextInput] = useState(false)
  const [showMusicPicker, setShowMusicPicker] = useState(false)
  const [song, setSong] = useState<SelectedSong | null>(null)
  const [showAudience, setShowAudience] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const replaceInput = useRef<HTMLInputElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const { createPhotoStory } = useCreateStory()

  useEffect(() => {
    if (!file) { setPreviewUrl(null); return }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const onTextPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onTextPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current || !stageRef.current) return
    const rect = stageRef.current.getBoundingClientRect()
    setOverlayX(Math.min(92, Math.max(8, ((event.clientX - rect.left) / rect.width) * 100)))
    setOverlayY(Math.min(92, Math.max(8, ((event.clientY - rect.top) / rect.height) * 100)))
  }
  const onShare = () => {
    setError(null)
    if (!file) { setError('Choose a photo before sharing your story.'); return }
    setShowAudience(true)
  }

  const confirmShare = async (visibility: StoryVisibility, selectedIds: string[]) => {
    if (!file || createPhotoStory.isPending) return
    const scene: DraftPhotoScene = {
      id: makeId(),
      file,
      duration: 5,
      overlayX,
      overlayY,
      ...(overlayText.trim() ? { overlayText: overlayText.trim(), overlayTextColor: '#ffffff', overlayFontFamily: font || undefined } : {}),
    }
    const globalMusic: GlobalMusic | null = song ? {
      url: song.previewUrl,
      title: song.title,
      artist: song.artist,
      artworkUrl: song.artworkUrl,
      start: 0,
      duration: 5,
    } : null
    try {
      await createPhotoStory.mutateAsync({
        userId,
        scenes: [scene],
        globalMusic,
        globalFont: font,
        visibility,
        visibilitySelectedIds: selectedIds,
      })
      setShowAudience(false)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? 'Could not publish your story: ' + cause.message : 'Could not publish your story. Please try again.')
    }
  }

  if (!file || !previewUrl) {
    return (
      <div className="fixed inset-0 z-[120] flex items-center justify-center bg-background p-5 text-foreground">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Choose a photo</h2>
            <button aria-label="Close" onClick={onClose} className="rounded-full p-2 hover:bg-muted"><X className="h-5 w-5" /></button>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">Select a photo to preview your story.</p>
          <Button className="mt-4 w-full" onClick={() => replaceInput.current?.click()}><ImagePlus className="mr-2 h-4 w-4" /> Upload photo</Button>
          <input ref={replaceInput} type="file" accept="image/*" className="hidden" onChange={(e) => { const next = e.target.files?.[0]; e.currentTarget.value = ''; if (next && next.type.startsWith('image/')) setFile(next); else if (next) setError('Please choose a supported image file.') }} />
          {error && <p role="alert" className="mt-3 text-sm text-red-500">{error}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[120] flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-3 sm:px-5">
        <button onClick={onBack} aria-label="Back to story upload choices" className="rounded-full p-2 hover:bg-muted"><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="text-sm font-semibold sm:text-base">Photo story</h1>
        <button onClick={onClose} aria-label="Close story creator" className="rounded-full p-2 hover:bg-muted"><X className="h-5 w-5" /></button>
      </header>

      <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-auto px-3 py-4 sm:px-6">
        <div className="relative flex min-h-0 max-h-[calc(100dvh-190px)] aspect-[9/16] w-auto max-w-full items-center justify-center overflow-hidden rounded-2xl bg-black shadow-xl" ref={stageRef}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Photo story preview" className="block h-full w-full object-contain" />
          {overlayText.trim() && (
            <div
              onPointerDown={onTextPointerDown}
              onPointerMove={onTextPointerMove}
              onPointerUp={() => { dragging.current = false }}
              onPointerCancel={() => { dragging.current = false }}
              className="absolute max-w-[86%] cursor-move select-none touch-none rounded-lg px-2 py-1 text-center text-xl font-bold text-white [text-shadow:0_2px_8px_rgba(0,0,0,0.9)]"
              style={{ left: overlayX + '%', top: overlayY + '%', transform: 'translate(-50%, -50%)', fontFamily: font ? "'" + font + "', sans-serif" : undefined }}
              aria-label="Story text overlay; drag to reposition"
            >
              {overlayText}
            </div>
          )}
        </div>

        <div className="w-full max-w-lg space-y-3">
          {song && (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={song.artworkUrl} alt="" className="h-11 w-11 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{song.title}</p>
                <p className="truncate text-xs text-muted-foreground">{song.artist}</p>
              </div>
              <button onClick={() => setShowMusicPicker(true)} className="rounded-lg px-2 py-1 text-xs font-medium hover:bg-muted">Change</button>
              <button onClick={() => setSong(null)} aria-label="Remove song" className="rounded-lg p-2 hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
          )}
          {showTextInput && (
            <div className="flex gap-2">
              <input autoFocus value={overlayText} onChange={(e) => setOverlayText(e.target.value)} maxLength={150} placeholder="Write something..." className="min-w-0 flex-1 rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-pink-500" />
              <button onClick={() => { setOverlayText(''); setShowTextInput(false) }} aria-label="Remove text" className="rounded-xl border border-border px-3 hover:bg-muted"><X className="h-4 w-4" /></button>
              <button onClick={() => setShowTextInput(false)} aria-label="Done editing text" className="rounded-xl bg-muted px-3"><Check className="h-4 w-4" /></button>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => setShowMusicPicker(true)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-2 text-sm font-medium hover:bg-muted"><Music2 className="h-4 w-4" /> {song ? 'Change song' : 'Add Song'}</button>
            <button onClick={() => setShowTextInput(true)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-2 text-sm font-medium hover:bg-muted"><Type className="h-4 w-4" /> Add Text</button>
            <button onClick={() => setShowFontPicker(true)} disabled={!overlayText.trim()} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-2 text-sm font-medium hover:bg-muted disabled:opacity-40"><Type className="h-4 w-4" /> Font</button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="shrink-0" onClick={() => replaceInput.current?.click()}><ImagePlus className="mr-2 h-4 w-4" /> Replace</Button>
            <Button className="flex-1" disabled={createPhotoStory.isPending} onClick={onShare}>
              {createPhotoStory.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Publishing…</> : 'Share'}
            </Button>
          </div>
          <input ref={replaceInput} type="file" accept="image/*" className="hidden" onChange={(e) => { const next = e.target.files?.[0]; e.currentTarget.value = ''; if (next && next.type.startsWith('image/')) { setFile(next); setError(null) } else if (next) setError('Please choose a supported image file.') }} />
          {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        </div>
      </main>

      {showMusicPicker && <MusicPicker onSelect={(selected) => { setSong(selected); setShowMusicPicker(false) }} onClose={() => setShowMusicPicker(false)} />}
      {showFontPicker && <FontPicker currentFont={font || ''} onSelect={(value) => setFont(value || null)} onCancel={() => setShowFontPicker(false)} onDone={() => setShowFontPicker(false)} />}
      {showAudience && <StoryAudienceModal userId={userId} isPending={createPhotoStory.isPending} confirmLabel="Confirm Share" onClose={() => setShowAudience(false)} onConfirm={confirmShare} />}
    </div>
  )
}
