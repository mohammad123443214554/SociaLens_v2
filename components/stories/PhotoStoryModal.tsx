'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, AtSign, Check, ImagePlus, Link2, Loader2, MoreVertical, Music2, Play, RotateCw, Type, X, Copy, Trash2, Sticker, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MusicPicker, SelectedSong } from './MusicPicker'
import { MusicAdjustModal } from './MusicAdjustModal'
import { FontPicker } from './FontPicker'
import { StoryMentionPicker } from './StoryMentionPicker'
import { StoryStickerSidebar } from './StoryStickerSidebar'
import { StoryLinkModal } from './StoryLinkModal'
import { CountdownModal } from './CountdownModal'
import { CountdownSticker } from './CountdownSticker'
import { GIFPicker } from './GIFPicker'
import { EmojiPicker } from './EmojiPicker'
import { PollModal } from './PollModal'
import { PollSticker } from './PollSticker'
import { GIFSticker } from './GIFSticker'
import { useCreateStory, DraftPhotoScene } from '@/lib/hooks/useStories'
import { StoryAudienceModal } from './StoryAudienceModal'
import type { GlobalMusic, StoryVisibility, StoryCountdownOverlay, StoryGIFOverlay, StoryLinkOverlay, StoryMentionOverlay, StoryPollOverlay } from '@/lib/types/database.types'
import { clearStoryDraft, saveStoryDraft, type StoryDraftRecord } from '@/lib/utils/storyDraft'

interface PhotoStoryModalProps {
  userId: string
  onClose: () => void
  onBack: () => void
  initialFile?: File
  initialDraft?: StoryDraftRecord | null
}

