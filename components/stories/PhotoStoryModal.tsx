'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, ImagePlus, Loader2, MoreVertical, Music2, Play, RotateCw, Type, X, Copy, Trash2 } from 'lucide-react'
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
type StoryTextLayer = { id: string; text: string; x: number; y: number; scale: number; rotation: number; color: string; start: number; duration: number }
type SongStickerStyle = 'pill' | 'cover' | 'square' | 'vinyl' | 'waveform'
const SONG_STICKER_OPTIONS: { id: SongStickerStyle; label: string; description: string }[] = [
  { id: 'pill', label: 'Classic', description: 'Rounded music tag' },
  { id: 'cover', label: 'Cover bar', description: 'Artwork with title' },
  { id: 'square', label: 'Album card', description: 'Square artwork card' },
  { id: 'vinyl', label: 'Vinyl', description: 'Record-inspired tag' },
  { id: 'waveform', label: 'Waveform', description: 'Wide music strip' },
]

export function PhotoStoryModal({ userId, onClose, onBack, initialFile, initialDraft }: PhotoStoryModalProps) {
  const [file, setFile] = useState<File | null>(initialFile || null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [overlayText, setOverlayText] = useState(initialDraft?.photo?.overlayText || '')
  const [textLayers, setTextLayers] = useState<StoryTextLayer[]>(() => { const saved = (initialDraft?.photo as any)?.textLayers as StoryTextLayer[] | undefined; if (saved?.length) return saved.map(layer => ({ rotation: 0, color: '#ffffff', start: initialDraft?.photo?.textStart ?? 0, duration: initialDraft?.photo?.textDuration ?? 5, ...layer })); const oldText = initialDraft?.photo?.overlayText || ''; return oldText ? [{ id: makeId(), text: oldText, x: initialDraft?.photo?.overlayX ?? 50, y: initialDraft?.photo?.overlayY ?? 50, scale: 1, rotation: 0, color: '#ffffff', start: initialDraft?.photo?.textStart ?? 0, duration: initialDraft?.photo?.textDuration ?? 5 }] : [] })
  const [textDraft, setTextDraft] = useState('')
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)
  const [resizeDrag, setResizeDrag] = useState<{ id: string; startX: number; scale: number } | null>(null)
  const [rotateDrag, setRotateDrag] = useState<{ id: string; startAngle: number; rotation: number } | null>(null)
  const [showTextMenu, setShowTextMenu] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [colorDraft, setColorDraft] = useState('#ffffff')
  const [overlayX, setOverlayX] = useState(initialDraft?.photo?.overlayX ?? 50)
  const [overlayY, setOverlayY] = useState(initialDraft?.photo?.overlayY ?? 50)
  const [font, setFont] = useState<string | null>(initialDraft?.photo?.font ?? null)
  const [showFontPicker, setShowFontPicker] = useState(false)
  const [showTextInput, setShowTextInput] = useState(false)
  const [showMusicPicker, setShowMusicPicker] = useState(false)
  const [song, setSong] = useState<SelectedSong | null>(initialDraft?.photo?.song ?? null)
  const [songOffset, setSongOffset] = useState(initialDraft?.photo?.songOffset ?? 0)
  const [songStickerStyle, setSongStickerStyle] = useState<SongStickerStyle>((initialDraft?.photo as any)?.songStickerStyle || 'pill')
  const [songStickerX, setSongStickerX] = useState<number>((initialDraft?.photo as any)?.songStickerX ?? 50)
  const [songStickerY, setSongStickerY] = useState<number>((initialDraft?.photo as any)?.songStickerY ?? 82)
  const [songStickerScale, setSongStickerScale] = useState<number>((initialDraft?.photo as any)?.songStickerScale ?? 1)
  const [songStickerRotation, setSongStickerRotation] = useState<number>((initialDraft?.photo as any)?.songStickerRotation ?? 0)
  const songStickerDragging = useRef(false)
  const [showMusicAdjust, setShowMusicAdjust] = useState(false)
  const [storyDuration, setStoryDuration] = useState(initialDraft?.photo?.storyDuration ?? 5)
  const [textStart, setTextStart] = useState(initialDraft?.photo?.textStart ?? 0)
  const [textDuration, setTextDuration] = useState(initialDraft?.photo?.textDuration ?? 5)
  const [songStart, setSongStart] = useState(initialDraft?.photo?.songStart ?? 0)
  const [songDuration, setSongDuration] = useState(initialDraft?.photo?.songDuration ?? 5)
  const [showPreview, setShowPreview] = useState(false)
  const [previewElapsed, setPreviewElapsed] = useState(0)
  const previewAudioRef = useRef<HTMLAudioElement>(null)
  const timelineDrag = useRef<{ kind: 'photo' | 'text' | 'song'; edge: 'start' | 'end' | 'move'; x: number; start: number; duration: number; textId?: string } | null>(null)
  const timelineRowRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const beginTimelineDrag = (kind: 'photo' | 'text' | 'song', event: React.PointerEvent<HTMLDivElement>) => {
    const textId = kind === 'text' ? (event.target as HTMLElement).closest('[data-text-id]')?.getAttribute('data-text-id') || selectedTextId || textLayers[0]?.id : undefined
    const textLayer = textId ? textLayers.find(layer => layer.id === textId) : undefined
    if (kind === 'text' && !textLayer) return
    if (kind === 'song' && !song) return
    const row = event.currentTarget
    const edge = kind === 'photo' ? 'end' : ((event.target as HTMLElement).closest('[data-edge]')?.getAttribute('data-edge') as 'start' | 'end' | null) || 'move'
    timelineDrag.current = {
      kind, edge, x: event.clientX,
      start: kind === 'text' ? (textLayer?.start ?? textStart) : kind === 'song' ? songStart : 0,
      duration: kind === 'text' ? (textLayer?.duration ?? textDuration) : kind === 'song' ? songDuration : storyDuration,
      textId,
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
    const updateTiming = (start: number, duration: number) => {
      if (kind === 'text' && drag.textId) setTextLayers(items => items.map(layer => layer.id === drag.textId ? { ...layer, start, duration } : layer))
      else { (kind === 'text' ? setTextStart : setSongStart)(start); (kind === 'text' ? setTextDuration : setSongDuration)(duration) }
    }
    if (drag.edge === 'move') {
      updateTiming(Math.max(0, Math.min(storyDuration - drag.duration, Math.round(drag.start + delta))), drag.duration)
    } else if (drag.edge === 'start') {
      const end = drag.start + drag.duration
      const nextStart = Math.max(0, Math.min(end - 1, Math.round(drag.start + delta)))
      updateTiming(nextStart, end - nextStart)
    } else {
      updateTiming(drag.start, Math.max(1, Math.min(storyDuration - drag.start, Math.round(drag.duration + delta))))
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
      photo: { overlayText, overlayX, overlayY, font, textLayers, song, storyDuration, textStart, textDuration, songStart, songDuration, songOffset, songStickerStyle, songStickerX, songStickerY, songStickerScale, songStickerRotation },
      updatedAt: Date.now(),
    }
    const timer = window.setTimeout(() => { void saveStoryDraft(draft).catch(() => {}) }, 120)
    return () => window.clearTimeout(timer)
  }, [userId, file, overlayText, overlayX, overlayY, font, textLayers, song, storyDuration, textStart, textDuration, songStart, songDuration, songOffset, songStickerStyle, songStickerX, songStickerY, songStickerScale, songStickerRotation])

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
      ...(textLayers[0] ? { overlayText: textLayers[0].text, overlayTexts: textLayers.map(layer => ({ ...layer, start: layer.start, duration: Math.min(layer.duration, storyDuration - layer.start) })), overlayTextColor: textLayers[0].color, overlayFontFamily: font || undefined, overlayX: textLayers[0].x, overlayY: textLayers[0].y, overlayStart: textStart, overlayDuration: Math.min(textDuration, storyDuration - textStart) } : {}),
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
      stickerStyle: songStickerStyle,
      stickerX: songStickerX,
      stickerY: songStickerY,
      stickerScale: songStickerScale,
      stickerRotation: songStickerRotation,
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
        <div className="flex w-full max-w-3xl flex-col items-center justify-center gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="relative flex h-[min(62dvh,680px)] min-h-0 aspect-[9/16] w-auto max-w-full shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-black shadow-xl" ref={stageRef}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Photo story preview" className="block h-full w-full object-contain" />
          {textLayers.map(layer => (
            <div key={layer.id} onPointerDown={event => { setSelectedTextId(layer.id); dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { if (!dragging.current || !stageRef.current) return; const rect = stageRef.current.getBoundingClientRect(); const x = Math.min(92, Math.max(8, ((event.clientX - rect.left) / rect.width) * 100)); const y = Math.min(92, Math.max(8, ((event.clientY - rect.top) / rect.height) * 100)); setTextLayers(items => items.map(item => item.id === layer.id ? { ...item, x, y } : item)); setOverlayX(x); setOverlayY(y) }} onPointerUp={() => { dragging.current = false }} onPointerCancel={() => { dragging.current = false }} onClick={() => setSelectedTextId(layer.id)} className={"absolute max-w-[86%] cursor-move select-none touch-none rounded-sm px-2 py-1 text-center font-bold [text-shadow:0_2px_8px_rgba(0,0,0,0.9)] " + (selectedTextId === layer.id ? "outline outline-1 outline-white outline-offset-2" : "")} style={{ left: layer.x + '%', top: layer.y + '%', transform: 'translate(-50%, -50%) rotate(' + layer.rotation + 'deg)', fontSize: (20 * layer.scale) + 'px', color: layer.color, fontFamily: font ? "'" + font + "', sans-serif" : undefined }} aria-label="Story text; drag to move and resize">
              {layer.text}
              {selectedTextId === layer.id && <button type="button" aria-label="Text options" onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); setShowTextMenu(value => !value); setShowColorPicker(false) }} className="absolute -right-3 -top-8 flex h-6 w-6 items-center justify-center rounded-full border border-white bg-black/80 text-white shadow"><MoreVertical className="h-4 w-4" /></button>}
              {selectedTextId === layer.id && <button type="button" aria-label="Rotate text" title="Drag to rotate" onPointerDown={event => { event.stopPropagation(); const rect = stageRef.current?.getBoundingClientRect(); if (!rect) return; const centerX = rect.left + rect.width * layer.x / 100; const centerY = rect.top + rect.height * layer.y / 100; setRotateDrag({ id: layer.id, startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI, rotation: layer.rotation }); event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { event.stopPropagation(); if (!rotateDrag || rotateDrag.id !== layer.id || !stageRef.current) return; const rect = stageRef.current.getBoundingClientRect(); const centerX = rect.left + rect.width * layer.x / 100; const centerY = rect.top + rect.height * layer.y / 100; const angle = Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI; const rotation = rotateDrag.rotation + angle - rotateDrag.startAngle; setTextLayers(items => items.map(item => item.id === layer.id ? { ...item, rotation: Math.round(rotation) } : item)) }} onPointerUp={() => setRotateDrag(null)} onPointerCancel={() => setRotateDrag(null)} className="absolute -bottom-2 -left-2 flex h-4 w-4 touch-none items-center justify-center rounded-full border-2 border-white bg-blue-500 shadow"><RotateCw className="h-2.5 w-2.5 text-white" /></button>}
              {selectedTextId === layer.id && <button type="button" aria-label="Resize text" onPointerDown={event => { event.stopPropagation(); setResizeDrag({ id: layer.id, startX: event.clientX, scale: layer.scale }); event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { event.stopPropagation(); if (!resizeDrag || resizeDrag.id !== layer.id) return; const scale = Math.max(0.55, Math.min(3, resizeDrag.scale + (event.clientX - resizeDrag.startX) / 100)); setTextLayers(items => items.map(item => item.id === layer.id ? { ...item, scale } : item)) }} onPointerUp={() => setResizeDrag(null)} onPointerCancel={() => setResizeDrag(null)} className="absolute -bottom-2 -right-2 h-4 w-4 touch-none rounded-full border-2 border-white bg-pink-500 shadow" />}
            </div>
          ))}
          {song && (
            <div
              role="button"
              tabIndex={0}
              aria-label="Song sticker; drag to move it on your story"
              onPointerDown={event => { event.stopPropagation(); songStickerDragging.current = true; event.currentTarget.setPointerCapture(event.pointerId) }}
              onPointerMove={event => { if (!songStickerDragging.current || !stageRef.current) return; const rect = stageRef.current.getBoundingClientRect(); setSongStickerX(Math.min(90, Math.max(10, ((event.clientX - rect.left) / rect.width) * 100))); setSongStickerY(Math.min(92, Math.max(8, ((event.clientY - rect.top) / rect.height) * 100))) }}
              onPointerUp={() => { songStickerDragging.current = false }}
              onPointerCancel={() => { songStickerDragging.current = false }}
              onKeyDown={event => { if (event.key === 'ArrowLeft') setSongStickerX(x => Math.max(10, x - 1)); if (event.key === 'ArrowRight') setSongStickerX(x => Math.min(90, x + 1)); if (event.key === 'ArrowUp') setSongStickerY(y => Math.max(8, y - 1)); if (event.key === 'ArrowDown') setSongStickerY(y => Math.min(92, y + 1)) }}
              className="absolute z-20 max-w-[88%] cursor-move select-none touch-none"
              style={{ left: `${songStickerX}%`, top: `${songStickerY}%`, transform: `translate(-50%, -50%) rotate(${songStickerRotation}deg) scale(${songStickerScale})` }}
            >
              {songStickerStyle === 'pill' && <div className="flex max-w-full items-center gap-2 rounded-full bg-black/50 py-1.5 pl-1.5 pr-3 text-white shadow backdrop-blur-sm"><img src={song.artworkUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" /><div className="min-w-0"><p className="max-w-44 truncate text-xs font-semibold">{song.title}</p><p className="max-w-44 truncate text-[10px] opacity-80">{song.artist}</p></div></div>}
              {songStickerStyle === 'cover' && <div className="flex w-56 max-w-full items-center gap-2 rounded-lg border border-white/15 bg-black/70 p-2 text-white shadow-lg backdrop-blur"><img src={song.artworkUrl} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" /><div className="min-w-0"><p className="truncate text-sm font-bold">{song.title}</p><p className="truncate text-xs text-white/75">{song.artist}</p><div className="mt-1 h-1 rounded-full bg-white/25"><div className="h-full w-2/3 rounded-full bg-white/80" /></div></div></div>}
              {songStickerStyle === 'square' && <div className="w-36 overflow-hidden rounded-xl bg-white text-black shadow-xl"><img src={song.artworkUrl} alt="" className="aspect-square w-full object-cover" /><div className="px-2.5 py-2"><p className="truncate text-sm font-semibold">{song.title}</p><p className="truncate text-xs text-neutral-600">♫ {song.artist}</p></div></div>}
              {songStickerStyle === 'vinyl' && <div className="flex max-w-full items-center gap-2 rounded-xl bg-neutral-950/90 p-2 text-white shadow-xl"><div className="relative h-12 w-12 shrink-0 rounded-full border border-white/20 bg-gradient-to-br from-neutral-700 via-black to-neutral-900 p-1"><div className="h-full w-full rounded-full border border-white/15 p-1"><img src={song.artworkUrl} alt="" className="h-full w-full rounded-full object-cover" /></div></div><div className="min-w-0"><p className="max-w-40 truncate text-sm font-bold">{song.title}</p><p className="max-w-40 truncate text-xs text-white/70">{song.artist}</p><div className="mt-1 flex gap-[2px]">{Array.from({ length: 16 }, (_, i) => <span key={i} className="h-2 w-[2px] rounded-full bg-white/75" style={{ height: `${4 + (i * 7 % 11)}px` }} />)}</div></div></div>}
              {songStickerStyle === 'waveform' && <div className="flex w-60 max-w-full items-center gap-2 rounded-md bg-neutral-950/85 px-3 py-2 text-white shadow-lg"><img src={song.artworkUrl} alt="" className="h-10 w-10 shrink-0 rounded object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{song.title}</p><p className="truncate text-[10px] text-white/70">{song.artist}</p></div><div className="flex h-7 items-center gap-[2px]">{Array.from({ length: 13 }, (_, i) => <span key={i} className="w-[2px] rounded-full bg-white/80" style={{ height: `${5 + (i * 5 % 19)}px` }} />)}</div></div>}
            </div>
          )}
        </div>
        {song && (
          <aside aria-label="Song sticker styles" className="w-full max-w-[min(100%,28rem)] sm:w-40 sm:max-w-40">
            <p className="mb-2 text-center text-xs font-semibold text-muted-foreground sm:text-left">Song tag style</p>
            <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-col sm:overflow-visible">
              {SONG_STICKER_OPTIONS.map(option => (
                <button key={option.id} type="button" onClick={() => setSongStickerStyle(option.id)} aria-pressed={songStickerStyle === option.id} className={`min-w-28 shrink-0 rounded-xl border p-2 text-left transition-colors sm:min-w-0 ${songStickerStyle === option.id ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-border bg-card hover:bg-muted'}`}>
                  <span className="block truncate text-xs font-semibold">{option.label}</span>
                  <span className="mt-0.5 block text-[10px] leading-tight text-muted-foreground">{option.description}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 hidden text-[11px] text-muted-foreground sm:block">Choose a style, then drag the song tag anywhere on the story.</p>
          </aside>
        )}
        </div>

        <div className="w-full max-w-lg space-y-3">
          <section aria-label="Story timeline" style={{ height: 121 + Math.max(0, textLayers.length - 1) * 29 }} className="mx-auto box-border w-[min(652px,calc(100vw-24px))] shrink-0 overflow-hidden rounded-md border border-border bg-card px-[9px] py-[4px]">
            <div className="flex h-full w-full flex-col gap-[2px]">
              <div
                ref={(node) => { timelineRowRefs.current.text = node }}
                onPointerMove={(event) => moveTimelineDrag('text', event)}
                onPointerUp={endTimelineDrag}
                onPointerCancel={endTimelineDrag}
                className="flex w-full shrink-0 flex-col gap-[2px] touch-none"
                aria-label="Text timeline tracks"
              >
                {textLayers.length === 0 ? (
                  <div className="relative h-[27px] w-full shrink-0 overflow-hidden rounded-sm bg-muted">
                    <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-[11px] font-semibold text-foreground">Text</span>
                  </div>
                ) : textLayers.map((layer) => (
                  <div key={layer.id} className="relative h-[27px] w-full shrink-0 overflow-hidden rounded-sm bg-muted/70">
                    <div data-text-id={layer.id} onPointerDown={(event) => { setSelectedTextId(layer.id); beginTimelineDrag('text', event) }} className={"absolute inset-y-0 overflow-hidden rounded-sm bg-violet-500/90 " + (selectedTextId === layer.id ? "ring-1 ring-white" : "")} style={{ left: `${(layer.start / 60) * 100}%`, width: `${Math.max(4, (Math.min(layer.duration, storyDuration - layer.start) / 60) * 100)}%` }} title={layer.text}>
                      <span data-edge="start" className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize rounded-l-sm bg-violet-200/90" />
                      <span data-edge="end" className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize rounded-r-sm bg-violet-200/90" />
                      <span className="pointer-events-none absolute inset-0 flex items-center overflow-hidden px-2 text-[10px] font-semibold text-white whitespace-nowrap">{layer.text.length > 16 ? layer.text.slice(0, 16).trimEnd() + '...' : layer.text}</span>
                    </div>
                  </div>
                ))}
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
              <input autoFocus value={textDraft} onChange={(e) => setTextDraft(e.target.value)} maxLength={150} placeholder="Write something..." className="min-w-0 flex-1 rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-pink-500" />
              <button onClick={() => { setTextDraft(''); setShowTextInput(false) }} aria-label="Cancel adding text" className="rounded-xl border border-border px-3 hover:bg-muted"><X className="h-4 w-4" /></button>
              <button onClick={() => { const value = textDraft.trim(); if (value) { const id = makeId(); setTextLayers(items => [...items, { id, text: value, x: 50, y: 50, scale: 1, rotation: 0, color: '#ffffff', start: 0, duration: storyDuration }]); setSelectedTextId(id); if (!overlayText.trim()) setOverlayText(value) } setTextDraft(''); setShowTextInput(false) }} aria-label="Add text to story" className="rounded-xl bg-muted px-3"><Check className="h-4 w-4" /></button>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => setShowMusicPicker(true)} aria-label={song ? 'Change song' : 'Add song'} className="flex min-h-11 items-center justify-center gap-1 rounded-xl border border-border bg-card px-2 text-sm font-medium hover:bg-muted"><Music2 className="h-4 w-4 shrink-0" /><span className="sm:hidden">Change</span><span className="hidden sm:inline">{song ? 'Change song' : 'Add Song'}</span></button>
            <button onClick={() => { setTextDraft(''); setShowTextInput(true) }} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-2 text-sm font-medium hover:bg-muted"><Type className="h-4 w-4" /> Add Text</button>
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
            {textLayers.filter(layer => previewElapsed >= layer.start && previewElapsed < layer.start + Math.min(layer.duration, storyDuration - layer.start)).map(layer => (
              <div key={layer.id} className="absolute max-w-[86%] rounded-lg px-2 py-1 text-center font-bold [text-shadow:0_2px_8px_rgba(0,0,0,0.9)]" style={{ left: layer.x + '%', top: layer.y + '%', transform: 'translate(-50%, -50%) rotate(' + layer.rotation + 'deg)', fontSize: (20 * layer.scale) + 'px', color: layer.color, fontFamily: font ? "'" + font + "', sans-serif" : undefined }}>{layer.text}</div>
            ))}
            <div className="absolute inset-x-0 top-0 h-1 bg-white/30"><div className="h-full bg-white" style={{ width: (Math.min(100, (previewElapsed / storyDuration) * 100)) + '%' }} /></div>
            {song && previewElapsed >= songStart && previewElapsed < songStart + Math.min(songDuration, storyDuration - songStart) && <div className="absolute z-20 max-w-[88%]" style={{ left: `${songStickerX}%`, top: `${songStickerY}%`, transform: `translate(-50%, -50%) rotate(${songStickerRotation}deg) scale(${songStickerScale})` }}>{songStickerStyle === 'pill' ? <div className="flex items-center gap-2 rounded-full bg-black/50 py-1.5 pl-1.5 pr-3 text-white"><img src={song.artworkUrl} alt="" className="h-8 w-8 rounded-full object-cover" /><div className="min-w-0"><p className="max-w-44 truncate text-xs font-semibold">{song.title}</p><p className="max-w-44 truncate text-[10px] opacity-80">{song.artist}</p></div></div> : <div className="flex items-center gap-2 rounded-xl bg-black/80 p-2 text-white"><img src={song.artworkUrl} alt="" className="h-10 w-10 rounded object-cover" /><div className="min-w-0"><p className="max-w-40 truncate text-xs font-semibold">{song.title}</p><p className="max-w-40 truncate text-[10px] opacity-80">{song.artist}</p></div></div>}</div>}
          </div>
        </div>
      )}
      {showTextMenu && selectedTextId && <div className="fixed inset-0 z-[160] flex items-start justify-center bg-black/20 p-4 pt-[18vh]" onClick={() => setShowTextMenu(false)}><div role="dialog" aria-modal="true" aria-label="Text options" className="w-full max-w-xs rounded-2xl border border-border bg-card p-4 text-foreground shadow-xl" onClick={event => event.stopPropagation()}><h3 className="text-base font-semibold">Text options</h3><button className="mt-3 flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm hover:bg-muted" onClick={() => { const selected = textLayers.find(layer => layer.id === selectedTextId); setColorDraft(selected?.color || '#ffffff'); setShowTextMenu(false); setShowColorPicker(true) }}><span className="h-4 w-4 rounded-full border border-border" style={{ backgroundColor: textLayers.find(layer => layer.id === selectedTextId)?.color || '#ffffff' }} /> Color</button><button className="mt-2 flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm hover:bg-muted" onClick={() => { const selected = textLayers.find(layer => layer.id === selectedTextId); if (selected) { const id = makeId(); setTextLayers(items => { const index = items.findIndex(item => item.id === selected.id); const duplicate = { ...selected, id, x: Math.min(92, selected.x + 4), y: Math.min(92, selected.y + 4) }; const nextItems = [...items]; nextItems.splice(index + 1, 0, duplicate); return nextItems }); setSelectedTextId(id) } setShowTextMenu(false) }}><Copy className="h-4 w-4" /> Duplicate</button><button className="mt-2 flex w-full items-center gap-2 rounded-xl border border-red-500/40 px-3 py-2.5 text-sm text-red-500 hover:bg-red-500/10" onClick={() => { setTextLayers(items => items.filter(item => item.id !== selectedTextId)); setSelectedTextId(null); setShowTextMenu(false) }}><Trash2 className="h-4 w-4" /> Delete</button><button className="mt-3 w-full rounded-xl border border-border px-3 py-2.5 text-sm font-medium hover:bg-muted" onClick={() => setShowTextMenu(false)}>Cancel</button></div></div>}
      {showColorPicker && selectedTextId && <div className="fixed inset-0 z-[170] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Choose text color"><div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl"><h3 className="text-lg font-semibold">Custom text color</h3><p className="mt-1 text-sm text-muted-foreground">Choose a color or enter its HEX value.</p><div className="mt-4 flex items-center gap-3"><input aria-label="Choose text color" type="color" value={colorDraft} onChange={event => setColorDraft(event.target.value)} className="h-12 w-14 cursor-pointer rounded-lg border border-border bg-card p-1" /><input aria-label="HEX color" value={colorDraft} onChange={event => { const value = event.target.value; setColorDraft(value.startsWith('#') ? value : '#' + value) }} maxLength={7} className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm uppercase" /></div><div className="mt-4 flex gap-2"><button className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted" onClick={() => setShowColorPicker(false)}>Cancel</button><button className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50" disabled={!/^#[0-9a-fA-F]{6}$/.test(colorDraft)} onClick={() => { setTextLayers(items => items.map(layer => layer.id === selectedTextId ? { ...layer, color: colorDraft } : layer)); setShowColorPicker(false) }}>Apply color</button></div></div></div>}
      {showMusicPicker && <MusicPicker onSelect={(selected) => { setSong(selected); setSongOffset(0); setSongStart(0); setSongDuration(Math.min(5, storyDuration, selected.duration || storyDuration)); setShowMusicPicker(false) }} onClose={() => setShowMusicPicker(false)} />}
      {showMusicAdjust && song && <MusicAdjustModal song={song} initialStart={songOffset} initialDuration={Math.min(songDuration, storyDuration - songStart)} maxDuration={Math.max(1, storyDuration - songStart)} onClose={() => setShowMusicAdjust(false)} onApply={(sourceStart, clipDuration) => { setSongOffset(sourceStart); setSongDuration(clipDuration); setShowMusicAdjust(false) }} />}
      {showFontPicker && <FontPicker currentFont={font || ''} onSelect={(value) => setFont(value || null)} onCancel={() => setShowFontPicker(false)} onDone={() => setShowFontPicker(false)} />}
      {showAudience && <StoryAudienceModal userId={userId} isPending={createPhotoStory.isPending} confirmLabel="Confirm Share" onClose={() => setShowAudience(false)} onConfirm={confirmShare} />}
    </div>
  )
}
