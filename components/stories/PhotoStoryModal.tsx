'use client'

import { useEffect, useRef, useState } from 'react'
import { X, ArrowLeft, Upload, Type, Loader2, Play, Move, Trash2, Copy, Palette, Music, ImagePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MusicPicker, SelectedSong } from './MusicPicker'
import { MusicTrimPanel } from './MusicTrimPanel'
import { DiscardConfirmDialog } from './DiscardConfirmDialog'
import { FontPicker } from './FontPicker'
import { ColorPickerPanel } from './ColorPickerPanel'
import { StoryTimeline } from './StoryTimeline'
import { SceneMenuItem } from './SceneMenu'
import { useCreateStory, DraftPhotoScene } from '@/lib/hooks/useStories'
import { StoryAudienceModal } from './StoryAudienceModal'
import { getTextFillStyle } from '@/lib/utils/storyStyle'
import type { GlobalMusic, StoryVisibility } from '@/lib/types/database.types'

interface PhotoStoryModalProps {
  userId: string
  onClose: () => void
  onBack: () => void
}

interface EditingScene extends Omit<DraftPhotoScene, 'overlayText' | 'overlayTextColor'> {
  overlayText: string
  overlayTextColor: string
  previewUrl: string
}

function makeSceneId() {
  return Math.random().toString(36).slice(2, 9)
}

function sceneFromFile(file: File): EditingScene {
  return {
    id: makeSceneId(),
    file,
    previewUrl: URL.createObjectURL(file),
    duration: 5,
    overlayText: '',
    overlayTextColor: '#ffffff',
    overlayFontFamily: undefined,
    overlayX: 50,
    overlayY: 50,
  }
}

function effectiveMusicFor(scene: EditingScene, globalMusic: GlobalMusic | null) {
  if (scene.musicUrl) {
    return { url: scene.musicUrl, title: scene.musicTitle, artist: scene.musicArtist, artworkUrl: scene.musicArtworkUrl, start: scene.musicStart ?? 0 }
  }
  if (globalMusic) {
    return { url: globalMusic.url, title: globalMusic.title, artist: globalMusic.artist, artworkUrl: globalMusic.artworkUrl, start: globalMusic.start }
  }
  return null
}

