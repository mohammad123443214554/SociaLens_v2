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
  const [storyDuration, setStoryDuration] = useState(5)
  const [textStart, setTextStart] = useState(0)
  const [textDuration, setTextDuration] = useState(5)
  const [songStart, setSongStart] = useState(0)
  const [songDuration, setSongDuration] = useState(5)
  const timelineDrag = useRef<{ kind: 'photo' | 'text' | 'song'; edge: 'start' | 'end' | 'move'; x: number; start: number; duration: number } | null>(null)
  const timelineRowRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const beginTimelineDrag = (kind: 'photo' | 'text' | 'song', event: React.PointerEvent<HTMLDivElement>) => {
    if (kind === 'text' && !overlayText.trim()) return
    if (kind === 'song' && !song) return
    const row = event.currentTarget
    const edge = kind === 'photo' ? 'end' : ((event.target as HTMLElement).closest('[data-edge]')?.getAttribute('data-edge') as 'start' | 'end' | null) || 'move'
    timelineDrag.current = {
      kind, edge, x: event.clientX,
      start: kind === 'text' ? textStart : kind === 'song' ? songStart : 0,
      duration: kind === 'text' ? textDuration : kind === 'song' ? songDuration : storyDuration,
    }
    row.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const moveTimelineDrag = (kind: 'photo' | 'text' | 'song', event: React.PointerEvent<HTMLDivElement>) => {
    const drag = timelineDrag.current
    const row = timelineRowRefs.current[kind]
    if (!drag || drag.kind !== kind || !row) return
    const delta = ((event.clientX - drag.x) / row.getBoundingClientRect().width) * 60
    if (kind === 'photo') {
      const next = Math.max(5, Math.min(60, Math.round(drag.duration + delta)))
      setStoryDuration(next)
      setTextStart((value) => Math.min(value, next - 1))
      setTextDuration((value) => Math.min(value, next - Math.min(textStart, next - 1)))
      setSongStart((value) => Math.min(value, next - 1))
      setSongDuration((value) => Math.min(value, next - Math.min(songStart, next - 1)))
      return
    }
    const startSetter = kind === 'text' ? setTextStart : setSongStart
    const durationSetter = kind === 'text' ? setTextDuration : setSongDuration
    if (drag.edge === 'move') {
      startSetter(Math.max(0, Math.min(storyDuration - drag.duration, Math.round(drag.start + delta))))
    } else if (drag.edge === 'start') {
      const end = drag.start + drag.duration
      const nextStart = Math.max(0, Math.min(end - 1, Math.round(drag.start + delta)))
      startSetter(nextStart)
      durationSetter(end - nextStart)
    } else {
      durationSetter(Math.max(1, Math.min(storyDuration - drag.start, Math.round(drag.duration + delta))))
    }
  }

  const endTimelineDrag = () => { timelineDrag.current = null }
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
      duration: storyDuration,
      overlayX,
      overlayY,
      ...(overlayText.trim() ? { overlayText: overlayText.trim(), overlayTextColor: '#ffffff', overlayFontFamily: font || undefined, overlayStart: textStart, overlayDuration: Math.min(textDuration, storyDuration - textStart) } : {}),
    }
    const globalMusic: GlobalMusic | null = song ? {
      url: song.previewUrl,
      title: song.title,
      artist: song.artist,
      artworkUrl: song.artworkUrl,
      start: 0,
      duration: Math.min(songDuration, storyDuration - songStart),
      timelineStart: songStart,
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
        <div className="relative flex h-[min(62dvh,680px)] min-h-0 aspect-[9/16] w-auto max-w-full items-center justify-center overflow-hidden rounded-2xl bg-black shadow-xl" ref={stageRef}>
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
          <section aria-label="Story timeline" className="mx-auto box-border h-[121px] w-[min(652px,calc(100vw-24px))] shrink-0 overflow-hidden rounded-md border border-border bg-card px-[9px] py-[4px]">
            <div className="flex h-full w-full flex-col gap-[2px]">
              <div
                ref={(node) => { timelineRowRefs.current.text = node }}
                onPointerDown={(event) => beginTimelineDrag('text', event)}
                onPointerMove={(event) => moveTimelineDrag('text', event)}
                onPointerUp={endTimelineDrag}
                onPointerCancel={endTimelineDrag}
                className={`relative h-[27px] w-full shrink-0 touch-none overflow-hidden rounded-sm bg-muted ${overlayText.trim() ? 'cursor-grab' : 'cursor-default opacity-60'}`}
                aria-label="Text timeline strip"
              >
                <div className="absolute inset-y-0 rounded-sm bg-violet-500/90" style={{ left: `${(textStart / 60) * 100}%`, width: `${Math.max(overlayText.trim() ? 1.5 : 0, (Math.min(textDuration, storyDuration - textStart) / 60) * 100)}%` }}>
                  {overlayText.trim() && <><span data-edge="start" className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize rounded-l-sm bg-violet-200/90" /><span data-edge="end" className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize rounded-r-sm bg-violet-200/90" /></>}
                </div>
                <span className="pointer-events-none absolute inset-y-0 left-2 z-20 flex items-center text-[11px] font-semibold text-foreground drop-shadow-sm">Text</span>
              </div>
              <div
                ref={(node) => { timelineRowRefs.current.photo = node }}
                onPointerDown={(event) => beginTimelineDrag('photo', event)}
                onPointerMove={(event) => moveTimelineDrag('photo', event)}
                onPointerUp={endTimelineDrag}
                onPointerCancel={endTimelineDrag}
                className="relative h-[52px] w-full shrink-0 touch-none cursor-ew-resize overflow-hidden rounded-sm bg-muted"
                aria-label="Photo duration timeline strip"
              >
                <div className="absolute inset-y-0 left-0 rounded-sm bg-pink-500/90" style={{ width: `${(storyDuration / 60) * 100}%`, minWidth: '18px' }}>
                  <span data-edge="end" className="absolute inset-y-0 right-0 z-10 w-3 cursor-ew-resize rounded-r-sm border-l-2 border-white/80 bg-pink-200/90" />
                </div>
                <span className="pointer-events-none absolute inset-y-0 left-2 z-20 flex items-center text-xs font-semibold text-foreground drop-shadow-sm">Photo</span>
                <span className="pointer-events-none absolute inset-y-0 right-2 z-20 flex items-center rounded bg-black/65 px-1.5 text-[10px] font-medium text-white tabular-nums">{storyDuration >= 60 ? `${Math.floor(storyDuration / 60)}m ${storyDuration % 60}s` : `${storyDuration}s`}</span>
              </div>
              <div
                ref={(node) => { timelineRowRefs.current.song = node }}
                onPointerDown={(event) => beginTimelineDrag('song', event)}
                onPointerMove={(event) => moveTimelineDrag('song', event)}
                onPointerUp={endTimelineDrag}
                onPointerCancel={endTimelineDrag}
                className={`relative h-[27px] w-full shrink-0 touch-none overflow-hidden rounded-sm bg-muted ${song ? 'cursor-grab' : 'cursor-default opacity-60'}`}
                aria-label="Music timeline strip"
              >
                <div className="absolute inset-y-0 rounded-sm bg-emerald-500/90" style={{ left: `${(songStart / 60) * 100}%`, width: `${Math.max(song ? 1.5 : 0, (Math.min(songDuration, storyDuration - songStart) / 60) * 100)}%` }}>
                  {song && <><span data-edge="start" className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize rounded-l-sm bg-emerald-200/90" /><span data-edge="end" className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize rounded-r-sm bg-emerald-200/90" /></>}
                </div>
                <span className="pointer-events-none absolute inset-y-0 left-2 z-20 flex items-center text-[11px] font-semibold text-foreground drop-shadow-sm">Music</span>
              </div>
            </div>
          </section>
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

      {showMusicPicker && <MusicPicker onSelect={(selected) => { setSong(selected); setSongStart(0); setSongDuration(Math.min(5, storyDuration)); setShowMusicPicker(false) }} onClose={() => setShowMusicPicker(false)} />}
      {showFontPicker && <FontPicker currentFont={font || ''} onSelect={(value) => setFont(value || null)} onCancel={() => setShowFontPicker(false)} onDone={() => setShowFontPicker(false)} />}
      {showAudience && <StoryAudienceModal userId={userId} isPending={createPhotoStory.isPending} confirmLabel="Confirm Share" onClose={() => setShowAudience(false)} onConfirm={confirmShare} />}
    </div>
  )
}
