'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, ImagePlus, Loader2, Music2, Play, Type, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MusicPicker, SelectedSong } from './MusicPicker'
import { MusicAdjustModal } from './MusicAdjustModal'
import { FontPicker } from './FontPicker'
import { useCreateStory, DraftPhotoScene } from '@/lib/hooks/useStories'
import { StoryAudienceModal } from './StoryAudienceModal'
import type { GlobalMusic, StoryVisibility } from '@/lib/types/database.types'
import { clearStoryDraft, saveStoryDraft, type StoryDraftRecord } from '@/lib/utils/storyDraft'

interface PhotoStoryModalProps {
  userId: string
  onClose: () => void
  onBack: () => void
  initialFile?: File
  initialDraft?: StoryDraftRecord | null
}

const makeId = () => Math.random().toString(36).slice(2, 10)

export function PhotoStoryModal({ userId, onClose, onBack, initialFile, initialDraft }: PhotoStoryModalProps) {
  const [file, setFile] = useState<File | null>(initialFile || null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [overlayText, setOverlayText] = useState(initialDraft?.photo?.overlayText || '')
  const [overlayX, setOverlayX] = useState(initialDraft?.photo?.overlayX ?? 50)
  const [overlayY, setOverlayY] = useState(initialDraft?.photo?.overlayY ?? 50)
  const [font, setFont] = useState<string | null>(initialDraft?.photo?.font ?? null)
  const [showFontPicker, setShowFontPicker] = useState(false)
  const [showTextInput, setShowTextInput] = useState(false)
  const [showMusicPicker, setShowMusicPicker] = useState(false)
  const [song, setSong] = useState<SelectedSong | null>(initialDraft?.photo?.song ?? null)
  const [songOffset, setSongOffset] = useState(initialDraft?.photo?.songOffset ?? 0)
  const [showMusicAdjust, setShowMusicAdjust] = useState(false)
  const [storyDuration, setStoryDuration] = useState(initialDraft?.photo?.storyDuration ?? 5)
  const [textStart, setTextStart] = useState(initialDraft?.photo?.textStart ?? 0)
  const [textDuration, setTextDuration] = useState(initialDraft?.photo?.textDuration ?? 5)
  const [songStart, setSongStart] = useState(initialDraft?.photo?.songStart ?? 0)
  const [songDuration, setSongDuration] = useState(initialDraft?.photo?.songDuration ?? 5)
  const [showPreview, setShowPreview] = useState(false)
  const [previewElapsed, setPreviewElapsed] = useState(0)
  const previewAudioRef = useRef<HTMLAudioElement>(null)
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

  useEffect(() => {
    if (!showPreview) return
    setPreviewElapsed(0)
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000
      if (elapsed >= storyDuration) {
        setPreviewElapsed(storyDuration)
        setShowPreview(false)
        previewAudioRef.current?.pause()
        window.clearInterval(timer)
      } else setPreviewElapsed(elapsed)
    }, 100)
    return () => window.clearInterval(timer)
  }, [showPreview, storyDuration])
  useEffect(() => {
    const audio = previewAudioRef.current
    if (!audio || !song || !showPreview) {
      audio?.pause()
      return
    }

    const clipLength = Math.min(songDuration, storyDuration - songStart)
    const clipEnd = songStart + clipLength
    if (previewElapsed < songStart || previewElapsed >= clipEnd) {
      audio.pause()
      return
    }

    const targetTime = songOffset + (previewElapsed - songStart)
    if (Math.abs(audio.currentTime - targetTime) > 1.25) audio.currentTime = targetTime
    if (audio.paused) void audio.play().catch(() => {})
  }, [song, showPreview, previewElapsed, songOffset, songStart, songDuration, storyDuration])

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

  useEffect(() => {
    if (!file) return
    const draft: StoryDraftRecord = {
      userId, kind: 'photo', file, fileName: file.name, fileType: file.type, lastModified: file.lastModified,
      photo: { overlayText, overlayX, overlayY, font, song, storyDuration, textStart, textDuration, songStart, songDuration, songOffset },
      updatedAt: Date.now(),
    }
    const timer = window.setTimeout(() => { void saveStoryDraft(draft).catch(() => {}) }, 120)
    return () => window.clearTimeout(timer)
  }, [userId, file, overlayText, overlayX, overlayY, font, song, storyDuration, textStart, textDuration, songStart, songDuration, songOffset])

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
      start: songOffset,
      duration: Math.min(songDuration, storyDuration - songStart),
      timelineStart: songStart,
      source: song.source || 'Jamendo',
      licenseUrl: song.licenseUrl || undefined,
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
      await clearStoryDraft(userId).catch(() => {})
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
                {overlayText.trim() && <div className="absolute inset-y-0 rounded-sm bg-violet-500/90" style={{ left: `${(textStart / 60) * 100}%`, width: `${Math.max(1.5, (Math.min(textDuration, storyDuration - textStart) / 60) * 100)}%` }}>
                  {overlayText.trim() && <><span data-edge="start" className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize rounded-l-sm bg-violet-200/90" /><span data-edge="end" className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize rounded-r-sm bg-violet-200/90" /></>}
                </div>}
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
                {song && <div className="absolute inset-y-0 rounded-sm bg-emerald-500/90" style={{ left: `${(songStart / 60) * 100}%`, width: `${Math.max(1.5, (Math.min(songDuration, storyDuration - songStart) / 60) * 100)}%` }}>
                  {song && <><span data-edge="start" className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize rounded-l-sm bg-emerald-200/90" /><span data-edge="end" className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize rounded-r-sm bg-emerald-200/90" /></>}
                </div>}
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
              <button onClick={() => setShowMusicAdjust(true)} className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted">Adjust</button>
              <button onClick={() => setShowMusicPicker(true)} className="rounded-lg px-2 py-1 text-xs font-medium hover:bg-muted">Change</button>
              <button onClick={() => { setSong(null); setSongOffset(0) }} aria-label="Remove song" className="rounded-lg p-2 hover:bg-muted"><X className="h-4 w-4" /></button>
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
            <Button type="button" variant="outline" className="shrink-0" onClick={() => {
              setPreviewElapsed(0)
              setShowPreview(true)
            }}><Play className="mr-1.5 h-4 w-4" /> Preview</Button>
            <Button className="min-w-0 flex-1 px-3" disabled={createPhotoStory.isPending} onClick={onShare}>
              {createPhotoStory.isPending ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Publishing…</> : 'Share'}
            </Button>
          </div>
          <input ref={replaceInput} type="file" accept="image/*" className="hidden" onChange={(e) => { const next = e.target.files?.[0]; e.currentTarget.value = ''; if (next && next.type.startsWith('image/')) { setFile(next); setError(null) } else if (next) setError('Please choose a supported image file.') }} />
          {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        </div>
      </main>

      {song && <audio ref={previewAudioRef} src={song.previewUrl} preload="metadata" className="hidden" />}
      {showPreview && previewUrl && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/95 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Story preview">
          <button onClick={() => { setShowPreview(false); previewAudioRef.current?.pause() }} aria-label="Close story preview" className="absolute right-4 top-4 z-10 rounded-full bg-white/15 p-2 text-white hover:bg-white/25"><X className="h-5 w-5" /></button>
          <div className="relative flex h-[min(82dvh,760px)] aspect-[9/16] max-w-full items-center justify-center overflow-hidden rounded-2xl bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Story preview" className="h-full w-full object-contain" />
            {overlayText.trim() && previewElapsed >= textStart && previewElapsed < textStart + Math.min(textDuration, storyDuration - textStart) && (
              <div className="absolute max-w-[86%] rounded-lg px-2 py-1 text-center text-xl font-bold text-white [text-shadow:0_2px_8px_rgba(0,0,0,0.9)]" style={{ left: overlayX + '%', top: overlayY + '%', transform: 'translate(-50%, -50%)', fontFamily: font ? "'" + font + "', sans-serif" : undefined }}>{overlayText}</div>
            )}
            <div className="absolute inset-x-0 top-0 h-1 bg-white/30"><div className="h-full bg-white" style={{ width: (Math.min(100, (previewElapsed / storyDuration) * 100)) + '%' }} /></div>
            {song && previewElapsed >= songStart && previewElapsed < songStart + Math.min(songDuration, storyDuration - songStart) && <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2 rounded-xl bg-black/60 p-2 text-white"><Music2 className="h-4 w-4 shrink-0" /><div className="min-w-0"><p className="truncate text-xs font-semibold">{song.title}</p><p className="truncate text-[10px] opacity-80">{song.artist}</p></div></div>}
          </div>
        </div>
      )}
      {showMusicPicker && <MusicPicker onSelect={(selected) => { setSong(selected); setSongOffset(0); setSongStart(0); setSongDuration(Math.min(5, storyDuration, selected.duration || storyDuration)); setShowMusicPicker(false) }} onClose={() => setShowMusicPicker(false)} />}
      {showMusicAdjust && song && <MusicAdjustModal song={song} initialStart={songOffset} initialDuration={Math.min(songDuration, storyDuration - songStart)} maxDuration={Math.max(1, storyDuration - songStart)} onClose={() => setShowMusicAdjust(false)} onApply={(sourceStart, clipDuration) => { setSongOffset(sourceStart); setSongDuration(clipDuration); setShowMusicAdjust(false) }} />}
      {showFontPicker && <FontPicker currentFont={font || ''} onSelect={(value) => setFont(value || null)} onCancel={() => setShowFontPicker(false)} onDone={() => setShowFontPicker(false)} />}
      {showAudience && <StoryAudienceModal userId={userId} isPending={createPhotoStory.isPending} confirmLabel="Confirm Share" onClose={() => setShowAudience(false)} onConfirm={confirmShare} />}
    </div>
  )
}
