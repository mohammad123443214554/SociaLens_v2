'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, AtSign, Check, Copy, Loader2, MoreVertical, Trash2, Type, Video, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCreateStory, DraftVideoScene } from '@/lib/hooks/useStories'
import { StoryAudienceModal } from './StoryAudienceModal'
import { LimitAlertDialog } from '@/components/shared/LimitAlertDialog'
import { FontPicker } from './FontPicker'
import { StoryMentionPicker } from './StoryMentionPicker'
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
  const [editing, setEditing] = useState(false)
  const [textDraft, setTextDraft] = useState('')
  const [textLayers, setTextLayers] = useState<Array<{ id: string; text: string; x: number; y: number; scale: number; rotation: number; color: string; fontFamily?: string | null }>>(() => (initialDraft?.video?.textLayers || []).map(layer => ({ rotation: 0, color: '#ffffff', ...layer })))
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)
  const [showTextInput, setShowTextInput] = useState(false)
  const [showTextMenu, setShowTextMenu] = useState(false)
  const [showFontPicker, setShowFontPicker] = useState(false)
  const [showMentionPicker, setShowMentionPicker] = useState(false)
  const [mentions, setMentions] = useState<StoryMentionOverlay[]>(() => initialDraft?.video?.mentions || [])
  const [previewing, setPreviewing] = useState(false)
  const [showAudience, setShowAudience] = useState(false)
  const [showLimit, setShowLimit] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const replaceInput = useRef<HTMLInputElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const textDragging = useRef(false)
  const mentionDragging = useRef<string | null>(null)
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
      video: { duration, textLayers, mentions },
      updatedAt: Date.now(),
    }
    const timer = window.setTimeout(() => { void saveStoryDraft(draft).catch(() => {}) }, 120)
    return () => window.clearTimeout(timer)
  }, [userId, file, duration, textLayers, mentions])

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
    setError(null)
  }

  const onShare = () => {
    if (!file || !previewUrl) { setError('Choose a video before sharing your story.'); return }
    if (!duration || duration > MAX_STORY_VIDEO_SECONDS) { setError('Please choose a valid video that is 5 minutes or shorter.'); return }
    setError(null)
    setShowAudience(true)
  }

  const confirmShare = async (visibility: StoryVisibility, selectedIds: string[]) => {
    if (!file || !duration || duration > MAX_STORY_VIDEO_SECONDS || createVideoStory.isPending) return
    const scene: DraftVideoScene = {
      id: Math.random().toString(36).slice(2, 10),
      file,
      duration: Math.max(1, Math.round(duration)),
      overlayX: 50,
      overlayY: 50,
      overlayTexts: textLayers.map(layer => ({ ...layer, start: 0, duration: Math.max(1, Math.round(duration)) })),
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
        <button onClick={onBack} aria-label="Back to story upload choices" className="rounded-full p-2 hover:bg-muted"><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="text-sm font-semibold sm:text-base">Video story</h1>
        <button onClick={onClose} aria-label="Close story creator" className="rounded-full p-2 hover:bg-muted"><X className="h-5 w-5" /></button>
      </header>

      <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-auto p-3 sm:p-6">
        <div ref={stageRef} className="relative flex min-h-[220px] w-full max-w-sm items-center justify-center overflow-hidden rounded-2xl bg-black sm:max-h-[calc(100dvh-180px)]">
          {previewUrl ? (
            <video key={previewUrl} src={previewUrl} controls playsInline preload="metadata" onLoadedMetadata={onVideoMetadata} onError={() => setError('This video could not be played. Please choose another supported video file.')} className="max-h-[calc(100dvh-210px)] w-full object-contain" />
          ) : (
            <div className="p-8 text-center text-white/70"><Video className="mx-auto mb-2 h-10 w-10" /><p>No video selected</p></div>
          )}
          {editing && textLayers.map(layer => <div key={layer.id} onPointerDown={event => { setSelectedTextId(layer.id); textDragging.current = true; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { if (!textDragging.current || !stageRef.current) return; const rect = stageRef.current.getBoundingClientRect(); setTextLayers(items => items.map(item => item.id === layer.id ? { ...item, x: Math.min(92, Math.max(8, ((event.clientX - rect.left) / rect.width) * 100)), y: Math.min(92, Math.max(8, ((event.clientY - rect.top) / rect.height) * 100)) } : item)) }} onPointerUp={() => { textDragging.current = false }} onPointerCancel={() => { textDragging.current = false }} onClick={() => setSelectedTextId(layer.id)} className={`absolute z-20 max-w-[85%] cursor-move touch-none rounded-sm px-2 py-1 text-center font-bold text-white [text-shadow:0_2px_8px_rgba(0,0,0,0.9)] ${selectedTextId === layer.id ? 'outline outline-1 outline-white outline-offset-2' : ''}`} style={{ left: `${layer.x}%`, top: `${layer.y}%`, transform: `translate(-50%, -50%) rotate(${layer.rotation}deg)`, fontSize: `${20 * layer.scale}px`, color: layer.color, fontFamily: layer.fontFamily ? `'${layer.fontFamily}', sans-serif` : undefined }}><span>{layer.text}</span>{selectedTextId === layer.id && <button type="button" aria-label="Text options" onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); setShowTextMenu(true) }} className="absolute -right-3 -top-8 flex h-6 w-6 items-center justify-center rounded-full border border-white bg-black/80 text-white"><MoreVertical className="h-4 w-4" /></button>}</div>)}
          {editing && mentions.map(mention => <div key={mention.id} onPointerDown={event => { event.stopPropagation(); mentionDragging.current = mention.id; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { if (mentionDragging.current !== mention.id || !stageRef.current) return; const rect = stageRef.current.getBoundingClientRect(); setMentions(items => items.map(item => item.id === mention.id ? { ...item, x: Math.min(90, Math.max(10, ((event.clientX - rect.left) / rect.width) * 100)), y: Math.min(92, Math.max(8, ((event.clientY - rect.top) / rect.height) * 100)) } : item)) }} onPointerUp={() => { mentionDragging.current = null }} onPointerCancel={() => { mentionDragging.current = null }} className="absolute z-30 flex max-w-[88%] cursor-move touch-none items-center gap-2 rounded-full border border-white/50 bg-black/75 px-3 py-2 text-white shadow-lg" style={{ left: `${mention.x}%`, top: `${mention.y}%`, transform: `translate(-50%, -50%) scale(${mention.scale})` }}><AtSign className="h-4 w-4 text-pink-300" /><span className="max-w-40 truncate text-sm font-semibold">@{mention.username}</span><button type="button" aria-label={`Remove @${mention.username}`} onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); setMentions(items => items.filter(item => item.id !== mention.id)) }} className="rounded-full bg-white/15 p-1"><X className="h-3 w-3" /></button></div>)}
        </div>
        <div className="w-full max-w-sm space-y-3">
          {file && <p className="truncate text-center text-sm text-muted-foreground">{file.name}{duration > 0 && duration <= MAX_STORY_VIDEO_SECONDS ? ' · ' + Math.round(duration) + ' sec' : ''}</p>}
          {!editing && <Button type="button" variant="outline" className="w-full" onClick={() => setEditing(true)}><Type className="mr-2 h-4 w-4" /> Edit story</Button>}
          {editing && <div className="space-y-2">
            {showTextInput && <div className="flex gap-2"><input autoFocus value={textDraft} onChange={event => setTextDraft(event.target.value)} maxLength={150} placeholder="Write something…" className="min-w-0 flex-1 rounded-xl border border-border bg-card px-3 py-2.5 text-sm" /><button type="button" onClick={() => { const value = textDraft.trim(); if (value) setTextLayers(items => [...items, { id: Math.random().toString(36).slice(2, 10), text: value, x: 50, y: 50, scale: 1, rotation: 0, color: '#ffffff' }]); setTextDraft(''); setShowTextInput(false) }} aria-label="Add text to video story" className="rounded-xl bg-pink-500 px-3 text-white"><Check className="h-4 w-4" /></button></div>}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <button type="button" onClick={() => { setTextDraft(''); setShowTextInput(true) }} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-2 text-sm font-medium hover:bg-muted"><Type className="h-4 w-4" /> Add Text</button>
              <button type="button" onClick={() => setShowMentionPicker(true)} className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-2 text-sm font-medium hover:bg-muted"><AtSign className="h-4 w-4" /> @ Mention</button>
              <button type="button" onClick={() => setEditing(false)} className="flex min-h-11 items-center justify-center rounded-xl border border-border bg-card px-2 text-sm font-medium hover:bg-muted">Done editing</button>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="shrink-0" onClick={() => replaceInput.current?.click()}>Replace video</Button>
            <Button type="button" variant="outline" className="shrink-0" onClick={() => { const video = stageRef.current?.querySelector('video'); if (!video) return; if (previewing) { video.pause(); setPreviewing(false) } else { void video.play().then(() => setPreviewing(true)).catch(() => setError('Video preview could not start.')) } }}>{previewing ? 'Pause' : 'Preview'}</Button>
            <Button className="flex-1" onClick={onShare} disabled={!file || !duration || duration > MAX_STORY_VIDEO_SECONDS || createVideoStory.isPending}>
              {createVideoStory.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Publishing…</> : 'Share'}
            </Button>
          </div>
          <input ref={replaceInput} type="file" accept="video/*" className="hidden" onChange={(e) => { const next = e.target.files?.[0]; e.currentTarget.value = ''; if (next && next.type.startsWith('video/')) { setFile(next); setDuration(0); setError(null) } else if (next) setError('Please choose a supported video file.') }} />
          {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        </div>
      </main>

      {showTextMenu && selectedTextId && <div className="fixed inset-0 z-[170] flex items-end justify-center bg-black/30 p-3 sm:items-center" onClick={() => setShowTextMenu(false)}><div role="dialog" aria-modal="true" aria-label="Text options" className="w-full max-w-xs rounded-2xl border border-border bg-card p-4 text-foreground shadow-xl" onClick={event => event.stopPropagation()}><h3 className="font-semibold">Text options</h3><button type="button" onClick={() => { setShowTextMenu(false); setShowFontPicker(true) }} className="mt-3 flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm hover:bg-muted"><Type className="h-4 w-4" /> Font</button><button type="button" onClick={() => { const selected = textLayers.find(layer => layer.id === selectedTextId); if (selected) setTextLayers(items => [...items, { ...selected, id: Math.random().toString(36).slice(2, 10), x: Math.min(92, selected.x + 4), y: Math.min(92, selected.y + 4) }]); setShowTextMenu(false) }} className="mt-2 flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm hover:bg-muted"><Copy className="h-4 w-4" /> Duplicate</button><button type="button" onClick={() => { setTextLayers(items => items.filter(layer => layer.id !== selectedTextId)); setSelectedTextId(null); setShowTextMenu(false) }} className="mt-2 flex w-full items-center gap-2 rounded-xl border border-red-500/40 px-3 py-2.5 text-sm text-red-500 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /> Delete</button></div></div>}
      {showFontPicker && selectedTextId && <FontPicker currentFont={textLayers.find(layer => layer.id === selectedTextId)?.fontFamily || ''} onSelect={value => setTextLayers(items => items.map(layer => layer.id === selectedTextId ? { ...layer, fontFamily: value || null } : layer))} onCancel={() => setShowFontPicker(false)} onDone={() => setShowFontPicker(false)} />}
      {showMentionPicker && <StoryMentionPicker userId={userId} selected={mentions.map(item => ({ id: item.userId, username: item.username, full_name: item.fullName, avatar_url: item.avatarUrl }))} onClose={() => setShowMentionPicker(false)} onConfirm={people => { setMentions(current => { const retained = current.filter(item => people.some(person => person.id === item.userId)); const retainedIds = new Set(retained.map(item => item.userId)); const added = people.filter(person => !retainedIds.has(person.id)).map((person, index) => ({ id: Math.random().toString(36).slice(2, 10), userId: person.id, username: person.username, fullName: person.full_name, avatarUrl: person.avatar_url, x: 50, y: Math.min(88, 64 + index * 8), scale: 1 })); return [...retained, ...added] }); setShowMentionPicker(false) }} />}
      {showAudience && <StoryAudienceModal userId={userId} isPending={createVideoStory.isPending} confirmLabel="Confirm Share" onClose={() => setShowAudience(false)} onConfirm={confirmShare} />}
      {showLimit && <LimitAlertDialog title="Video is too long" description="Story videos must be 5 minutes or shorter. Please choose a shorter clip." onClose={() => setShowLimit(false)} />}
    </div>
  )
}
