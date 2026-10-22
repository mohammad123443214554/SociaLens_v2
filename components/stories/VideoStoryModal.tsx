'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, AtSign, Check, Copy, Loader2, MoreVertical, Trash2, Type, Video, X, RotateCw, Sticker } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCreateStory, DraftVideoScene } from '@/lib/hooks/useStories'
import { StoryAudienceModal } from './StoryAudienceModal'
import { LimitAlertDialog } from '@/components/shared/LimitAlertDialog'
import { FontPicker } from './FontPicker'
import { StoryMentionPicker } from './StoryMentionPicker'
import { StoryStickerSidebar } from './StoryStickerSidebar'
import type { StoryMentionOverlay } from '@/lib/types/database.types'
import type { StoryVisibility } from '@/lib/types/database.types'
import { clearStoryDraft, saveStoryDraft, type StoryDraftRecord } from '@/lib/utils/storyDraft'

interface VideoStoryModalProps {
  userId: string
  onClose: () => void
  onBack: () => void
  initialFile?: File
  initialDraft?: StoryDraftRecord | null
}

const MAX_STORY_VIDEO_SECONDS = 5 * 60

export function VideoStoryModal({ userId, onClose, onBack, initialFile, initialDraft }: VideoStoryModalProps) {
  const [file, setFile] = useState<File | null>(initialFile || null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [duration, setDuration] = useState(initialDraft?.video?.duration ?? 0)
  const [trimStart, setTrimStart] = useState(initialDraft?.video?.trimStart ?? 0)
  const [trimEnd, setTrimEnd] = useState(initialDraft?.video?.trimEnd ?? (initialDraft?.video?.duration ?? 0))
  const [timelineDrag, setTimelineDrag] = useState<{ edge: 'start' | 'end' | 'move'; pointerX: number; start: number; end: number } | null>(null)
  const timelineDragRef = useRef<{ edge: 'start' | 'end' | 'move'; pointerX: number; start: number; end: number } | null>(null)
  const [textTimelineDrag, setTextTimelineDrag] = useState<{ id: string; edge: 'start' | 'end' | 'move'; pointerX: number; start: number; duration: number } | null>(null)
  const [textDraft, setTextDraft] = useState('')
  const [textLayers, setTextLayers] = useState<Array<{ id: string; text: string; x: number; y: number; scale: number; rotation: number; color: string; fontFamily?: string | null; start?: number; duration?: number }>>(() => (initialDraft?.video?.textLayers || []).map(layer => ({ rotation: 0, color: '#ffffff', ...layer })))
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)
  const [showTextInput, setShowTextInput] = useState(false)
  const [showTextMenu, setShowTextMenu] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [colorDraft, setColorDraft] = useState('#ffffff')
  const [resizeDrag, setResizeDrag] = useState<{ id: string; startX: number; scale: number } | null>(null)
  const [rotateDrag, setRotateDrag] = useState<{ id: string; startAngle: number; rotation: number } | null>(null)
  const [showFontPicker, setShowFontPicker] = useState(false)
  const [showMentionPicker, setShowMentionPicker] = useState(false)
  const [showStickerSidebar, setShowStickerSidebar] = useState(false)
  const [mentions, setMentions] = useState<StoryMentionOverlay[]>(() => initialDraft?.video?.mentions || [])
  const [showPreview, setShowPreview] = useState(false)
  const [exitAction, setExitAction] = useState<'close' | 'back' | null>(null)
  const [previewTime, setPreviewTime] = useState(0)
  const previewVideoRef = useRef<HTMLVideoElement>(null)
  const [showAudience, setShowAudience] = useState(false)
  const [showLimit, setShowLimit] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const replaceInput = useRef<HTMLInputElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const textDragging = useRef(false)
  const mentionDragging = useRef<string | null>(null)
  const mentionResizeDrag = useRef<{ id: string; startX: number; scale: number } | null>(null)
  const mentionRotateDrag = useRef<{ id: string; startAngle: number; rotation: number; centerX: number; centerY: number } | null>(null)
  const { createVideoStory } = useCreateStory()

  useEffect(() => {
    if (!file) { setPreviewUrl(null); setDuration(0); return }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  useEffect(() => {
    if (!file) return
    const draft: StoryDraftRecord = {
      userId, kind: 'video', file, fileName: file.name, fileType: file.type, lastModified: file.lastModified,
      video: { duration, trimStart, trimEnd, textLayers, mentions },
      updatedAt: Date.now(),
    }
    const timer = window.setTimeout(() => { void saveStoryDraft(draft).catch(() => {}) }, 120)
    return () => window.clearTimeout(timer)
  }, [userId, file, duration, trimStart, trimEnd, textLayers, mentions])

  const onVideoMetadata = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const seconds = event.currentTarget.duration
    if (!Number.isFinite(seconds) || seconds <= 0) {
      setError('This video could not be read. Please choose another video.')
      return
    }
    if (seconds > MAX_STORY_VIDEO_SECONDS) {
      setDuration(seconds)
      setShowLimit(true)
      setError('Videos must be 5 minutes or shorter.')
      return
    }
    setDuration(seconds)
    setTrimStart(current => Math.min(current, Math.max(0, seconds - 1)))
    setTrimEnd(current => current > 0 ? Math.min(current, seconds) : seconds)
    setError(null)
  }

  const onShare = () => {
    if (!file || !previewUrl) { setError('Choose a video before sharing your story.'); return }
    if (!duration || duration > MAX_STORY_VIDEO_SECONDS) { setError('Please choose a valid video that is 5 minutes or shorter.'); return }
    setError(null)
    setShowAudience(true)
  }

  const confirmShare = async (visibility: StoryVisibility, selectedIds: string[]) => {
    if (!file || !duration || duration > MAX_STORY_VIDEO_SECONDS || trimEnd <= trimStart || createVideoStory.isPending) return
    const scene: DraftVideoScene = {
      id: Math.random().toString(36).slice(2, 10),
      file,
      duration: Math.max(1, Math.round(trimEnd - trimStart)),
      trimStart: Math.max(0, trimStart),
      trimEnd: Math.max(trimStart + 1, trimEnd),
      overlayX: 50,
      overlayY: 50,
      overlayTexts: textLayers.map(layer => ({ ...layer, start: layer.start ?? 0, duration: layer.duration ?? Math.max(1, Math.round(trimEnd - trimStart)) })),
      mentions,
      ...(textLayers[0] ? { overlayText: textLayers[0].text, overlayFontFamily: textLayers[0].fontFamily || undefined, overlayX: textLayers[0].x, overlayY: textLayers[0].y } : {}),
    }
    try {
      await createVideoStory.mutateAsync({ userId, scenes: [scene], visibility, visibilitySelectedIds: selectedIds })
      setShowAudience(false)
      await clearStoryDraft(userId).catch(() => {})
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? 'Could not publish your video story: ' + cause.message : 'Could not publish your video story. Please try again.')
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-3 sm:px-5">
        <button onClick={() => setExitAction('back')} aria-label="Back to story upload choices" className="rounded-full p-2 hover:bg-muted"><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="text-sm font-semibold sm:text-base">Video story</h1>
        <button onClick={() => setExitAction('close')} aria-label="Close story creator" className="rounded-full p-2 hover:bg-muted"><X className="h-5 w-5" /></button>
      </header>

      <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-auto p-3 sm:p-6">
        <div ref={stageRef} className="relative flex min-h-[220px] w-full max-w-sm items-center justify-center overflow-hidden rounded-2xl bg-black sm:max-h-[calc(100dvh-180px)]">
          {previewUrl ? (
            <video key={previewUrl} src={previewUrl} controls playsInline preload="metadata" onLoadedMetadata={event => { onVideoMetadata(event); const video = event.currentTarget; if (trimStart > 0) video.currentTime = trimStart }} onTimeUpdate={event => { const video = event.currentTarget; if (video.currentTime >= trimEnd && trimEnd > trimStart) { video.pause(); video.currentTime = trimStart } }} onPlay={event => { const video = event.currentTarget; if (video.currentTime < trimStart || video.currentTime >= trimEnd) video.currentTime = trimStart }} onError={() => setError('This video could not be played. Please choose another supported video file.')} className="max-h-[calc(100dvh-210px)] w-full object-contain" />
          ) : (
            <div className="p-8 text-center text-white/70"><Video className="mx-auto mb-2 h-10 w-10" /><p>No video selected</p></div>
          )}
          {textLayers.map(layer => <div key={layer.id} onPointerDown={event => { setSelectedTextId(layer.id); textDragging.current = true; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { if (!textDragging.current || !stageRef.current) return; const rect = stageRef.current.getBoundingClientRect(); setTextLayers(items => items.map(item => item.id === layer.id ? { ...item, x: Math.min(92, Math.max(8, ((event.clientX - rect.left) / rect.width) * 100)), y: Math.min(92, Math.max(8, ((event.clientY - rect.top) / rect.height) * 100)) } : item)) }} onPointerUp={() => { textDragging.current = false }} onPointerCancel={() => { textDragging.current = false }} onClick={() => setSelectedTextId(layer.id)} className={`absolute z-20 max-w-[85%] cursor-move touch-none rounded-sm px-2 py-1 text-center font-bold text-white [text-shadow:0_2px_8px_rgba(0,0,0,0.9)] ${selectedTextId === layer.id ? 'outline outline-1 outline-white outline-offset-2' : ''}`} style={{ left: `${layer.x}%`, top: `${layer.y}%`, transform: `translate(-50%, -50%) rotate(${layer.rotation}deg)`, fontSize: `${20 * layer.scale}px`, color: layer.color, fontFamily: layer.fontFamily ? `'${layer.fontFamily}', sans-serif` : undefined }}><span>{layer.text}</span>{selectedTextId === layer.id && <button type="button" aria-label="Text options" onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); setShowTextMenu(true) }} className="absolute -right-3 -top-8 flex h-6 w-6 items-center justify-center rounded-full border border-white bg-black/80 text-white"><MoreVertical className="h-4 w-4" /></button>}{selectedTextId === layer.id && <button type="button" aria-label="Rotate text" title="Drag to rotate" onPointerDown={event => { event.stopPropagation(); const rect = stageRef.current?.getBoundingClientRect(); if (!rect) return; const centerX = rect.left + rect.width * layer.x / 100; const centerY = rect.top + rect.height * layer.y / 100; setRotateDrag({ id: layer.id, startAngle: Math.atan2(event.clientY-centerY,event.clientX-centerX)*180/Math.PI, rotation: layer.rotation }); event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { event.stopPropagation(); if (!rotateDrag || rotateDrag.id !== layer.id) return; const rect = stageRef.current?.getBoundingClientRect(); if (!rect) return; const centerX = rect.left + rect.width * layer.x / 100; const centerY = rect.top + rect.height * layer.y / 100; const angle = Math.atan2(event.clientY-centerY,event.clientX-centerX)*180/Math.PI; setTextLayers(items => items.map(item => item.id === layer.id ? {...item,rotation:Math.round(rotateDrag.rotation+angle-rotateDrag.startAngle)} : item)) }} onPointerUp={() => setRotateDrag(null)} onPointerCancel={() => setRotateDrag(null)} className="absolute -bottom-2 -left-2 flex h-4 w-4 touch-none items-center justify-center rounded-full border-2 border-white bg-blue-500 shadow"><RotateCw className="h-2.5 w-2.5 text-white" /></button>}{selectedTextId === layer.id && <button type="button" aria-label="Resize text" onPointerDown={event => { event.stopPropagation(); setResizeDrag({ id: layer.id, startX: event.clientX, scale: layer.scale }); event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { event.stopPropagation(); if (!resizeDrag || resizeDrag.id !== layer.id) return; const scale = Math.max(0.55,Math.min(3,resizeDrag.scale+(event.clientX-resizeDrag.startX)/100)); setTextLayers(items => items.map(item => item.id === layer.id ? {...item,scale} : item)) }} onPointerUp={() => setResizeDrag(null)} onPointerCancel={() => setResizeDrag(null)} className="absolute -bottom-2 -right-2 h-4 w-4 touch-none rounded-full border-2 border-white bg-pink-500 shadow" />}</div>)}
          {mentions.map(mention => <div key={mention.id} onPointerDown={event => { event.preventDefault(); event.stopPropagation(); mentionDragging.current = mention.id; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { if (mentionDragging.current !== mention.id || !stageRef.current) return; const rect = stageRef.current.getBoundingClientRect(); setMentions(items => items.map(item => item.id === mention.id ? { ...item, x: Math.min(90, Math.max(10, ((event.clientX - rect.left) / rect.width) * 100)), y: Math.min(92, Math.max(8, ((event.clientY - rect.top) / rect.height) * 100)) } : item)) }} onPointerUp={() => { mentionDragging.current = null }} onPointerCancel={() => { mentionDragging.current = null }} className="absolute z-30 flex max-w-[88%] select-none cursor-move touch-none items-center gap-2 rounded-full border border-white/50 bg-black/75 px-3 py-2 text-white shadow-lg" style={{ left: `${mention.x}%`, top: `${mention.y}%`, transform: `translate(-50%, -50%) rotate(${mention.rotation ?? 0}deg) scale(${mention.scale})` }}><AtSign className="h-4 w-4 text-pink-300" /><span className="max-w-40 truncate text-sm font-semibold">@{mention.username}</span><button type="button" aria-label={`Remove @${mention.username}`} onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); setMentions(items => items.filter(item => item.id !== mention.id)) }} className="rounded-full bg-white/15 p-1"><X className="h-3 w-3" /></button><button type="button" aria-label={`Resize mention @${mention.username}`} title="Drag to resize" onPointerDown={event => { event.preventDefault(); event.stopPropagation(); mentionDragging.current = null; mentionResizeDrag.current = { id: mention.id, startX: event.clientX, scale: mention.scale }; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { const drag = mentionResizeDrag.current; if (!drag || drag.id !== mention.id) return; event.preventDefault(); event.stopPropagation(); setMentions(items => items.map(item => item.id === mention.id ? { ...item, scale: Math.max(0.7, Math.min(2, drag.scale + (event.clientX - drag.startX) / 140)) } : item)) }} onPointerUp={() => { mentionResizeDrag.current = null }} onPointerCancel={() => { mentionResizeDrag.current = null }} className="ml-0.5 h-3.5 w-3.5 shrink-0 touch-none rounded-full border-2 border-white bg-pink-500" /><button type="button" aria-label={`Rotate mention @${mention.username}`} title="Drag to rotate" onPointerDown={event => { event.preventDefault(); event.stopPropagation(); mentionDragging.current = null; const rect = stageRef.current?.getBoundingClientRect(); if (!rect) return; const centerX = rect.left + rect.width * mention.x / 100; const centerY = rect.top + rect.height * mention.y / 100; mentionRotateDrag.current = { id: mention.id, startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI, rotation: mention.rotation ?? 0, centerX, centerY }; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { const drag = mentionRotateDrag.current; if (!drag || drag.id !== mention.id) return; event.preventDefault(); event.stopPropagation(); const angle = Math.atan2(event.clientY - drag.centerY, event.clientX - drag.centerX) * 180 / Math.PI; setMentions(items => items.map(item => item.id === mention.id ? { ...item, rotation: Math.round(drag.rotation + angle - drag.startAngle) } : item)) }} onPointerUp={() => { mentionRotateDrag.current = null }} onPointerCancel={() => { mentionRotateDrag.current = null }} className="flex h-4 w-4 shrink-0 touch-none items-center justify-center rounded-full border-2 border-white bg-blue-500 shadow"><RotateCw className="h-2.5 w-2.5 text-white" /></button></div>)}
        </div>
        <div className="w-full max-w-sm space-y-3">
          <div className="space-y-3">
            <section aria-label="Story timeline" className="mx-auto box-border w-[min(652px,calc(100vw-24px))] shrink-0 overflow-hidden rounded-md border border-border bg-card px-[9px] py-[4px]" style={{ height: 92 + Math.max(0, textLayers.length - 1) * 29 }}>
              <div className="flex w-full flex-col gap-[2px]">
                {textLayers.length === 0 ? <div className="relative h-[27px] w-full overflow-hidden rounded-sm bg-muted"><span className="absolute inset-y-0 left-2 flex items-center text-[11px] font-semibold">Text</span></div> : textLayers.map(layer => <div key={layer.id} className="relative h-[27px] w-full overflow-hidden rounded-sm bg-muted/70"><div className={"absolute inset-y-0 overflow-hidden rounded-sm bg-violet-500/90 " + (selectedTextId === layer.id ? 'ring-1 ring-white' : '')} style={{ left: `${((layer.start ?? 0) / Math.max(trimEnd-trimStart,1)) * 100}%`, width: `${Math.max(3, ((layer.duration ?? Math.max(trimEnd-trimStart,1)) / Math.max(trimEnd-trimStart,1)) * 100)}%` }} onPointerDown={event => { const edge = (event.target as HTMLElement).closest('[data-edge]')?.getAttribute('data-edge') as 'start'|'end'|null; setSelectedTextId(layer.id); setTextTimelineDrag({ id: layer.id, edge: edge || 'move', pointerX: event.clientX, start: layer.start ?? 0, duration: layer.duration ?? Math.max(trimEnd-trimStart,1) }); event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { if (!textTimelineDrag || textTimelineDrag.id !== layer.id) return; const rect = event.currentTarget.parentElement?.getBoundingClientRect(); if (!rect) return; const delta = (event.clientX-textTimelineDrag.pointerX)/rect.width*Math.max(trimEnd-trimStart,1); setTextLayers(items => items.map(item => { if (item.id !== layer.id) return item; const total = Math.max(trimEnd-trimStart,1); if (textTimelineDrag.edge === 'move') return { ...item, start: Math.max(0,Math.min(total-textTimelineDrag.duration,Math.round(textTimelineDrag.start+delta))), duration: textTimelineDrag.duration }; if (textTimelineDrag.edge === 'start') { const end = textTimelineDrag.start+textTimelineDrag.duration; const start = Math.max(0,Math.min(end-1,Math.round(textTimelineDrag.start+delta))); return { ...item,start,duration:end-start } } return { ...item,start:textTimelineDrag.start,duration:Math.max(1,Math.min(total-textTimelineDrag.start,Math.round(textTimelineDrag.duration+delta))) } })) }} onPointerUp={() => setTextTimelineDrag(null)} onPointerCancel={() => setTextTimelineDrag(null)}><span data-edge="start" className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize bg-violet-200/90" /><span data-edge="end" className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize bg-violet-200/90" /><span className="absolute inset-0 flex items-center overflow-hidden px-2 text-[10px] font-semibold text-white whitespace-nowrap">{layer.text.length > 18 ? layer.text.slice(0,18) + '…' : layer.text}</span></div></div>)}
                <div className="relative h-[52px] w-full touch-none select-none overflow-hidden rounded-sm bg-muted" style={{ touchAction: 'none' }} onPointerDown={event => { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); const x = event.clientX - rect.left; const handle = (event.target as HTMLElement).closest('[data-trim-edge]')?.getAttribute('data-trim-edge') as 'start' | 'end' | null; const startPx = trimStart / Math.max(duration,1) * rect.width; const endPx = trimEnd / Math.max(duration,1) * rect.width; const edge: 'start' | 'end' | 'move' = handle || (Math.abs(x-startPx) <= Math.abs(x-endPx) && Math.abs(x-startPx) < 18 ? 'start' : Math.abs(x-endPx) < 18 ? 'end' : 'move'); const drag = { edge, pointerX: event.clientX, start: trimStart, end: trimEnd }; timelineDragRef.current = drag; setTimelineDrag(drag); event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { const drag = timelineDragRef.current; if (!drag || !duration) return; event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); if (!rect.width) return; const delta = (event.clientX - drag.pointerX) / rect.width * duration; const minLength = Math.min(0.25, duration); if (drag.edge === 'start') { const next = Math.max(0, Math.min(drag.end-minLength, drag.start+delta)); setTrimStart(next) } else if (drag.edge === 'end') { const next = Math.min(duration, Math.max(drag.start+minLength, drag.end+delta)); setTrimEnd(next) } else { const length = drag.end-drag.start; const nextStart = Math.max(0, Math.min(duration-length, drag.start+delta)); setTrimStart(nextStart); setTrimEnd(nextStart+length) } }} onPointerUp={() => { timelineDragRef.current = null; setTimelineDrag(null) }} onPointerCancel={() => { timelineDragRef.current = null; setTimelineDrag(null) }} aria-label="Video trim timeline">
                  <div className="absolute inset-y-0 left-0 right-0 bg-sky-500/20" />
                  <div className="absolute inset-y-0 rounded-sm border-x-2 border-pink-200 bg-pink-500/90" style={{ left: `${trimStart / Math.max(duration,1) * 100}%`, width: `${Math.max(1, (trimEnd-trimStart) / Math.max(duration,1) * 100)}%` }}><span data-trim-edge="start" className="absolute inset-y-0 left-0 z-20 w-4 cursor-ew-resize touch-none bg-pink-200" /><span data-trim-edge="end" className="absolute inset-y-0 right-0 z-20 w-4 cursor-ew-resize touch-none bg-sky-200" /></div>
                  <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-xs font-semibold text-foreground">Video</span><span className="pointer-events-none absolute inset-y-0 right-2 flex items-center rounded bg-black/65 px-1.5 text-[10px] font-medium text-white">{Math.max(1, Math.round(trimEnd - trimStart))}s</span>
                </div>
              </div>
            </section>
            {showTextInput && <div className="flex gap-2"><input autoFocus value={textDraft} onChange={event => setTextDraft(event.target.value)} maxLength={150} placeholder="Write something…" className="min-w-0 flex-1 rounded-xl border border-border bg-card px-3 py-2.5 text-sm" /><button type="button" onClick={() => { const value = textDraft.trim(); if (value) setTextLayers(items => [...items, { id: Math.random().toString(36).slice(2, 10), text: value, x: 50, y: 50, scale: 1, rotation: 0, color: '#ffffff', start: 0, duration: Math.max(1, trimEnd-trimStart) }]); setTextDraft(''); setShowTextInput(false) }} aria-label="Add text to video story" className="rounded-xl bg-pink-500 px-3 text-white"><Check className="h-4 w-4" /></button></div>}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <button type="button" onClick={() => { setTextDraft(''); setShowTextInput(true) }} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-2 text-sm font-medium hover:bg-muted"><Type className="h-4 w-4" /> Add Text</button>
              <button type="button" onClick={() => setShowStickerSidebar(true)} className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-2 text-sm font-medium hover:bg-muted"><Sticker className="h-4 w-4" /> Sticker</button>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="shrink-0" onClick={() => replaceInput.current?.click()}>Replace video</Button>
            <Button type="button" variant="outline" className="shrink-0" onClick={() => { if (!previewUrl || trimEnd <= trimStart) { setError('Choose a valid video segment to preview.'); return } const editorVideo = stageRef.current?.querySelector('video'); editorVideo?.pause(); setPreviewTime(trimStart); setShowPreview(true) }}>Preview</Button>
            <Button className="flex-1" onClick={onShare} disabled={!file || !duration || duration > MAX_STORY_VIDEO_SECONDS || trimEnd <= trimStart || createVideoStory.isPending}>
              {createVideoStory.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Publishing…</> : 'Share'}
            </Button>
          </div>
          <input ref={replaceInput} type="file" accept="video/*" className="hidden" onChange={(e) => { const next = e.target.files?.[0]; e.currentTarget.value = ''; if (next && next.type.startsWith('video/')) { setFile(next); setDuration(0); setTrimStart(0); setTrimEnd(0); setError(null) } else if (next) setError('Please choose a supported video file.') }} />
          {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        </div>
      </main>

      {exitAction && <div className="fixed inset-0 z-[190] flex items-center justify-center bg-black/60 p-4" role="alertdialog" aria-modal="true" aria-labelledby="video-exit-title" aria-describedby="video-exit-description"><div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl"><h2 id="video-exit-title" className="text-lg font-semibold">Leave video editor?</h2><p id="video-exit-description" className="mt-2 text-sm text-muted-foreground">If you leave now, your current edits may be lost. Do you want to continue editing or discard your changes?</p><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => setExitAction(null)}>Continue editing</Button><Button type="button" variant="destructive" onClick={() => { const action = exitAction; setExitAction(null); if (action === 'back') onBack(); else onClose() }}>Discard changes</Button></div></div></div>}
      {showPreview && previewUrl && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/95 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Edited video story preview">
          <button type="button" onClick={() => { previewVideoRef.current?.pause(); setShowPreview(false) }} aria-label="Close story preview" className="absolute right-4 top-4 z-50 rounded-full bg-white/15 p-2 text-white hover:bg-white/25"><X className="h-5 w-5" /></button>
          <div className="relative flex h-[min(84dvh,760px)] aspect-[9/16] max-w-full items-center justify-center overflow-hidden rounded-2xl bg-black">
            <video
              ref={previewVideoRef}
              key={previewUrl + '-story-preview'}
              src={previewUrl}
              playsInline
              autoPlay
              preload="metadata"
              onLoadedMetadata={event => { const video = event.currentTarget; video.currentTime = trimStart; setPreviewTime(trimStart); void video.play().catch(() => setError('Video preview could not start.')) }}
              onTimeUpdate={event => { const video = event.currentTarget; setPreviewTime(video.currentTime); if (video.currentTime >= trimEnd) video.pause() }}
              onError={() => setError('This video could not be played. Please choose another supported video file.')}
              className="h-full w-full object-contain"
            />
            {textLayers.filter(layer => { const elapsed = previewTime - trimStart; const start = layer.start ?? 0; const length = layer.duration ?? Math.max(1, trimEnd - trimStart); return elapsed >= start && elapsed < start + Math.min(length, Math.max(0, trimEnd - trimStart - start)) }).map(layer => (
              <div key={layer.id} className="pointer-events-none absolute z-20 max-w-[85%] rounded-sm px-2 py-1 text-center font-bold [text-shadow:0_2px_8px_rgba(0,0,0,0.9)]" style={{ left: `${layer.x}%`, top: `${layer.y}%`, transform: `translate(-50%, -50%) rotate(${layer.rotation}deg)`, fontSize: `${20 * layer.scale}px`, color: layer.color, fontFamily: layer.fontFamily ? `'${layer.fontFamily}', sans-serif` : undefined }}>{layer.text}</div>
            ))}
            {mentions.map(mention => <div key={mention.id} className="pointer-events-none absolute z-30 flex max-w-[88%] items-center gap-2 rounded-full border border-white/50 bg-black/75 px-3 py-2 text-white shadow-lg" style={{ left: `${mention.x}%`, top: `${mention.y}%`, transform: `translate(-50%, -50%) rotate(${mention.rotation ?? 0}deg) scale(${mention.scale})` }}><AtSign className="h-4 w-4 text-pink-300" /><span className="max-w-40 truncate text-sm font-semibold">@{mention.username}</span></div>)}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-40 h-1 bg-white/30"><div className="h-full bg-white" style={{ width: `${Math.max(0, Math.min(100, ((previewTime - trimStart) / Math.max(trimEnd - trimStart, 0.001)) * 100))}%` }} /></div>
          </div>
        </div>
      )}
      {showTextMenu && selectedTextId && <div className="fixed inset-0 z-[160] flex items-start justify-center bg-black/20 p-4 pt-[18vh]" onClick={() => setShowTextMenu(false)}><div role="dialog" aria-modal="true" aria-label="Text options" className="w-full max-w-xs rounded-2xl border border-border bg-card p-4 text-foreground shadow-xl" onClick={event => event.stopPropagation()}><h3 className="text-base font-semibold">Text options</h3><button className="mt-3 flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm hover:bg-muted" onClick={() => { setShowTextMenu(false); setShowFontPicker(true) }}><Type className="h-4 w-4" /> Font</button><button className="mt-2 flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm hover:bg-muted" onClick={() => { const selected = textLayers.find(layer => layer.id === selectedTextId); setColorDraft(selected?.color || '#ffffff'); setShowTextMenu(false); setShowColorPicker(true) }}><span className="h-4 w-4 rounded-full border border-border" style={{ backgroundColor: textLayers.find(layer => layer.id === selectedTextId)?.color || '#ffffff' }} /> Color</button><button className="mt-2 flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm hover:bg-muted" onClick={() => { const selected = textLayers.find(layer => layer.id === selectedTextId); if (selected) { const id = Math.random().toString(36).slice(2,10); setTextLayers(items => { const index = items.findIndex(item => item.id === selected.id); const next = [...items]; next.splice(index+1,0,{...selected,id,x:Math.min(92,selected.x+4),y:Math.min(92,selected.y+4)}); return next }); setSelectedTextId(id) } setShowTextMenu(false) }}><Copy className="h-4 w-4" /> Duplicate</button><button className="mt-2 flex w-full items-center gap-2 rounded-xl border border-red-500/40 px-3 py-2.5 text-sm text-red-500 hover:bg-red-500/10" onClick={() => { setTextLayers(items => items.filter(item => item.id !== selectedTextId)); setSelectedTextId(null); setShowTextMenu(false) }}><Trash2 className="h-4 w-4" /> Delete</button><button className="mt-3 w-full rounded-xl border border-border px-3 py-2.5 text-sm font-medium hover:bg-muted" onClick={() => setShowTextMenu(false)}>Cancel</button></div></div>}
      {showColorPicker && selectedTextId && <div className="fixed inset-0 z-[170] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Choose text color"><div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl"><h3 className="text-lg font-semibold">Custom text color</h3><p className="mt-1 text-sm text-muted-foreground">Choose a color or enter its HEX value.</p><div className="mt-4 flex items-center gap-3"><input aria-label="Choose text color" type="color" value={colorDraft} onChange={event => setColorDraft(event.target.value)} className="h-12 w-14 cursor-pointer rounded-lg border border-border bg-card p-1" /><input aria-label="HEX color" value={colorDraft} onChange={event => { const value = event.target.value; setColorDraft(value.startsWith('#') ? value : '#'+value) }} maxLength={7} className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm uppercase" /></div><div className="mt-4 flex gap-2"><button className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted" onClick={() => setShowColorPicker(false)}>Cancel</button><button className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50" disabled={!/^#[0-9a-fA-F]{6}$/.test(colorDraft)} onClick={() => { setTextLayers(items => items.map(layer => layer.id === selectedTextId ? {...layer,color:colorDraft} : layer)); setShowColorPicker(false) }}>Apply color</button></div></div></div>}
      {showFontPicker && selectedTextId && <FontPicker previewText={textLayers.find(layer => layer.id === selectedTextId)?.text} currentFont={textLayers.find(layer => layer.id === selectedTextId)?.fontFamily || ''} onSelect={value => setTextLayers(items => items.map(layer => layer.id === selectedTextId ? { ...layer, fontFamily: value || null } : layer))} onCancel={() => setShowFontPicker(false)} onDone={() => setShowFontPicker(false)} />}
      {showStickerSidebar && <StoryStickerSidebar onClose={() => setShowStickerSidebar(false)} onMention={() => { setShowStickerSidebar(false); setShowMentionPicker(true) }} />}
      {showMentionPicker && <StoryMentionPicker userId={userId} selected={mentions.map(item => ({ id: item.userId, username: item.username, full_name: item.fullName, avatar_url: item.avatarUrl }))} onClose={() => setShowMentionPicker(false)} onConfirm={people => { setMentions(current => { const retained = current.filter(item => people.some(person => person.id === item.userId)); const retainedIds = new Set(retained.map(item => item.userId)); const added = people.filter(person => !retainedIds.has(person.id)).map((person, index) => ({ id: Math.random().toString(36).slice(2, 10), userId: person.id, username: person.username, fullName: person.full_name, avatarUrl: person.avatar_url, x: 50, y: Math.min(88, 64 + index * 8), scale: 1 })); return [...retained, ...added] }); setShowMentionPicker(false) }} />}
      {showAudience && <StoryAudienceModal userId={userId} isPending={createVideoStory.isPending} confirmLabel="Confirm Share" onClose={() => setShowAudience(false)} onConfirm={confirmShare} />}
      {showLimit && <LimitAlertDialog title="Video is too long" description="Story videos must be 5 minutes or shorter. Please choose a shorter clip." onClose={() => setShowLimit(false)} />}
    </div>
  )
}