export function PhotoStoryModal({ userId, onClose, onBack }: PhotoStoryModalProps) {
  const [scenes, setScenes] = useState<EditingScene[]>([])
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null)
  const [globalMusic, setGlobalMusic] = useState<GlobalMusic | null>(null)
  const [globalFont, setGlobalFont] = useState<string | null>(null)

  const [editingCaption, setEditingCaption] = useState(false)
  const [colorTarget, setColorTarget] = useState<string | null>(null)
  const colorBeforePicker = useRef('')

  const [fontTarget, setFontTarget] = useState<'global' | string | null>(null)
  const fontBeforePicker = useRef<string | null | undefined>(null)

  const [musicTarget, setMusicTarget] = useState<'global' | string | null>(null)
  const [showMusicPicker, setShowMusicPicker] = useState(false)
  const [trimSong, setTrimSong] = useState<SelectedSong | null>(null)

  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [discardAction, setDiscardAction] = useState<'close' | 'back' | null>(null)

  const [previewing, setPreviewing] = useState(false)
  const [previewIndex, setPreviewIndex] = useState(0)
  const [previewProgress, setPreviewProgress] = useState(0)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)
  const previewAudioUrlRef = useRef<string | null>(null)

  const initialFileRef = useRef<HTMLInputElement>(null)
  const addSceneFileRef = useRef<HTMLInputElement>(null)
  const replacePhotoFileRef = useRef<HTMLInputElement>(null)
  const replaceTargetId = useRef<string | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const { createPhotoStory } = useCreateStory()

  const activeScene = scenes.find((s) => s.id === activeSceneId) || null
  const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0) || 5

  const updateScene = (id: string, patch: Partial<EditingScene>) => {
    setScenes((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  const handleInitialUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const s = sceneFromFile(f)
    setScenes([s])
    setActiveSceneId(s.id)
  }

  const handleAddScene = () => addSceneFileRef.current?.click()
  const handleAddSceneFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const s = sceneFromFile(f)
    setScenes((prev) => [...prev, s])
    setActiveSceneId(s.id)
    e.target.value = ''
  }

  const handleChangePhoto = (sceneId: string) => {
    replaceTargetId.current = sceneId
    replacePhotoFileRef.current?.click()
  }
  const handleReplacePhotoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    const sceneId = replaceTargetId.current
    if (!f || !sceneId) return
    const scene = scenes.find((s) => s.id === sceneId)
    if (scene) URL.revokeObjectURL(scene.previewUrl)
    updateScene(sceneId, { file: f, previewUrl: URL.createObjectURL(f) })
    e.target.value = ''
  }

  const handleDuplicateScene = (id: string) => {
    const source = scenes.find((s) => s.id === id)
    if (!source) return
    const copy = { ...source, id: makeSceneId() }
    setScenes((prev) => {
      const idx = prev.findIndex((s) => s.id === id)
      const next = [...prev]
      next.splice(idx + 1, 0, copy)
      return next
    })
    setActiveSceneId(copy.id)
  }

  const handleDeleteScene = (id: string) => {
    setScenes((prev) => {
      const next = prev.filter((s) => s.id !== id)
      if (id === activeSceneId) setActiveSceneId(next[0]?.id ?? null)
      return next
    })
  }

  const updatePosFromClientPoint = (clientX: number, clientY: number) => {
    if (!activeSceneId) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = Math.min(95, Math.max(5, ((clientX - rect.left) / rect.width) * 100))
    const y = Math.min(95, Math.max(5, ((clientY - rect.top) / rect.height) * 100))
    updateScene(activeSceneId, { overlayX: x, overlayY: y })
  }
  const handleDragStart = (e: React.PointerEvent) => {
    dragging.current = true
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const handleDragMove = (e: React.PointerEvent) => { if (dragging.current) updatePosFromClientPoint(e.clientX, e.clientY) }
  const handleDragEnd = () => { dragging.current = false }

  const hasUnsavedWork = scenes.length > 0
  const requestClose = () => { if (hasUnsavedWork) { setDiscardAction('close'); setShowDiscardConfirm(true) } else onClose() }
  const requestBack = () => { if (hasUnsavedWork) { setDiscardAction('back'); setShowDiscardConfirm(true) } else onBack() }
  const confirmDiscard = () => {
    setShowDiscardConfirm(false)
    scenes.forEach((s) => URL.revokeObjectURL(s.previewUrl))
    if (discardAction === 'back') onBack(); else onClose()
  }

  const [showAudiencePicker, setShowAudiencePicker] = useState(false)

  const handleShare = () => {
    if (scenes.length === 0) return
    setShowAudiencePicker(true)
  }

  const doShare = async (visibility: StoryVisibility, selectedIds: string[]) => {
    try {
      const payload: DraftPhotoScene[] = scenes.map(({ previewUrl, overlayText, overlayTextColor, ...rest }) => ({
        ...rest,
        overlayText: overlayText || undefined,
        overlayTextColor: overlayText ? overlayTextColor : undefined,
      }))
      await createPhotoStory.mutateAsync({ userId, scenes: payload, globalMusic, globalFont, visibility, visibilitySelectedIds: selectedIds })
      setShowAudiencePicker(false)
      onClose()
    } catch {
      // surfaced via createPhotoStory.isError below
    }
  }

  const openGlobalMusic = () => {
    setMusicTarget('global')
    if (globalMusic) setTrimSong({ title: globalMusic.title, artist: globalMusic.artist, artworkUrl: globalMusic.artworkUrl, previewUrl: globalMusic.url })
    else setShowMusicPicker(true)
  }
  const openSeparateSong = (sceneId: string) => {
    setMusicTarget(sceneId)
    const scene = scenes.find((s) => s.id === sceneId)
    if (scene?.musicUrl) setTrimSong({ title: scene.musicTitle || '', artist: scene.musicArtist || '', artworkUrl: scene.musicArtworkUrl || '', previewUrl: scene.musicUrl })
    else setShowMusicPicker(true)
  }

  const openGlobalFont = () => { fontBeforePicker.current = globalFont; setFontTarget('global') }
  const openSeparateFont = (sceneId: string) => {
    fontBeforePicker.current = scenes.find((s) => s.id === sceneId)?.overlayFontFamily
    setFontTarget(sceneId)
  }

  const stopPreview = () => {
    previewAudioRef.current?.pause()
    previewAudioRef.current = null
    previewAudioUrlRef.current = null
    setPreviewing(false)
  }
  const startPreview = () => {
    if (scenes.length === 0) return
    setPreviewIndex(0)
    setPreviewProgress(0)
    setPreviewing(true)
  }

  useEffect(() => {
    if (!previewing) return
    const scene = scenes[previewIndex]
    if (!scene) { stopPreview(); return }
    setPreviewProgress(0)

    const music = effectiveMusicFor(scene, globalMusic)
    if (music?.url !== previewAudioUrlRef.current) {
      previewAudioRef.current?.pause()
      previewAudioUrlRef.current = music?.url ?? null
      if (music?.url) {
        const audio = new Audio(music.url)
        audio.currentTime = music.start
        audio.play().catch(() => {})
        previewAudioRef.current = audio
      } else {
        previewAudioRef.current = null
      }
    }

    const start = Date.now()
    const durationMs = scene.duration * 1000
    const timer = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - start) / durationMs) * 100)
      setPreviewProgress(pct)
      if (pct >= 100) {
        clearInterval(timer)
        if (previewIndex < scenes.length - 1) setPreviewIndex((i) => i + 1)
        else stopPreview()
      }
    }, 50)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewing, previewIndex])

  useEffect(() => () => { previewAudioRef.current?.pause() }, [])

  const getMenuItems = (scene: EditingScene): SceneMenuItem[] => [
    { icon: <ImagePlus className="h-4 w-4" />, label: 'Change Scene Photo', onClick: () => handleChangePhoto(scene.id) },
    { icon: <Type className="h-4 w-4" />, label: scene.overlayText ? 'Edit Text' : 'Add Text', onClick: () => { setActiveSceneId(scene.id); setEditingCaption(true) } },
    ...(scene.overlayText ? [{ icon: <Palette className="h-4 w-4" />, label: 'Edit Text Color', onClick: () => { colorBeforePicker.current = scene.overlayTextColor; setColorTarget(scene.id) } }] : []),
    ...(scene.overlayText ? [{ icon: <Type className="h-4 w-4" />, label: scene.overlayFontFamily ? 'Edit Separate Font' : 'Add Separate Font', onClick: () => openSeparateFont(scene.id) }] : []),
    { icon: <Music className="h-4 w-4" />, label: scene.musicUrl ? 'Edit Separate Song' : 'Add Separate Song', onClick: () => openSeparateSong(scene.id) },
    { icon: <Copy className="h-4 w-4" />, label: 'Duplicate Scene', onClick: () => handleDuplicateScene(scene.id) },
    ...(scenes.length > 1 ? [{ icon: <Trash2 className="h-4 w-4" />, label: 'Delete Scene', onClick: () => handleDeleteScene(scene.id), danger: true }] : []),
  ]

  // --- No photo uploaded yet: this is the very first step -----------------
  if (scenes.length === 0) {
    return (
      <div className="fixed inset-0 bg-black z-[100] flex flex-col">
        <div className="flex items-center justify-between p-4">
          <button onClick={onBack} className="text-white p-1"><ArrowLeft className="h-6 w-6" /></button>
          <p className="text-white font-semibold">Photo Story</p>
          <button onClick={onClose} className="text-white p-1"><X className="h-6 w-6" /></button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <button onClick={() => initialFileRef.current?.click()} className="flex flex-col items-center gap-3 text-white/80 hover:text-white transition-colors">
            <div className="h-16 w-16 rounded-full bg-white/10 flex items-center justify-center">
              <Upload className="h-7 w-7" />
            </div>
            <span className="font-medium">Upload from device</span>
            <span className="text-xs text-white/50">Photos only</span>
          </button>
        </div>
        <input ref={initialFileRef} type="file" accept="image/*" onChange={handleInitialUpload} className="hidden" />
      </div>
    )
  }

  if (previewing) {
    const scene = scenes[previewIndex]
    const music = effectiveMusicFor(scene, globalMusic)
    const font = scene.overlayFontFamily || globalFont
    return (
      <div className="fixed inset-0 bg-black z-[100] flex flex-col">
        <div className="flex gap-1 p-3 pt-4">
          {scenes.map((_, i) => (
            <div key={i} className="flex-1 h-1 bg-white/25 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full" style={{ width: i < previewIndex ? '100%' : i === previewIndex ? `${previewProgress}%` : '0%', transition: i === previewIndex ? 'width 50ms linear' : undefined }} />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between px-4 pb-2">
          <span className="text-white/60 text-xs font-medium">Previewing draft - not posted yet</span>
          <button onClick={stopPreview} className="text-white p-1"><X className="h-6 w-6" /></button>
        </div>
        <div className="flex-1 min-h-0 relative flex items-center justify-center bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={scene.previewUrl} alt="Story" className="max-w-full max-h-full object-contain" />
          {scene.overlayText && (
            <p
              style={{
                position: 'absolute', left: `${scene.overlayX}%`, top: `${scene.overlayY}%`, transform: 'translate(-50%, -50%)',
                ...getTextFillStyle(scene.overlayTextColor),
                fontFamily: font ? `'${font}', sans-serif` : undefined,
                textShadow: scene.overlayTextColor.startsWith('gradient:') ? undefined : '0 1px 6px rgba(0,0,0,0.6)',
              }}
              className="text-xl font-bold break-words max-w-[85%] text-center"
            >
              {scene.overlayText}
            </p>
          )}
          {music?.title && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/40 backdrop-blur-sm rounded-full pl-1.5 pr-4 py-1.5 max-w-[85%]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={music.artworkUrl} alt={music.title} className="h-7 w-7 rounded-full object-cover shrink-0" />
              <span className="text-white text-xs font-medium truncate">{music.title} &middot; {music.artist}</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black z-[100] flex flex-col">
      <div className="flex items-center justify-between p-4 relative z-10">
        <button onClick={requestBack} className="text-white p-1"><ArrowLeft className="h-6 w-6" /></button>
        <p className="text-white font-semibold">Photo Story</p>
        <button onClick={requestClose} className="text-white p-1"><X className="h-6 w-6" /></button>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="flex-1 min-h-0 relative overflow-hidden touch-none flex items-center justify-center bg-black"
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
      >
        {activeScene && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={activeScene.previewUrl} alt="Story" className="max-w-full max-h-full object-contain" />
            {activeScene.overlayText && (
              <div
                style={{ left: `${activeScene.overlayX}%`, top: `${activeScene.overlayY}%`, transform: 'translate(-50%, -50%)' }}
                className="absolute max-w-[85%] select-none"
              >
                <p
                  style={{
                    ...getTextFillStyle(activeScene.overlayTextColor),
                    fontFamily: (activeScene.overlayFontFamily || globalFont) ? `'${activeScene.overlayFontFamily || globalFont}', sans-serif` : undefined,
                    textShadow: activeScene.overlayTextColor.startsWith('gradient:') ? undefined : '0 1px 6px rgba(0,0,0,0.6)',
                  }}
                  className="text-xl font-bold break-words text-center"
                >
                  {activeScene.overlayText}
                </p>
                <div className="flex items-center justify-center mt-1">
                  <button onPointerDown={handleDragStart} className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center cursor-grab active:cursor-grabbing">
                    <Move className="h-3.5 w-3.5 text-white" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Caption editor (opened via 3-dot "Add/Edit Text" - color/font live in the 3-dot menu only) */}
      {editingCaption && activeScene && (
        <div className="p-4 border-t border-white/10">
          <input
            autoFocus
            value={activeScene.overlayText}
            onChange={(e) => updateScene(activeScene.id, { overlayText: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') setEditingCaption(false) }}
            placeholder="Type your caption..."
            maxLength={100}
            className="w-full bg-white/10 text-white placeholder:text-white/50 rounded-xl px-4 py-2.5 outline-none"
          />
          <button onClick={() => setEditingCaption(false)} className="text-white/70 text-sm mt-2">
            Done - drag the text on your photo to reposition it
          </button>
        </div>
      )}

      {colorTarget && (
        <ColorPickerPanel
          label="Text Color"
          initialValue={scenes.find((s) => s.id === colorTarget)?.overlayTextColor || '#ffffff'}
          onPreview={(v) => updateScene(colorTarget, { overlayTextColor: v })}
          onCancel={() => { updateScene(colorTarget, { overlayTextColor: colorBeforePicker.current }); setColorTarget(null) }}
          onDone={() => setColorTarget(null)}
        />
      )}

      {/* Timeline */}
      {!editingCaption && (
        <StoryTimeline
          scenes={scenes}
          activeSceneId={activeSceneId || scenes[0].id}
          onSelectScene={setActiveSceneId}
          onAddScene={handleAddScene}
          onResizeScene={(id, duration) => updateScene(id, { duration })}
          trackIcon={<ImagePlus className="h-3.5 w-3.5 text-white/40" />}
          renderBlock={(scene, i) => (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={scene.previewUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
              <span className="relative text-[10px] font-medium text-white truncate flex-1 z-[1]">{i + 1}</span>
            </>
          )}
          getMenuItems={getMenuItems}
          globalMusic={globalMusic}
          onOpenGlobalMusic={openGlobalMusic}
        />
      )}

      {/* Footer */}
      {!editingCaption && (
        <div className="relative p-4 flex items-center gap-2 border-t border-white/10">
          <button onClick={openGlobalFont} className="h-11 w-11 shrink-0 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors" title="Font for the whole story">
            <Type className="h-5 w-5" />
          </button>
          <button onClick={startPreview} className="h-11 w-11 shrink-0 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors" title="Preview story">
            <Play className="h-5 w-5" />
          </button>
          <Button variant="gradient" className="flex-1" disabled={createPhotoStory.isPending} onClick={handleShare}>
            {createPhotoStory.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Share to Story'}
          </Button>
        </div>
      )}
      {createPhotoStory.isError && (
        <p className="text-xs text-red-400 text-center pb-3">Couldn't post your story. Try again.</p>
      )}

      <input ref={addSceneFileRef} type="file" accept="image/*" onChange={handleAddSceneFile} className="hidden" />
      <input ref={replacePhotoFileRef} type="file" accept="image/*" onChange={handleReplacePhotoFile} className="hidden" />

      {showMusicPicker && (
        <MusicPicker
          onSelect={(s) => {
            if (musicTarget === 'global') {
              setGlobalMusic({ url: s.previewUrl, title: s.title, artist: s.artist, artworkUrl: s.artworkUrl, start: 0, duration: Math.min(totalDuration, 30) })
            } else if (musicTarget) {
              updateScene(musicTarget, {
                musicUrl: s.previewUrl, musicTitle: s.title, musicArtist: s.artist, musicArtworkUrl: s.artworkUrl,
                musicStart: 0, musicDuration: Math.min(scenes.find((sc) => sc.id === musicTarget)?.duration ?? 5, 30),
              })
            }
            setShowMusicPicker(false)
            setTrimSong(s)
          }}
          onClose={() => setShowMusicPicker(false)}
        />
      )}

      {trimSong && musicTarget === 'global' && (
        <MusicTrimPanel
          song={trimSong}
          initialStart={globalMusic?.start ?? 0}
          initialDuration={globalMusic?.duration ?? Math.min(totalDuration, 30)}
          sceneDuration={totalDuration}
          isGlobal
          onCancel={() => setTrimSong(null)}
          onDone={(start, duration) => { setGlobalMusic({ url: trimSong.previewUrl, title: trimSong.title, artist: trimSong.artist, artworkUrl: trimSong.artworkUrl, start, duration }); setTrimSong(null) }}
          onRemove={() => { setGlobalMusic(null); setTrimSong(null) }}
          onChangeSong={() => { setTrimSong(null); setShowMusicPicker(true) }}
        />
      )}
      {trimSong && musicTarget && musicTarget !== 'global' && (
        <MusicTrimPanel
          song={trimSong}
          initialStart={scenes.find((s) => s.id === musicTarget)?.musicStart ?? 0}
          initialDuration={scenes.find((s) => s.id === musicTarget)?.musicDuration ?? Math.min(scenes.find((s) => s.id === musicTarget)?.duration ?? 5, 30)}
          sceneDuration={scenes.find((s) => s.id === musicTarget)?.duration ?? 5}
          onCancel={() => setTrimSong(null)}
          onDone={(start, duration) => { updateScene(musicTarget, { musicStart: start, musicDuration: duration }); setTrimSong(null) }}
          onRemove={() => { updateScene(musicTarget, { musicUrl: undefined, musicTitle: undefined, musicArtist: undefined, musicArtworkUrl: undefined, musicStart: undefined, musicDuration: undefined }); setTrimSong(null) }}
          onChangeSong={() => { setTrimSong(null); setShowMusicPicker(true) }}
        />
      )}

      {fontTarget === 'global' && (
        <FontPicker
          currentFont={globalFont || ''}
          onSelect={(f) => setGlobalFont(f || null)}
          onCancel={() => { setGlobalFont(fontBeforePicker.current ?? null); setFontTarget(null) }}
          onDone={() => setFontTarget(null)}
        />
      )}
      {fontTarget && fontTarget !== 'global' && (
        <FontPicker
          currentFont={scenes.find((s) => s.id === fontTarget)?.overlayFontFamily || ''}
          onSelect={(f) => updateScene(fontTarget, { overlayFontFamily: f || undefined })}
          onCancel={() => { updateScene(fontTarget, { overlayFontFamily: fontBeforePicker.current || undefined }); setFontTarget(null) }}
          onDone={() => setFontTarget(null)}
        />
      )}

      {showDiscardConfirm && (
        <DiscardConfirmDialog onContinueEditing={() => setShowDiscardConfirm(false)} onDiscard={confirmDiscard} />
      )}

      {showAudiencePicker && (
        <StoryAudienceModal
          userId={userId}
          isPending={createPhotoStory.isPending}
          onClose={() => setShowAudiencePicker(false)}
          onConfirm={doShare}
        />
      )}
    </div>
  )
}