const makeId = () => Math.random().toString(36).slice(2, 10)
type StoryTextLayer = { id: string; text: string; x: number; y: number; scale: number; rotation: number; color: string; fontFamily?: string | null; start: number; duration: number; isEmoji?: boolean }
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
  const [photoScale, setPhotoScale] = useState<number>(() => Math.max(1, Math.min(4, (initialDraft?.photo as any)?.photoScale ?? 1)))
  const [photoOffset, setPhotoOffset] = useState<{ x: number; y: number }>(() => ({ x: (initialDraft?.photo as any)?.photoOffsetX ?? 0, y: (initialDraft?.photo as any)?.photoOffsetY ?? 0 }))
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [photoDimensions, setPhotoDimensions] = useState<{ width: number; height: number } | null>(null)
  const [overlayText, setOverlayText] = useState(initialDraft?.photo?.overlayText || '')
  const [textLayers, setTextLayers] = useState<StoryTextLayer[]>(() => { const saved = (initialDraft?.photo as any)?.textLayers as StoryTextLayer[] | undefined; if (saved?.length) return saved.map(layer => ({ rotation: 0, color: '#ffffff', start: initialDraft?.photo?.textStart ?? 0, duration: initialDraft?.photo?.textDuration ?? 5, ...layer })); const oldText = initialDraft?.photo?.overlayText || ''; return oldText ? [{ id: makeId(), text: oldText, x: initialDraft?.photo?.overlayX ?? 50, y: initialDraft?.photo?.overlayY ?? 50, scale: 1, rotation: 0, color: '#ffffff', start: initialDraft?.photo?.textStart ?? 0, duration: initialDraft?.photo?.textDuration ?? 5 }] : [] })
  const [textDraft, setTextDraft] = useState('')
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)
  const [resizeDrag, setResizeDrag] = useState<{ id: string; startX: number; scale: number } | null>(null)
  const [rotateDrag, setRotateDrag] = useState<{ id: string; startAngle: number; rotation: number } | null>(null)
  const [showTextMenu, setShowTextMenu] = useState(false)
  const [showEmojiMenu, setShowEmojiMenu] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [colorDraft, setColorDraft] = useState('#ffffff')
  const [overlayX, setOverlayX] = useState(initialDraft?.photo?.overlayX ?? 50)
  const [overlayY, setOverlayY] = useState(initialDraft?.photo?.overlayY ?? 50)
  const [font, setFont] = useState<string | null>(initialDraft?.photo?.font ?? null)
  const [showFontPicker, setShowFontPicker] = useState(false)
  const [showMentionPicker, setShowMentionPicker] = useState(false)
  const [showStickerSidebar, setShowStickerSidebar] = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [showCountdownModal, setShowCountdownModal] = useState(false)
  const [showGIFPicker, setShowGIFPicker] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [pollStickers, setPollStickers] = useState<StoryPollOverlay[]>(() => (((initialDraft?.photo as any)?.pollStickers || []) as StoryPollOverlay[]))
  const [selectedPollId, setSelectedPollId] = useState<string | null>(null)
  const [showPollModal, setShowPollModal] = useState(false)
  const [showPollMenu, setShowPollMenu] = useState(false)
  const [showPollColorPicker, setShowPollColorPicker] = useState(false)
  const [pollColorDraft, setPollColorDraft] = useState('#ec4899')
  const [gifStickers, setGIFStickers] = useState<StoryGIFOverlay[]>(() => initialDraft?.photo?.gifStickers || [])
  const [selectedGIFId, setSelectedGIFId] = useState<string | null>(null)
  const [showGIFMenu, setShowGIFMenu] = useState(false)
  const [countdowns, setCountdowns] = useState<StoryCountdownOverlay[]>(() => initialDraft?.photo?.countdowns || [])
  const [selectedCountdownId, setSelectedCountdownId] = useState<string | null>(null)
  const [showCountdownMenu, setShowCountdownMenu] = useState(false)
  const countdownDragId = useRef<string | null>(null)
  const countdownResizeDrag = useRef<{ id: string; startX: number; scale: number } | null>(null)
  const countdownRotateDrag = useRef<{ id: string; startAngle: number; rotation: number; centerX: number; centerY: number } | null>(null)
  const [showLinkMenu, setShowLinkMenu] = useState(false)
  const [showLinkColorPicker, setShowLinkColorPicker] = useState(false)
  const [showCountdownColorPicker, setShowCountdownColorPicker] = useState(false)
  const [countdownColorDraft, setCountdownColorDraft] = useState('#7c3aed')
  const [showMentionMenu, setShowMentionMenu] = useState(false)
  const [showMentionColorPicker, setShowMentionColorPicker] = useState(false)
  const [selectedMentionId, setSelectedMentionId] = useState<string | null>(null)
  const [mentionColorDraft, setMentionColorDraft] = useState('#111827')
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null)
  const [linkColorDraft, setLinkColorDraft] = useState('#2563eb')
  const [linkOverlays, setLinkOverlays] = useState<StoryLinkOverlay[]>(() => ((initialDraft?.photo as any)?.links || []) as StoryLinkOverlay[])
  const linkDragId = useRef<string | null>(null)
  const linkResizeDrag = useRef<{ id: string; startX: number; scale: number } | null>(null)
  const linkRotateDrag = useRef<{ id: string; startAngle: number; rotation: number; centerX: number; centerY: number } | null>(null)
  const [mentionOverlays, setMentionOverlays] = useState<StoryMentionOverlay[]>(() => ((initialDraft?.photo as any)?.mentions || []) as StoryMentionOverlay[])
  const mentionDragId = useRef<string | null>(null)
  const mentionResizeDrag = useRef<{ id: string; startX: number; scale: number } | null>(null)
  const mentionRotateDrag = useRef<{ id: string; startAngle: number; rotation: number; centerX: number; centerY: number } | null>(null)
  const [showTextInput, setShowTextInput] = useState(false)
  const [showMusicPicker, setShowMusicPicker] = useState(false)
  const [song, setSong] = useState<SelectedSong | null>(initialDraft?.photo?.song ?? null)
  const [songOffset, setSongOffset] = useState(initialDraft?.photo?.songOffset ?? 0)
  const [storyDuration, setStoryDuration] = useState<number>((initialDraft?.photo as any)?.storyDuration ?? 15)
  const [textStart, setTextStart] = useState<number>((initialDraft?.photo as any)?.textStart ?? 0)
  const [textDuration, setTextDuration] = useState<number>((initialDraft?.photo as any)?.textDuration ?? 5)
  const [songStart, setSongStart] = useState<number>((initialDraft?.photo as any)?.songStart ?? 0)
  const [songDuration, setSongDuration] = useState<number>((initialDraft?.photo as any)?.songDuration ?? 5)
  const [showPreview, setShowPreview] = useState(false)
  const [exitAction, setExitAction] = useState<'close' | 'back' | null>(null)
  const [previewElapsed, setPreviewElapsed] = useState(0)
  const previewAudioRef = useRef<HTMLAudioElement>(null)
  const timelineDrag = useRef<{ kind: 'photo' | 'text' | 'song'; edge: 'start' | 'end' | 'move'; x: number; start: number; duration: number; textId?: string } | null>(null)
  const timelineRowRefs = useRef<Record<'photo' | 'text' | 'song', HTMLDivElement | null>>({ photo: null, text: null, song: null })
  const [songStickerStyle, setSongStickerStyle] = useState<SongStickerStyle>((initialDraft?.photo as any)?.songStickerStyle || 'pill')
  const [songStickerX, setSongStickerX] = useState<number>((initialDraft?.photo as any)?.songStickerX ?? 50)
  const [songStickerY, setSongStickerY] = useState<number>((initialDraft?.photo as any)?.songStickerY ?? 82)
  const [songStickerScale, setSongStickerScale] = useState<number>((initialDraft?.photo as any)?.songStickerScale ?? 1)
  const [songStickerRotation, setSongStickerRotation] = useState<number>((initialDraft?.photo as any)?.songStickerRotation ?? 0)
  const songStickerDragging = useRef(false)
  const [songStickerSelected, setSongStickerSelected] = useState(false)
  const songStickerResizeDrag = useRef<{ startX: number; scale: number } | null>(null)
  const songStickerRotateDrag = useRef<{ startAngle: number; rotation: number; centerX: number; centerY: number } | null>(null)
  const [showMusicAdjust, setShowMusicAdjust] = useState(false)
  const getSongAvailableDuration = (offset = songOffset) => Math.max(0, (song?.duration || 30) - offset)
  const getSongClipLimit = (start = songStart, offset = songOffset) => Math.max(1, Math.min(storyDuration - start, getSongAvailableDuration(offset)))

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
      duration: kind === 'text' ? (textLayer?.duration ?? textDuration) : kind === 'song' ? Math.min(songDuration, getSongClipLimit(songStart)) : storyDuration,
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
      else if (kind === 'song') { const safeStart = Math.max(0, Math.min(storyDuration - 1, start)); setSongStart(safeStart); setSongDuration(Math.min(duration, getSongClipLimit(safeStart))) }
      else { setTextStart(start); setTextDuration(duration) }
    }
    if (drag.edge === 'move') {
      updateTiming(Math.max(0, Math.min(storyDuration - drag.duration, Math.round(drag.start + delta))), drag.duration)
    } else if (drag.edge === 'start') {
      const end = drag.start + drag.duration
      const nextStart = Math.max(0, Math.min(end - 1, Math.round(drag.start + delta)))
      updateTiming(nextStart, end - nextStart)
    } else {
      updateTiming(drag.start, Math.max(1, Math.min(kind === 'song' ? getSongClipLimit(drag.start) : storyDuration - drag.start, Math.round(drag.duration + delta))))
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
  const gesturePointers = useRef(new Map<number, { x: number; y: number }>())
  const pinchStart = useRef<{ distance: number; scale: number } | null>(null)
  const photoDragStart = useRef<{ pointerId: number; x: number; y: number; offsetX: number; offsetY: number } | null>(null)
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
      photo: { overlayText, overlayX, overlayY, font, textLayers, mentions: mentionOverlays, links: linkOverlays, countdowns, gifStickers, pollStickers, song, storyDuration, textStart, textDuration, songStart, songDuration, songOffset, songStickerStyle, songStickerX, songStickerY, songStickerScale, songStickerRotation, photoScale, photoOffsetX: photoOffset.x, photoOffsetY: photoOffset.y },
      updatedAt: Date.now(),
    }
    const timer = window.setTimeout(() => { void saveStoryDraft(draft).catch(() => {}) }, 120)
    return () => window.clearTimeout(timer)
  }, [userId, file, overlayText, overlayX, overlayY, font, textLayers, song, storyDuration, textStart, textDuration, songStart, songDuration, songOffset, songStickerStyle, songStickerX, songStickerY, songStickerScale, songStickerRotation, mentionOverlays, linkOverlays, countdowns, gifStickers, pollStickers, photoScale, photoOffset])

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
  // The photo itself stays fixed; zoom is controlled only by the on-canvas buttons.
  const onStagePointerDown = (_event: React.PointerEvent<HTMLDivElement>) => {}
  const onStagePointerMove = (_event: React.PointerEvent<HTMLDivElement>) => {}
  const onStagePointerEnd = (_event: React.PointerEvent<HTMLDivElement>) => {}
  const onStageWheel = (_event: React.WheelEvent<HTMLDivElement>) => {}

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
      photoScale,
      photoOffsetX: photoOffset.x,
      photoOffsetY: photoOffset.y,
      overlayX,
      overlayY,
      mentions: mentionOverlays,
      links: linkOverlays,
      countdowns,
      gifStickers,
      pollStickers,
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
    <div className="fixed inset-0 z-[120] flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-3 sm:px-5">
        <button onClick={() => setExitAction('back')} aria-label="Back to story upload choices" className="rounded-full p-2 hover:bg-muted"><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="text-sm font-semibold sm:text-base">Photo story</h1>
        <button onClick={() => setExitAction('close')} aria-label="Close story creator" className="rounded-full p-2 hover:bg-muted"><X className="h-5 w-5" /></button>
      </header>

      <main className="min-h-0 flex-1 flex flex-col items-center justify-start gap-4 overflow-y-auto overscroll-y-contain px-3 py-4 touch-pan-y sm:justify-center sm:px-6">
        <div className="flex w-full max-w-5xl flex-col items-center justify-center gap-4 sm:flex-row sm:items-center sm:justify-center sm:gap-5 lg:gap-6">
        <div className="order-1 relative flex sm:order-2 min-h-0 max-w-full shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-black shadow-xl touch-none" style={photoDimensions ? { aspectRatio: `${photoDimensions.width} / ${photoDimensions.height}`, maxHeight: "min(62dvh, 680px)", width: `min(100%, ${Math.min(680, 680 * photoDimensions.width / photoDimensions.height)}px)` } : { height: "min(62dvh, 680px)", aspectRatio: "9 / 16" }} ref={stageRef} onPointerDown={onStagePointerDown} onPointerMove={onStagePointerMove} onPointerUp={onStagePointerEnd} onPointerCancel={onStagePointerEnd} onWheel={onStageWheel}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Photo story preview" data-photo-canvas-image onLoad={event => { const image = event.currentTarget; setPhotoDimensions({ width: image.naturalWidth || 9, height: image.naturalHeight || 16 }) }} draggable={false} className="block h-full w-full object-contain pointer-events-none transition-transform duration-150 ease-out" style={{ transform: `translate(${photoOffset.x}%, ${photoOffset.y}%) scale(${photoScale})`, transformOrigin: 'center center', willChange: photoScale > 1 || photoOffset.x !== 0 || photoOffset.y !== 0 ? 'transform' : undefined }} />
          <div className="absolute right-3 top-3 z-50 flex flex-col gap-2">
            <button type="button" aria-label="Zoom photo in" title="Zoom in" onClick={() => setPhotoScale(value => Math.min(4, Math.round((value + 0.25) * 100) / 100))} disabled={photoScale >= 4} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/50 bg-black/70 text-white shadow-lg disabled:opacity-40"><ZoomIn className="h-5 w-5" /></button>
            <button type="button" aria-label="Zoom photo out" title="Zoom out" onClick={() => setPhotoScale(value => Math.max(1, Math.round((value - 0.25) * 100) / 100))} disabled={photoScale <= 1} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/50 bg-black/70 text-white shadow-lg disabled:opacity-40"><ZoomOut className="h-5 w-5" /></button>
            <button type="button" aria-label="Reset photo zoom" title="Fit entire photo" onClick={() => { setPhotoScale(1); setPhotoOffset({x:0,y:0}) }} className="rounded-full border border-white/50 bg-black/70 px-2 py-1 text-[10px] font-semibold text-white shadow-lg">Fit</button>
          </div>
          {textLayers.map(layer => (
            <div key={layer.id} onPointerDown={event => { setSelectedTextId(layer.id); dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { if (!dragging.current || !stageRef.current) return; const rect = stageRef.current.getBoundingClientRect(); const x = Math.min(92, Math.max(8, ((event.clientX - rect.left) / rect.width) * 100)); const y = Math.min(92, Math.max(8, ((event.clientY - rect.top) / rect.height) * 100)); setTextLayers(items => items.map(item => item.id === layer.id ? { ...item, x, y } : item)); setOverlayX(x); setOverlayY(y) }} onPointerUp={() => { dragging.current = false }} onPointerCancel={() => { dragging.current = false }} onClick={() => setSelectedTextId(layer.id)} className={"absolute max-w-[86%] cursor-move select-none touch-none rounded-sm px-2 py-1 text-center font-bold [text-shadow:0_2px_8px_rgba(0,0,0,0.9)] " + (selectedTextId === layer.id ? "outline outline-1 outline-white outline-offset-2" : "")} style={{ left: layer.x + '%', top: layer.y + '%', transform: 'translate(-50%, -50%) rotate(' + layer.rotation + 'deg)', fontSize: (20 * layer.scale) + 'px', color: layer.color, fontFamily: layer.fontFamily !== undefined ? (layer.fontFamily ? "'" + layer.fontFamily + "', sans-serif" : undefined) : (font ? "'" + font + "', sans-serif" : undefined) }} aria-label="Story text; drag to move and resize">
              {layer.text}
              {selectedTextId === layer.id && <button type="button" aria-label="Text options" onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); (layer.isEmoji ? setShowEmojiMenu(true) : setShowTextMenu(value => !value)); setShowColorPicker(false) }} className="absolute -right-3 -top-8 flex h-6 w-6 items-center justify-center rounded-full border border-white bg-black/80 text-white shadow"><MoreVertical className="h-4 w-4" /></button>}
              {selectedTextId === layer.id && <button type="button" aria-label="Rotate text" title="Drag to rotate" onPointerDown={event => { event.stopPropagation(); const rect = stageRef.current?.getBoundingClientRect(); if (!rect) return; const centerX = rect.left + rect.width * layer.x / 100; const centerY = rect.top + rect.height * layer.y / 100; setRotateDrag({ id: layer.id, startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI, rotation: layer.rotation }); event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { event.stopPropagation(); if (!rotateDrag || rotateDrag.id !== layer.id || !stageRef.current) return; const rect = stageRef.current.getBoundingClientRect(); const centerX = rect.left + rect.width * layer.x / 100; const centerY = rect.top + rect.height * layer.y / 100; const angle = Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI; const rotation = rotateDrag.rotation + angle - rotateDrag.startAngle; setTextLayers(items => items.map(item => item.id === layer.id ? { ...item, rotation: Math.round(rotation) } : item)) }} onPointerUp={() => setRotateDrag(null)} onPointerCancel={() => setRotateDrag(null)} className="absolute -bottom-2 -left-2 flex h-4 w-4 touch-none items-center justify-center rounded-full border-2 border-white bg-blue-500 shadow"><RotateCw className="h-2.5 w-2.5 text-white" /></button>}
              {selectedTextId === layer.id && <button type="button" aria-label="Resize text" onPointerDown={event => { event.stopPropagation(); setResizeDrag({ id: layer.id, startX: event.clientX, scale: layer.scale }); event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { event.stopPropagation(); if (!resizeDrag || resizeDrag.id !== layer.id) return; const scale = Math.max(0.55, Math.min(3, resizeDrag.scale + (event.clientX - resizeDrag.startX) / 100)); setTextLayers(items => items.map(item => item.id === layer.id ? { ...item, scale } : item)) }} onPointerUp={() => setResizeDrag(null)} onPointerCancel={() => setResizeDrag(null)} className="absolute -bottom-2 -right-2 h-4 w-4 touch-none rounded-full border-2 border-white bg-pink-500 shadow" />}
            </div>
          ))}
          {pollStickers.map(poll => <PollSticker key={poll.id} poll={poll} preview />)}
            {mentionOverlays.map(mention => (
            <div key={mention.id} onClick={() => setSelectedMentionId(mention.id)} onPointerDown={event => { event.preventDefault(); event.stopPropagation(); mentionDragId.current = mention.id; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { if (mentionDragId.current !== mention.id || !stageRef.current) return; const rect = stageRef.current.getBoundingClientRect(); setMentionOverlays(items => items.map(item => item.id === mention.id ? { ...item, x: Math.min(90, Math.max(10, ((event.clientX - rect.left) / rect.width) * 100)), y: Math.min(92, Math.max(8, ((event.clientY - rect.top) / rect.height) * 100)) } : item)) }} onPointerUp={() => { mentionDragId.current = null; mentionResizeDrag.current = null }} onPointerCancel={() => { mentionDragId.current = null; mentionResizeDrag.current = null }} className="absolute z-30 flex max-w-[88%] select-none cursor-move touch-none items-center gap-2 rounded-full border border-white/50 px-3 py-2 text-white shadow-lg backdrop-blur-sm" style={{ left: `${mention.x}%`, top: `${mention.y}%`, backgroundColor: mention.color || '#111827', transform: `translate(-50%, -50%) rotate(${mention.rotation ?? 0}deg) scale(${mention.scale})` }} aria-label={`Mention @${mention.username}; drag to move`}>
              <AtSign className="h-4 w-4 shrink-0 text-pink-300" /><span className="max-w-40 truncate text-sm font-semibold">@{mention.username}</span>{selectedMentionId === mention.id && <button type="button" aria-label={`Mention options @${mention.username}`} onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); setShowMentionMenu(true) }} className="absolute -right-3 -top-8 flex h-6 w-6 items-center justify-center rounded-full border border-white bg-black/80 text-white shadow"><MoreVertical className="h-4 w-4" /></button>}
              <button type="button" aria-label={`Resize mention @${mention.username}`} onPointerDown={event => { event.stopPropagation(); mentionDragId.current = null; mentionResizeDrag.current = { id: mention.id, startX: event.clientX, scale: mention.scale }; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { const drag = mentionResizeDrag.current; if (!drag || drag.id !== mention.id) return; event.stopPropagation(); setMentionOverlays(items => items.map(item => item.id === mention.id ? { ...item, scale: Math.max(0.7, Math.min(2, drag.scale + (event.clientX - drag.startX) / 140)) } : item)) }} onPointerUp={() => { mentionResizeDrag.current = null }} onPointerCancel={() => { mentionResizeDrag.current = null }} className="ml-0.5 h-3.5 w-3.5 shrink-0 touch-none rounded-full border-2 border-white bg-pink-500" />
              <button type="button" aria-label={`Rotate mention @${mention.username}`} title="Drag to rotate" onPointerDown={event => { event.preventDefault(); event.stopPropagation(); mentionDragId.current = null; const rect = stageRef.current?.getBoundingClientRect(); if (!rect) return; const centerX = rect.left + rect.width * mention.x / 100; const centerY = rect.top + rect.height * mention.y / 100; mentionResizeDrag.current = null; mentionRotateDrag.current = { id: mention.id, startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI, rotation: mention.rotation ?? 0, centerX, centerY }; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { const drag = mentionRotateDrag.current; if (!drag || drag.id !== mention.id) return; event.preventDefault(); event.stopPropagation(); const angle = Math.atan2(event.clientY - drag.centerY, event.clientX - drag.centerX) * 180 / Math.PI; setMentionOverlays(items => items.map(item => item.id === mention.id ? { ...item, rotation: Math.round(drag.rotation + angle - drag.startAngle) } : item)) }} onPointerUp={() => { mentionRotateDrag.current = null }} onPointerCancel={() => { mentionRotateDrag.current = null }} className="flex h-4 w-4 shrink-0 touch-none items-center justify-center rounded-full border-2 border-white bg-blue-500 shadow"><RotateCw className="h-2.5 w-2.5 text-white" /></button>
            </div>
          ))}
          {gifStickers.map(sticker => <GIFSticker key={sticker.id} sticker={sticker} selected={selectedGIFId === sticker.id} onSelect={() => setSelectedGIFId(sticker.id)} onMove={(x,y) => setGIFStickers(items => items.map(item => item.id === sticker.id ? {...item,x,y} : item))} onResize={scale => setGIFStickers(items => items.map(item => item.id === sticker.id ? {...item,scale} : item))} onRotate={rotation => setGIFStickers(items => items.map(item => item.id === sticker.id ? {...item,rotation} : item))} onMenu={() => setShowGIFMenu(true)} />)}
          {pollStickers.map(poll => <PollSticker key={poll.id} poll={poll} editable selected={selectedPollId === poll.id} onSelect={() => setSelectedPollId(poll.id)} onMove={(x,y) => setPollStickers(items => items.map(item => item.id === poll.id ? {...item,x,y} : item))} onResize={scale => setPollStickers(items => items.map(item => item.id === poll.id ? {...item,scale} : item))} onRotate={rotation => setPollStickers(items => items.map(item => item.id === poll.id ? {...item,rotation} : item))} onMenu={() => setShowPollMenu(true)} />)}
          {countdowns.map(countdown => <div key={countdown.id} onClick={event => { event.stopPropagation(); setSelectedCountdownId(countdown.id) }} onPointerDown={event => { event.preventDefault(); event.stopPropagation(); setSelectedCountdownId(countdown.id); countdownDragId.current = countdown.id; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { if (countdownDragId.current !== countdown.id || !stageRef.current) return; const rect = stageRef.current.getBoundingClientRect(); setCountdowns(items => items.map(item => item.id === countdown.id ? { ...item, x: Math.min(90, Math.max(10, (event.clientX - rect.left) / rect.width * 100)), y: Math.min(92, Math.max(8, (event.clientY - rect.top) / rect.height * 100)) } : item)) }} onPointerUp={() => { countdownDragId.current = null }} onPointerCancel={() => { countdownDragId.current = null }} className="absolute z-40 cursor-move select-none touch-none" style={{ left: `${countdown.x}%`, top: `${countdown.y}%`, transform: `translate(-50%, -50%) rotate(${countdown.rotation}deg) scale(${countdown.scale})` }}><CountdownSticker title={countdown.title} targetAt={countdown.targetAt} x={countdown.x} y={countdown.y} scale={countdown.scale} rotation={countdown.rotation} color={countdown.color} embedded/>{selectedCountdownId === countdown.id && <><button type="button" aria-label="Countdown options" onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); setShowCountdownMenu(true) }} className="absolute -right-3 -top-8 flex h-6 w-6 items-center justify-center rounded-full border border-white bg-black/80 text-white shadow"><MoreVertical className="h-4 w-4"/></button><button type="button" aria-label="Resize countdown" onPointerDown={event => { event.stopPropagation(); countdownDragId.current=null; countdownResizeDrag.current={id:countdown.id,startX:event.clientX,scale:countdown.scale}; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { const drag=countdownResizeDrag.current; if(!drag||drag.id!==countdown.id)return; event.stopPropagation(); setCountdowns(items=>items.map(item=>item.id===countdown.id?{...item,scale:Math.max(.65,Math.min(2.5,drag.scale+(event.clientX-drag.startX)/120))}:item)) }} onPointerUp={()=>{countdownResizeDrag.current=null}} onPointerCancel={()=>{countdownResizeDrag.current=null}} className="absolute -bottom-2 -right-2 h-4 w-4 touch-none rounded-full border-2 border-white bg-pink-500"/><button type="button" aria-label="Rotate countdown" onPointerDown={event=>{event.preventDefault();event.stopPropagation();countdownDragId.current=null;const rect=stageRef.current?.getBoundingClientRect();if(!rect)return;const centerX=rect.left+rect.width*countdown.x/100;const centerY=rect.top+rect.height*countdown.y/100;countdownRotateDrag.current={id:countdown.id,startAngle:Math.atan2(event.clientY-centerY,event.clientX-centerX)*180/Math.PI,rotation:countdown.rotation,centerX,centerY};event.currentTarget.setPointerCapture(event.pointerId)}} onPointerMove={event=>{const drag=countdownRotateDrag.current;if(!drag||drag.id!==countdown.id)return;event.preventDefault();event.stopPropagation();const angle=Math.atan2(event.clientY-drag.centerY,event.clientX-drag.centerX)*180/Math.PI;setCountdowns(items=>items.map(item=>item.id===countdown.id?{...item,rotation:Math.round(drag.rotation+angle-drag.startAngle)}:item))}} onPointerUp={()=>{countdownRotateDrag.current=null}} onPointerCancel={()=>{countdownRotateDrag.current=null}} className="absolute -bottom-2 -left-2 flex h-4 w-4 touch-none items-center justify-center rounded-full border-2 border-white bg-blue-500"><RotateCw className="h-2.5 w-2.5 text-white"/></button></>}</div>)}
          {linkOverlays.map(link => (
            <div key={link.id} onPointerDown={event => { event.preventDefault(); event.stopPropagation(); setSelectedLinkId(link.id); linkDragId.current = link.id; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { if (linkDragId.current !== link.id || !stageRef.current) return; const rect = stageRef.current.getBoundingClientRect(); setLinkOverlays(items => items.map(item => item.id === link.id ? { ...item, x: Math.min(90, Math.max(10, ((event.clientX - rect.left) / rect.width) * 100)), y: Math.min(92, Math.max(8, ((event.clientY - rect.top) / rect.height) * 100)) } : item)) }} onPointerUp={() => { linkDragId.current = null }} onPointerCancel={() => { linkDragId.current = null }} onClick={event => { event.stopPropagation(); setSelectedLinkId(link.id) }} className="absolute z-40 flex max-w-[88%] cursor-move select-none touch-none items-center gap-2 rounded-full border border-white/70 px-3 py-2 text-sm font-semibold text-white shadow-lg" style={{ left: `${link.x}%`, top: `${link.y}%`, backgroundColor: link.color, transform: `translate(-50%, -50%) rotate(${link.rotation ?? 0}deg) scale(${link.scale})` }} aria-label={`Link sticker ${link.label}; drag to move`}>
              <Link2 className="h-4 w-4 shrink-0" /><span className="max-w-40 truncate">{link.label}</span>
              {selectedLinkId === link.id && <button type="button" aria-label="Link sticker options" onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); setShowLinkMenu(true) }} className="absolute -right-3 -top-8 flex h-6 w-6 items-center justify-center rounded-full border border-white bg-black/80 text-white shadow"><MoreVertical className="h-4 w-4" /></button>}
              {selectedLinkId === link.id && <button type="button" aria-label="Resize link sticker" title="Drag to resize" onPointerDown={event => { event.preventDefault(); event.stopPropagation(); linkDragId.current = null; linkResizeDrag.current = { id: link.id, startX: event.clientX, scale: link.scale }; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { const drag = linkResizeDrag.current; if (!drag || drag.id !== link.id) return; event.preventDefault(); event.stopPropagation(); setLinkOverlays(items => items.map(item => item.id === link.id ? { ...item, scale: Math.max(0.65, Math.min(2.5, drag.scale + (event.clientX - drag.startX) / 120)) } : item)) }} onPointerUp={() => { linkResizeDrag.current = null }} onPointerCancel={() => { linkResizeDrag.current = null }} className="absolute -bottom-2 -right-2 h-4 w-4 touch-none rounded-full border-2 border-white bg-pink-500 shadow" />}
              {selectedLinkId === link.id && <button type="button" aria-label="Rotate link sticker" title="Drag to rotate" onPointerDown={event => { event.preventDefault(); event.stopPropagation(); linkDragId.current = null; const rect = stageRef.current?.getBoundingClientRect(); if (!rect) return; const centerX = rect.left + rect.width * link.x / 100; const centerY = rect.top + rect.height * link.y / 100; linkRotateDrag.current = { id: link.id, startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI, rotation: link.rotation ?? 0, centerX, centerY }; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { const drag = linkRotateDrag.current; if (!drag || drag.id !== link.id) return; event.preventDefault(); event.stopPropagation(); const angle = Math.atan2(event.clientY - drag.centerY, event.clientX - drag.centerX) * 180 / Math.PI; setLinkOverlays(items => items.map(item => item.id === link.id ? { ...item, rotation: Math.round(drag.rotation + angle - drag.startAngle) } : item)) }} onPointerUp={() => { linkRotateDrag.current = null }} onPointerCancel={() => { linkRotateDrag.current = null }} className="absolute -bottom-2 -left-2 flex h-4 w-4 touch-none items-center justify-center rounded-full border-2 border-white bg-blue-500 shadow"><RotateCw className="h-2.5 w-2.5 text-white" /></button>}
            </div>
          ))}
          {song && (
            <div
              role="button"
              tabIndex={0}
              aria-label="Song sticker; drag to move it on your story"
              onPointerDown={event => { event.stopPropagation(); setSongStickerSelected(true); songStickerDragging.current = true; event.currentTarget.setPointerCapture(event.pointerId) }}
              onPointerMove={event => { if (songStickerResizeDrag.current) { event.stopPropagation(); const drag = songStickerResizeDrag.current; setSongStickerScale(Math.max(0.55, Math.min(2.5, drag.scale + (event.clientX - drag.startX) / 100))); return } if (songStickerRotateDrag.current) { event.stopPropagation(); const drag = songStickerRotateDrag.current; const angle = Math.atan2(event.clientY - drag.centerY, event.clientX - drag.centerX) * 180 / Math.PI; let rotation = drag.rotation + angle - drag.startAngle; while (rotation > 180) rotation -= 360; while (rotation < -180) rotation += 360; setSongStickerRotation(Math.round(rotation)); return } if (!songStickerDragging.current || !stageRef.current) return; const rect = stageRef.current.getBoundingClientRect(); setSongStickerX(Math.min(90, Math.max(10, ((event.clientX - rect.left) / rect.width) * 100))); setSongStickerY(Math.min(92, Math.max(8, ((event.clientY - rect.top) / rect.height) * 100))) }}
              onPointerUp={() => { songStickerDragging.current = false; songStickerResizeDrag.current = null; songStickerRotateDrag.current = null }}
              onPointerCancel={() => { songStickerDragging.current = false; songStickerResizeDrag.current = null; songStickerRotateDrag.current = null }}
              onKeyDown={event => { if (event.key === 'ArrowLeft') setSongStickerX(x => Math.max(10, x - 1)); if (event.key === 'ArrowRight') setSongStickerX(x => Math.min(90, x + 1)); if (event.key === 'ArrowUp') setSongStickerY(y => Math.max(8, y - 1)); if (event.key === 'ArrowDown') setSongStickerY(y => Math.min(92, y + 1)) }}
              className={`absolute z-20 max-w-[88%] cursor-move select-none touch-none ${songStickerSelected ? 'outline outline-1 outline-white outline-offset-2' : ''}`}
              style={{ left: `${songStickerX}%`, top: `${songStickerY}%`, transform: `translate(-50%, -50%) rotate(${songStickerRotation}deg) scale(${songStickerScale})` }}
            >
              {songStickerStyle === 'pill' && <div className="flex max-w-full items-center gap-2 rounded-full bg-black/50 py-1.5 pl-1.5 pr-3 text-white shadow backdrop-blur-sm"><img src={song.artworkUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" /><div className="min-w-0"><p className="max-w-44 truncate text-xs font-semibold">{song.title}</p><p className="max-w-44 truncate text-[10px] opacity-80">{song.artist}</p></div></div>}
              {songStickerStyle === 'cover' && <div className="flex w-56 max-w-full items-center gap-2 rounded-lg border border-white/15 bg-black/70 p-2 text-white shadow-lg backdrop-blur"><img src={song.artworkUrl} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" /><div className="min-w-0"><p className="truncate text-sm font-bold">{song.title}</p><p className="truncate text-xs text-white/75">{song.artist}</p><div className="mt-1 h-1 rounded-full bg-white/25"><div className="h-full w-2/3 rounded-full bg-white/80" /></div></div></div>}
              {songStickerStyle === 'square' && <div className="w-36 overflow-hidden rounded-xl bg-white text-black shadow-xl"><img src={song.artworkUrl} alt="" className="aspect-square w-full object-cover" /><div className="px-2.5 py-2"><p className="truncate text-sm font-semibold">{song.title}</p><p className="truncate text-xs text-neutral-600">♫ {song.artist}</p></div></div>}
              {songStickerStyle === 'vinyl' && <div className="flex max-w-full items-center gap-2 rounded-xl bg-neutral-950/90 p-2 text-white shadow-xl"><div className="relative h-12 w-12 shrink-0 rounded-full border border-white/20 bg-gradient-to-br from-neutral-700 via-black to-neutral-900 p-1"><div className="h-full w-full rounded-full border border-white/15 p-1"><img src={song.artworkUrl} alt="" className="h-full w-full rounded-full object-cover" /></div></div><div className="min-w-0"><p className="max-w-40 truncate text-sm font-bold">{song.title}</p><p className="max-w-40 truncate text-xs text-white/70">{song.artist}</p><div className="mt-1 flex gap-[2px]">{Array.from({ length: 16 }, (_, i) => <span key={i} className="h-2 w-[2px] rounded-full bg-white/75" style={{ height: `${4 + (i * 7 % 11)}px` }} />)}</div></div></div>}
              {songStickerStyle === 'waveform' && <div className="flex w-60 max-w-full items-center gap-2 rounded-md bg-neutral-950/85 px-3 py-2 text-white shadow-lg"><img src={song.artworkUrl} alt="" className="h-10 w-10 shrink-0 rounded object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{song.title}</p><p className="truncate text-[10px] text-white/70">{song.artist}</p></div><div className="flex h-7 items-center gap-[2px]">{Array.from({ length: 13 }, (_, i) => <span key={i} className="w-[2px] rounded-full bg-white/80" style={{ height: `${5 + (i * 5 % 19)}px` }} />)}</div></div>}
              {songStickerSelected && <button type="button" aria-label="Rotate song tag" title="Drag to rotate" onPointerDown={event => { event.stopPropagation(); const sticker = event.currentTarget.parentElement; const rect = sticker?.getBoundingClientRect(); if (!rect) return; songStickerDragging.current = false; songStickerRotateDrag.current = { startAngle: Math.atan2(event.clientY - (rect.top + rect.height / 2), event.clientX - (rect.left + rect.width / 2)) * 180 / Math.PI, rotation: songStickerRotation, centerX: rect.left + rect.width / 2, centerY: rect.top + rect.height / 2 }; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { if (!songStickerRotateDrag.current) return; event.stopPropagation(); const drag = songStickerRotateDrag.current; const angle = Math.atan2(event.clientY - drag.centerY, event.clientX - drag.centerX) * 180 / Math.PI; let rotation = drag.rotation + angle - drag.startAngle; while (rotation > 180) rotation -= 360; while (rotation < -180) rotation += 360; setSongStickerRotation(Math.round(rotation)) }} onPointerUp={() => { songStickerRotateDrag.current = null; songStickerDragging.current = false }} onPointerCancel={() => { songStickerRotateDrag.current = null; songStickerDragging.current = false }} className="absolute -bottom-2 -left-2 flex h-4 w-4 touch-none items-center justify-center rounded-full border-2 border-white bg-blue-500 text-white shadow"><RotateCw className="h-2.5 w-2.5" /></button>}
              {songStickerSelected && <button type="button" aria-label="Resize song tag" title="Drag to resize" onPointerDown={event => { event.stopPropagation(); songStickerDragging.current = false; songStickerResizeDrag.current = { startX: event.clientX, scale: songStickerScale }; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { if (!songStickerResizeDrag.current) return; event.stopPropagation(); const drag = songStickerResizeDrag.current; setSongStickerScale(Math.max(0.55, Math.min(2.5, drag.scale + (event.clientX - drag.startX) / 100))) }} onPointerUp={() => { songStickerResizeDrag.current = null; songStickerDragging.current = false }} onPointerCancel={() => { songStickerResizeDrag.current = null; songStickerDragging.current = false }} className="absolute -bottom-2 -right-2 h-4 w-4 touch-none rounded-full border-2 border-white bg-pink-500 shadow" />}
            </div>
          )}
        </div>
        {song && (
          <aside aria-label="Song sticker styles" className="order-3 w-full max-w-[min(100%,28rem)] sm:order-3 sm:w-40 sm:max-w-40">
            <p className="mb-2 text-center text-xs font-semibold text-muted-foreground sm:text-left">Song tag style</p>
            <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-col sm:overflow-visible">
              {SONG_STICKER_OPTIONS.map(option => (
                <button key={option.id} type="button" onClick={() => setSongStickerStyle(option.id)} aria-pressed={songStickerStyle === option.id} className={`min-w-28 shrink-0 rounded-xl border p-2 text-left transition-colors sm:min-w-0 ${songStickerStyle === option.id ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-border bg-card hover:bg-muted'}`}>
                  <span className="block truncate text-xs font-semibold">{option.label}</span>
                  <span className="mt-0.5 block text-[10px] leading-tight text-muted-foreground">{option.description}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 hidden text-[11px] text-muted-foreground sm:block">Drag the song tag on the story to move it.</p>
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
                {song && <div className="absolute inset-y-0 rounded-sm bg-emerald-500/90" style={{ left: `${(songStart / 60) * 100}%`, width: `${Math.max(1.5, (Math.min(songDuration, storyDuration - songStart, getSongAvailableDuration()) / 60) * 100)}%` }}>
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
              <button onClick={() => { const value = textDraft.trim(); if (value) { const id = makeId(); setTextLayers(items => [...items, { id, text: value, x: 50, y: 50, scale: 1, rotation: 0, color: '#ffffff', fontFamily: null, start: 0, duration: storyDuration }]); setSelectedTextId(id); if (!overlayText.trim()) setOverlayText(value) } setTextDraft(''); setShowTextInput(false) }} aria-label="Add text to story" className="rounded-xl bg-muted px-3"><Check className="h-4 w-4" /></button>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => setShowMusicPicker(true)} aria-label={song ? 'Change song' : 'Add song'} className="flex min-h-11 items-center justify-center gap-1 rounded-xl border border-border bg-card px-2 text-sm font-medium hover:bg-muted"><Music2 className="h-4 w-4 shrink-0" /><span className="sm:hidden">{song ? 'Change' : 'Song'}</span><span className="hidden sm:inline">{song ? 'Change song' : 'Add Song'}</span></button>
            <button onClick={() => { setTextDraft(''); setShowTextInput(true) }} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-2 text-sm font-medium hover:bg-muted"><Type className="h-4 w-4" /> Add Text</button>
            <button onClick={() => setShowStickerSidebar(true)} className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-2 text-sm font-medium hover:bg-muted"><Sticker className="h-4 w-4 shrink-0" /><span>Sticker</span></button>
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

      {exitAction && <div className="fixed inset-0 z-[190] flex items-center justify-center bg-black/60 p-4" role="alertdialog" aria-modal="true" aria-labelledby="photo-exit-title" aria-describedby="photo-exit-description"><div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl"><h2 id="photo-exit-title" className="text-lg font-semibold">Leave photo editor?</h2><p id="photo-exit-description" className="mt-2 text-sm text-muted-foreground">If you leave now, your current edits may be lost. Do you want to continue editing or discard your changes?</p><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => setExitAction(null)}>Continue editing</Button><Button type="button" variant="destructive" onClick={() => { const action = exitAction; setExitAction(null); if (action === 'back') onBack(); else onClose() }}>Discard changes</Button></div></div></div>}
      {song && <audio ref={previewAudioRef} src={song.previewUrl} preload="metadata" className="hidden" />}
      {showStickerSidebar && <StoryStickerSidebar onClose={() => setShowStickerSidebar(false)} onMention={() => { setShowStickerSidebar(false); setShowMentionPicker(true) }} onLink={() => { setShowStickerSidebar(false); setShowLinkModal(true) }} onCountdown={() => { setShowStickerSidebar(false); setSelectedCountdownId(null); setShowCountdownModal(true) }} onGIF={() => { setShowStickerSidebar(false); setShowGIFPicker(true) }} onEmoji={() => { setShowStickerSidebar(false); setShowEmojiPicker(true) }} onPoll={() => { setShowStickerSidebar(false); setSelectedPollId(null); setShowPollModal(true) }} />}
      <div>{showCountdownColorPicker && selectedCountdownId && <div className="fixed inset-0 z-[196] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Choose countdown sticker color"><div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl"><h3 className="text-lg font-semibold">Countdown sticker color</h3><div className="mt-4 flex items-center gap-3"><input aria-label="Choose countdown sticker color" type="color" value={countdownColorDraft} onChange={event=>setCountdownColorDraft(event.target.value)} className="h-12 w-14 cursor-pointer rounded-lg border border-border bg-card p-1"/><input aria-label="Countdown sticker HEX color" value={countdownColorDraft} onChange={event=>setCountdownColorDraft(event.target.value.startsWith("#")?event.target.value:"#"+event.target.value)} maxLength={7} className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm uppercase"/></div><div className="mt-4 flex gap-2"><button className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted" onClick={()=>setShowCountdownColorPicker(false)}>Cancel</button><button className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50" disabled={!/^#[0-9a-fA-F]{6}$/.test(countdownColorDraft)} onClick={()=>{setCountdowns(items=>items.map(item=>item.id===selectedCountdownId?{...item,color:countdownColorDraft}:item));setShowCountdownColorPicker(false)}}>Apply color</button></div></div></div>}</div>
      {showEmojiPicker && <EmojiPicker onClose={() => setShowEmojiPicker(false)} onSelect={emoji => { const id = makeId(); setTextLayers(items => [...items, { id, text: emoji, isEmoji: true, x: 50, y: 52, scale: 2.5, rotation: 0, color: '#ffffff', fontFamily: null, start: 0, duration: storyDuration }]); setSelectedTextId(id); setShowEmojiPicker(false) }} />}
       {showGIFPicker && <GIFPicker onClose={() => setShowGIFPicker(false)} onSelect={gif => { const id = Math.random().toString(36).slice(2,10); setGIFStickers(items => [...items, {...gif,id,x:50,y:58,scale:1,rotation:0}]); setSelectedGIFId(id); setShowGIFPicker(false) }} />}
      {showPollMenu && selectedPollId && <div className="fixed inset-0 z-[198] flex items-start justify-center bg-black/20 p-4 pt-[18vh]" onClick={() => setShowPollMenu(false)}><div role="dialog" aria-modal="true" aria-label="Poll sticker options" className="w-full max-w-xs rounded-2xl border border-border bg-card p-4 text-foreground shadow-xl" onClick={event => event.stopPropagation()}><h3 className="text-base font-semibold">Poll sticker options</h3><button className="mt-3 w-full rounded-xl border border-border px-3 py-2.5 text-left text-sm hover:bg-muted" onClick={() => { setShowPollMenu(false); setShowPollModal(true) }}>Edit</button><button className="mt-2 w-full rounded-xl border border-border px-3 py-2.5 text-left text-sm hover:bg-muted" onClick={() => { const poll = pollStickers.find(item => item.id === selectedPollId); setPollColorDraft(poll?.color || '#ec4899'); setShowPollMenu(false); setShowPollColorPicker(true) }}>Color</button><button className="mt-2 w-full rounded-xl border border-red-500/40 px-3 py-2.5 text-left text-sm text-red-500 hover:bg-red-500/10" onClick={() => { setPollStickers(items => items.filter(item => item.id !== selectedPollId)); setSelectedPollId(null); setShowPollMenu(false) }}>Delete</button><button className="mt-3 w-full rounded-xl border border-border px-3 py-2.5 text-sm font-medium hover:bg-muted" onClick={() => setShowPollMenu(false)}>Cancel</button></div></div>}
      {showPollModal && <PollModal initialPoll={pollStickers.find(item => item.id === selectedPollId) || null} onClose={() => setShowPollModal(false)} onSave={poll => { setPollStickers(items => items.some(item => item.id === poll.id) ? items.map(item => item.id === poll.id ? poll : item) : [...items,poll]); setSelectedPollId(poll.id); setShowPollModal(false) }} />}
      {showPollColorPicker && selectedPollId && <div className="fixed inset-0 z-[199] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Choose poll sticker color"><div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl"><h3 className="text-lg font-semibold">Poll sticker color</h3><p className="mt-1 text-sm text-muted-foreground">Choose a color or enter its HEX value, like the countdown sticker.</p><div className="mt-4 flex items-center gap-3"><input aria-label="Choose poll sticker color" type="color" value={pollColorDraft} onChange={event=>setPollColorDraft(event.target.value)} className="h-12 w-14 cursor-pointer rounded-lg border border-border bg-card p-1"/><input aria-label="Poll sticker HEX color" value={pollColorDraft} onChange={event=>setPollColorDraft(event.target.value.startsWith('#')?event.target.value:'#'+event.target.value)} maxLength={7} className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm uppercase"/></div><div className="mt-4 flex gap-2"><button className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted" onClick={()=>setShowPollColorPicker(false)}>Cancel</button><button disabled={!/^#[0-9a-fA-F]{6}$/.test(pollColorDraft)} className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50" onClick={()=>{setPollStickers(items=>items.map(item=>item.id===selectedPollId?{...item,color:pollColorDraft}:item));setShowPollColorPicker(false)}}>Apply color</button></div></div></div>}
      {showGIFMenu && selectedGIFId && <div className="fixed inset-0 z-[195] flex items-start justify-center bg-black/20 p-4 pt-[18vh]" onClick={() => setShowGIFMenu(false)}><div role="dialog" aria-modal="true" aria-label="GIF sticker options" className="w-full max-w-xs rounded-2xl border border-border bg-card p-4 text-foreground shadow-xl" onClick={event => event.stopPropagation()}><h3 className="text-base font-semibold">GIF sticker options</h3><button className="mt-3 flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm hover:bg-muted" onClick={() => { const selected = gifStickers.find(item => item.id === selectedGIFId); if (selected) { const id = Math.random().toString(36).slice(2,10); setGIFStickers(items => [...items, {...selected,id,x:Math.min(94,selected.x+5),y:Math.min(94,selected.y+5)}]); setSelectedGIFId(id) } setShowGIFMenu(false) }}><Copy className="h-4 w-4" /> Duplicate</button><button className="mt-2 flex w-full items-center gap-2 rounded-xl border border-red-500/40 px-3 py-2.5 text-sm text-red-500 hover:bg-red-500/10" onClick={() => { setGIFStickers(items => items.filter(item => item.id !== selectedGIFId)); setSelectedGIFId(null); setShowGIFMenu(false) }}><Trash2 className="h-4 w-4" /> Delete</button><button className="mt-3 w-full rounded-xl border border-border px-3 py-2.5 text-sm font-medium hover:bg-muted" onClick={() => setShowGIFMenu(false)}>Cancel</button></div></div>}
      {showCountdownModal && <CountdownModal onClose={() => setShowCountdownModal(false)} initialTitle={countdowns.find(item=>item.id===selectedCountdownId)?.title} initialTargetAt={countdowns.find(item=>item.id===selectedCountdownId)?.targetAt} onAdd={(title,targetAt) => { const selected=countdowns.find(item=>item.id===selectedCountdownId); if(selected) setCountdowns(items=>items.map(item=>item.id===selected.id?{...item,title,targetAt}:item)); else { const id=makeId(); setCountdowns(items=>[...items,{id,title,targetAt,x:50,y:62,scale:1,rotation:0,color:'#7c3aed'}]); setSelectedCountdownId(id) } setShowCountdownModal(false) }} />}
      {showCountdownMenu && selectedCountdownId && <div className="fixed inset-0 z-[195] flex items-start justify-center bg-black/20 p-4 pt-[18vh]" onClick={()=>setShowCountdownMenu(false)}><div role="dialog" aria-modal="true" aria-label="Countdown options" className="w-full max-w-xs rounded-2xl border border-border bg-card p-4 text-foreground shadow-xl" onClick={event=>event.stopPropagation()}><h3 className="text-base font-semibold">Countdown options</h3><button className="mt-3 w-full rounded-xl border border-border px-3 py-2.5 text-left text-sm hover:bg-muted" onClick={()=>{setShowCountdownMenu(false);setShowCountdownModal(true)}}>Edit</button><button className="mt-3 flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-left text-sm hover:bg-muted" onClick={()=>{setCountdownColorDraft(countdowns.find(item=>item.id===selectedCountdownId)?.color||"#7c3aed");setShowCountdownMenu(false);setShowCountdownColorPicker(true)}}><span className="h-4 w-4 rounded-full border border-border" style={{backgroundColor:countdowns.find(item=>item.id===selectedCountdownId)?.color||"#7c3aed"}}/>Color</button><button className="mt-2 w-full rounded-xl border border-red-500/40 px-3 py-2.5 text-left text-sm text-red-500 hover:bg-red-500/10" onClick={()=>{setCountdowns(items=>items.filter(item=>item.id!==selectedCountdownId));setSelectedCountdownId(null);setShowCountdownMenu(false)}}>Delete</button><button className="mt-3 w-full rounded-xl border border-border px-3 py-2.5 text-sm" onClick={()=>setShowCountdownMenu(false)}>Cancel</button></div></div>}
      {showLinkModal && <StoryLinkModal onClose={() => setShowLinkModal(false)} onAdd={(url, label) => { const id = makeId(); setLinkOverlays(items => [...items, { id, url, label, x: 50, y: Math.min(88, 60 + items.length * 7), scale: 1, rotation: 0, color: '#2563eb' }]); setSelectedLinkId(id); setShowLinkModal(false) }} />}
      {showLinkMenu && selectedLinkId && <div className="fixed inset-0 z-[195] flex items-start justify-center bg-black/20 p-4 pt-[18vh]" onClick={() => setShowLinkMenu(false)}><div role="dialog" aria-modal="true" aria-label="Link sticker options" className="w-full max-w-xs rounded-2xl border border-border bg-card p-4 text-foreground shadow-xl" onClick={event => event.stopPropagation()}><h3 className="text-base font-semibold">Link sticker options</h3><button className="mt-3 flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm hover:bg-muted" onClick={() => { setLinkColorDraft(linkOverlays.find(item => item.id === selectedLinkId)?.color || '#2563eb'); setShowLinkMenu(false); setShowLinkColorPicker(true) }}><span className="h-4 w-4 rounded-full border border-border" style={{ backgroundColor: linkOverlays.find(item => item.id === selectedLinkId)?.color || '#2563eb' }} /> Color</button><button className="mt-2 flex w-full items-center gap-2 rounded-xl border border-red-500/40 px-3 py-2.5 text-sm text-red-500 hover:bg-red-500/10" onClick={() => { setLinkOverlays(items => items.filter(item => item.id !== selectedLinkId)); setSelectedLinkId(null); setShowLinkMenu(false) }}><Trash2 className="h-4 w-4" /> Delete</button><button className="mt-3 w-full rounded-xl border border-border px-3 py-2.5 text-sm font-medium hover:bg-muted" onClick={() => setShowLinkMenu(false)}>Cancel</button></div></div>}
      {showLinkColorPicker && selectedLinkId && <div className="fixed inset-0 z-[196] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Choose link sticker color"><div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl"><h3 className="text-lg font-semibold">Link sticker color</h3><div className="mt-4 flex items-center gap-3"><input aria-label="Choose link sticker color" type="color" value={linkColorDraft} onChange={event => setLinkColorDraft(event.target.value)} className="h-12 w-14 cursor-pointer rounded-lg border border-border bg-card p-1" /><input aria-label="Link sticker HEX color" value={linkColorDraft} onChange={event => setLinkColorDraft(event.target.value.startsWith('#') ? event.target.value : '#' + event.target.value)} maxLength={7} className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm uppercase" /></div><div className="mt-4 flex gap-2"><button className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted" onClick={() => setShowLinkColorPicker(false)}>Cancel</button><button className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50" disabled={!/^#[0-9a-fA-F]{6}$/.test(linkColorDraft)} onClick={() => { setLinkOverlays(items => items.map(item => item.id === selectedLinkId ? { ...item, color: linkColorDraft } : item)); setShowLinkColorPicker(false) }}>Apply color</button></div></div></div>}
      {showMentionMenu && selectedMentionId && <div className="fixed inset-0 z-[195] flex items-start justify-center bg-black/20 p-4 pt-[18vh]" onClick={() => setShowMentionMenu(false)}><div role="dialog" aria-modal="true" aria-label="Mention sticker options" className="w-full max-w-xs rounded-2xl border border-border bg-card p-4 text-foreground shadow-xl" onClick={event => event.stopPropagation()}><h3 className="text-base font-semibold">Mention sticker options</h3><button className="mt-3 flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm hover:bg-muted" onClick={() => { setMentionColorDraft(mentionOverlays.find(item => item.id === selectedMentionId)?.color || '#111827'); setShowMentionMenu(false); setShowMentionColorPicker(true) }}><span className="h-4 w-4 rounded-full border border-border" style={{ backgroundColor: mentionOverlays.find(item => item.id === selectedMentionId)?.color || '#111827' }} /> Color</button><button className="mt-2 flex w-full items-center gap-2 rounded-xl border border-red-500/40 px-3 py-2.5 text-sm text-red-500 hover:bg-red-500/10" onClick={() => { setMentionOverlays(items => items.filter(item => item.id !== selectedMentionId)); setSelectedMentionId(null); setShowMentionMenu(false) }}><Trash2 className="h-4 w-4" /> Delete</button><button className="mt-3 w-full rounded-xl border border-border px-3 py-2.5 text-sm hover:bg-muted" onClick={() => setShowMentionMenu(false)}>Cancel</button></div></div>}
      {showMentionColorPicker && selectedMentionId && <div className="fixed inset-0 z-[196] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Choose mention sticker color"><div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl"><h3 className="text-lg font-semibold">Mention sticker color</h3><div className="mt-4 flex items-center gap-3"><input aria-label="Choose mention sticker color" type="color" value={mentionColorDraft} onChange={event => setMentionColorDraft(event.target.value)} className="h-12 w-14 cursor-pointer rounded-lg border border-border bg-card p-1"/><input aria-label="Mention sticker HEX color" value={mentionColorDraft} onChange={event => setMentionColorDraft(event.target.value.startsWith('#') ? mentionColorDraft : '#'+event.target.value)} maxLength={7} className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm uppercase"/></div><div className="mt-4 flex gap-2"><button className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm" onClick={() => setShowMentionColorPicker(false)}>Cancel</button><button className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50" disabled={!/^#[0-9a-fA-F]{6}$/.test(mentionColorDraft)} onClick={() => { setMentionOverlays(items => items.map(item => item.id === selectedMentionId ? { ...item, color: mentionColorDraft } : item)); setShowMentionColorPicker(false) }}>Apply color</button></div></div></div>}
      {showMentionPicker && <StoryMentionPicker userId={userId} selected={mentionOverlays.map(item => ({ id: item.userId, username: item.username, full_name: item.fullName, avatar_url: item.avatarUrl }))} onClose={() => setShowMentionPicker(false)} onConfirm={(people) => { setMentionOverlays(current => { const retained = current.filter(item => people.some(person => person.id === item.userId)); const retainedIds = new Set(retained.map(item => item.userId)); const added = people.filter(person => !retainedIds.has(person.id)).map((person, index) => ({ id: makeId(), userId: person.id, username: person.username, fullName: person.full_name, avatarUrl: person.avatar_url, x: 50, y: Math.min(88, 64 + index * 8), scale: 1 })); return [...retained, ...added] }); setShowMentionPicker(false) }} />}
      {showPreview && previewUrl && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/95 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Story preview">
          <button onClick={() => { setShowPreview(false); previewAudioRef.current?.pause() }} aria-label="Close story preview" className="absolute right-4 top-4 z-10 rounded-full bg-white/15 p-2 text-white hover:bg-white/25"><X className="h-5 w-5" /></button>
          <div className="relative flex h-[min(82dvh,760px)] aspect-[9/16] max-w-full items-center justify-center overflow-hidden rounded-2xl bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Story preview" className="h-full w-full object-contain" style={{ transform: `translate(${photoOffset.x}%, ${photoOffset.y}%) scale(${photoScale})`, transformOrigin: 'center center' }} />
             {pollStickers.map(poll => <PollSticker key={poll.id} poll={poll} preview />)}
            {gifStickers.map(sticker => <div key={sticker.id} className="pointer-events-none absolute z-30" style={{ left: `${sticker.x}%`, top: `${sticker.y}%`, transform: `translate(-50%, -50%) rotate(${sticker.rotation}deg) scale(${sticker.scale})` }}><img src={sticker.url} alt={sticker.title || 'GIF sticker'} className="max-h-40 max-w-[min(55vw,220px)] object-contain" /></div>)}
             
            {mentionOverlays.map(mention => <div key={mention.id} className="absolute z-20 flex max-w-[88%] items-center gap-2 rounded-full border border-white/50 px-3 py-2 text-white shadow-lg" style={{ left: `${mention.x}%`, top: `${mention.y}%`, backgroundColor: mention.color || '#111827', transform: `translate(-50%, -50%) rotate(${mention.rotation ?? 0}deg) scale(${mention.scale})` }}><AtSign className="h-4 w-4 text-pink-300" /><span className="max-w-40 truncate text-sm font-semibold">@{mention.username}</span></div>)}
             {countdowns.map(item => <div key={item.id} className="pointer-events-none absolute z-30" style={{left:`${item.x}%`,top:`${item.y}%`,transform:'translate(-50%,-50%)'}}><CountdownSticker title={item.title} targetAt={item.targetAt} x={item.x} y={item.y} scale={item.scale} rotation={item.rotation} color={item.color} embedded/></div>)}
              {linkOverlays.map(link => <div key={link.id} className="pointer-events-none absolute z-30 flex max-w-[88%] items-center gap-2 rounded-full border border-white/70 px-3 py-2 text-sm font-semibold text-white shadow-lg" style={{ left: `${link.x}%`, top: `${link.y}%`, backgroundColor: link.color, transform: `translate(-50%, -50%) rotate(${link.rotation ?? 0}deg) scale(${link.scale})` }}><Link2 className="h-4 w-4 shrink-0"/><span className="max-w-40 truncate">{link.label}</span></div>)}
            {textLayers.filter(layer => previewElapsed >= layer.start && previewElapsed < layer.start + Math.min(layer.duration, storyDuration - layer.start)).map(layer => (
              <div key={layer.id} className="absolute max-w-[86%] rounded-lg px-2 py-1 text-center font-bold [text-shadow:0_2px_8px_rgba(0,0,0,0.9)]" style={{ left: layer.x + '%', top: layer.y + '%', transform: 'translate(-50%, -50%) rotate(' + layer.rotation + 'deg)', fontSize: (20 * layer.scale) + 'px', color: layer.color, fontFamily: layer.fontFamily !== undefined ? (layer.fontFamily ? "'" + layer.fontFamily + "', sans-serif" : undefined) : (font ? "'" + font + "', sans-serif" : undefined) }}>{layer.text}</div>
            ))}
            <div className="absolute inset-x-0 top-0 h-1 bg-white/30"><div className="h-full bg-white" style={{ width: (Math.min(100, (previewElapsed / storyDuration) * 100)) + '%' }} /></div>
            {song && previewElapsed >= songStart && previewElapsed < songStart + Math.min(songDuration, storyDuration - songStart) && <div className="absolute z-20 max-w-[88%]" style={{ left: `${songStickerX}%`, top: `${songStickerY}%`, transform: `translate(-50%, -50%) rotate(${songStickerRotation}deg) scale(${songStickerScale})` }}>{songStickerStyle === 'pill' && <div className="flex max-w-full items-center gap-2 rounded-full bg-black/50 py-1.5 pl-1.5 pr-3 text-white shadow backdrop-blur-sm"><img src={song.artworkUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" /><div className="min-w-0"><p className="max-w-44 truncate text-xs font-semibold">{song.title}</p><p className="max-w-44 truncate text-[10px] opacity-80">{song.artist}</p></div></div>}{songStickerStyle === 'cover' && <div className="flex w-56 max-w-full items-center gap-2 rounded-lg border border-white/15 bg-black/70 p-2 text-white shadow-lg backdrop-blur"><img src={song.artworkUrl} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" /><div className="min-w-0"><p className="truncate text-sm font-bold">{song.title}</p><p className="truncate text-xs text-white/75">{song.artist}</p><div className="mt-1 h-1 rounded-full bg-white/25"><div className="h-full w-2/3 rounded-full bg-white/80" /></div></div></div>}{songStickerStyle === 'square' && <div className="w-36 overflow-hidden rounded-xl bg-white text-black shadow-xl"><img src={song.artworkUrl} alt="" className="aspect-square w-full object-cover" /><div className="px-2.5 py-2"><p className="truncate text-sm font-semibold">{song.title}</p><p className="truncate text-xs text-neutral-600">♫ {song.artist}</p></div></div>}{songStickerStyle === 'vinyl' && <div className="flex max-w-full items-center gap-2 rounded-xl bg-neutral-950/90 p-2 text-white shadow-xl"><div className="relative h-12 w-12 shrink-0 rounded-full border border-white/20 bg-gradient-to-br from-neutral-700 via-black to-neutral-900 p-1"><div className="h-full w-full rounded-full border border-white/15 p-1"><img src={song.artworkUrl} alt="" className="h-full w-full rounded-full object-cover" /></div></div><div className="min-w-0"><p className="max-w-40 truncate text-sm font-bold">{song.title}</p><p className="max-w-40 truncate text-xs text-white/70">{song.artist}</p><div className="mt-1 flex gap-[2px]">{Array.from({ length: 16 }, (_, i) => <span key={i} className="w-[2px] rounded-full bg-white/75" style={{ height: `${4 + (i * 7 % 11)}px` }} />)}</div></div></div>}{songStickerStyle === 'waveform' && <div className="flex w-60 max-w-full items-center gap-2 rounded-md bg-neutral-950/85 px-3 py-2 text-white shadow-lg"><img src={song.artworkUrl} alt="" className="h-10 w-10 shrink-0 rounded object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{song.title}</p><p className="truncate text-[10px] text-white/70">{song.artist}</p></div><div className="flex h-7 items-center gap-[2px]">{Array.from({ length: 13 }, (_, i) => <span key={i} className="w-[2px] rounded-full bg-white/80" style={{ height: `${5 + (i * 5 % 19)}px` }} />)}</div></div>}</div>}
          </div>
        </div>
      )}
      {showEmojiMenu && selectedTextId && <div className="fixed inset-0 z-[160] flex items-start justify-center bg-black/20 p-4 pt-[18vh]" onClick={() => setShowEmojiMenu(false)}><div role="dialog" aria-modal="true" aria-label="Emoji options" className="w-full max-w-xs rounded-2xl border border-border bg-card p-4 text-foreground shadow-xl" onClick={event => event.stopPropagation()}><h3 className="text-base font-semibold">Emoji options</h3><button className="mt-3 flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm hover:bg-muted" onClick={() => { const selected = textLayers.find(layer => layer.id === selectedTextId); if (selected) { const id = makeId(); setTextLayers(items => { const index = items.findIndex(item => item.id === selected.id); const duplicate = { ...selected, id, x: Math.min(92, selected.x + 4), y: Math.min(92, selected.y + 4) }; const nextItems = [...items]; nextItems.splice(index + 1, 0, duplicate); return nextItems }); setSelectedTextId(id) } setShowEmojiMenu(false) }}><Copy className="h-4 w-4" /> Duplicate</button><button className="mt-2 flex w-full items-center gap-2 rounded-xl border border-red-500/40 px-3 py-2.5 text-sm text-red-500 hover:bg-red-500/10" onClick={() => { setTextLayers(items => items.filter(item => item.id !== selectedTextId)); setSelectedTextId(null); setShowEmojiMenu(false) }}><Trash2 className="h-4 w-4" /> Delete</button><button className="mt-3 w-full rounded-xl border border-border px-3 py-2.5 text-sm font-medium hover:bg-muted" onClick={() => setShowEmojiMenu(false)}>Cancel</button></div></div>}
      {showTextMenu && selectedTextId && <div className="fixed inset-0 z-[160] flex items-start justify-center bg-black/20 p-4 pt-[18vh]" onClick={() => setShowTextMenu(false)}><div role="dialog" aria-modal="true" aria-label="Text options" className="w-full max-w-xs rounded-2xl border border-border bg-card p-4 text-foreground shadow-xl" onClick={event => event.stopPropagation()}><h3 className="text-base font-semibold">Text options</h3><button className="mt-3 flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm hover:bg-muted" onClick={() => { setShowTextMenu(false); setShowFontPicker(true) }}><Type className="h-4 w-4" /> Font</button><button className="mt-2 flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm hover:bg-muted" onClick={() => { const selected = textLayers.find(layer => layer.id === selectedTextId); setColorDraft(selected?.color || '#ffffff'); setShowTextMenu(false); setShowColorPicker(true) }}><span className="h-4 w-4 rounded-full border border-border" style={{ backgroundColor: textLayers.find(layer => layer.id === selectedTextId)?.color || '#ffffff' }} /> Color</button><button className="mt-2 flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm hover:bg-muted" onClick={() => { const selected = textLayers.find(layer => layer.id === selectedTextId); if (selected) { const id = makeId(); setTextLayers(items => { const index = items.findIndex(item => item.id === selected.id); const duplicate = { ...selected, id, x: Math.min(92, selected.x + 4), y: Math.min(92, selected.y + 4) }; const nextItems = [...items]; nextItems.splice(index + 1, 0, duplicate); return nextItems }); setSelectedTextId(id) } setShowTextMenu(false) }}><Copy className="h-4 w-4" /> Duplicate</button><button className="mt-2 flex w-full items-center gap-2 rounded-xl border border-red-500/40 px-3 py-2.5 text-sm text-red-500 hover:bg-red-500/10" onClick={() => { setTextLayers(items => items.filter(item => item.id !== selectedTextId)); setSelectedTextId(null); setShowTextMenu(false) }}><Trash2 className="h-4 w-4" /> Delete</button><button className="mt-3 w-full rounded-xl border border-border px-3 py-2.5 text-sm font-medium hover:bg-muted" onClick={() => setShowTextMenu(false)}>Cancel</button></div></div>}
      {showColorPicker && selectedTextId && <div className="fixed inset-0 z-[170] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Choose text color"><div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl"><h3 className="text-lg font-semibold">Custom text color</h3><p className="mt-1 text-sm text-muted-foreground">Choose a color or enter its HEX value.</p><div className="mt-4 flex items-center gap-3"><input aria-label="Choose text color" type="color" value={colorDraft} onChange={event => setColorDraft(event.target.value)} className="h-12 w-14 cursor-pointer rounded-lg border border-border bg-card p-1" /><input aria-label="HEX color" value={colorDraft} onChange={event => { const value = event.target.value; setColorDraft(value.startsWith('#') ? value : '#' + value) }} maxLength={7} className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm uppercase" /></div><div className="mt-4 flex gap-2"><button className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted" onClick={() => setShowColorPicker(false)}>Cancel</button><button className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50" disabled={!/^#[0-9a-fA-F]{6}$/.test(colorDraft)} onClick={() => { setTextLayers(items => items.map(layer => layer.id === selectedTextId ? { ...layer, color: colorDraft } : layer)); setShowColorPicker(false) }}>Apply color</button></div></div></div>}
      {showMusicPicker && <MusicPicker onSelect={(selected) => { setSong(selected); setSongOffset(0); setSongStart(0); setSongDuration(Math.min(5, storyDuration, selected.duration || storyDuration)); setShowMusicPicker(false) }} onClose={() => setShowMusicPicker(false)} />}
      {showMusicAdjust && song && <MusicAdjustModal song={song} initialStart={songOffset} initialDuration={Math.min(songDuration, storyDuration - songStart, getSongAvailableDuration())} maxDuration={getSongClipLimit(songStart)} onClose={() => setShowMusicAdjust(false)} onApply={(sourceStart, clipDuration) => { setSongOffset(sourceStart); setSongDuration(clipDuration); setShowMusicAdjust(false) }} />}
      {showFontPicker && <FontPicker previewText={textLayers.find(layer => layer.id === selectedTextId)?.text} currentFont={textLayers.find(layer => layer.id === selectedTextId)?.fontFamily !== undefined ? (textLayers.find(layer => layer.id === selectedTextId)?.fontFamily || '') : (font || '')} onSelect={(value) => { if (selectedTextId) setTextLayers(items => items.map(layer => layer.id === selectedTextId ? { ...layer, fontFamily: value || null } : layer)) }} onCancel={() => setShowFontPicker(false)} onDone={() => setShowFontPicker(false)} />}
      {showAudience && <StoryAudienceModal userId={userId} isPending={createPhotoStory.isPending} confirmLabel="Confirm Share" onClose={() => setShowAudience(false)} onConfirm={confirmShare} />}
    </div>
  )
}
