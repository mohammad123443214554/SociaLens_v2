'use client'

import { useEffect, useRef, useState } from 'react'
import { X, ArrowLeft, Smile, Loader2, Type, Play, Minus, Plus, Move, Trash2, Copy, Palette, PaintBucket, Music } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmojiPicker } from './EmojiPicker'
import { MusicPicker, SelectedSong } from './MusicPicker'
import { MusicTrimPanel } from './MusicTrimPanel'
import { DiscardConfirmDialog } from './DiscardConfirmDialog'
import { FontPicker } from './FontPicker'
import { ColorPickerPanel } from './ColorPickerPanel'
import { StoryTimeline } from './StoryTimeline'
import { SceneMenuItem } from './SceneMenu'
import { useCreateStory } from '@/lib/hooks/useStories'
import { StoryAudienceModal } from './StoryAudienceModal'
import { resolveBackgroundCss, getTextFillStyle } from '@/lib/utils/storyStyle'
import type { TextScene, GlobalMusic, StoryVisibility } from '@/lib/types/database.types'

interface TextStoryModalProps {
  userId: string
  onClose: () => void
  onBack: () => void
}

function makeSceneId() {
  return Math.random().toString(36).slice(2, 9)
}

function newScene(): TextScene {
  return {
    id: makeSceneId(),
    text: '',
    duration: 5,
    backgroundColor: 'gradient:#ec4899:#06b6d4',
    textColor: '#ffffff',
    fontFamily: undefined,
    textX: 50,
    textY: 50,
    textSize: 28,
  }
}

// Whichever song/font should actually apply to a given scene right now -
// Its own separate one if it has one, otherwise the one shared across the
// whole story.
function effectiveMusicFor(scene: TextScene, globalMusic: GlobalMusic | null) {
  if (scene.musicUrl) {
    return { url: scene.musicUrl, title: scene.musicTitle, artist: scene.musicArtist, artworkUrl: scene.musicArtworkUrl, start: scene.musicStart ?? 0 }
  }
  if (globalMusic) {
    return { url: globalMusic.url, title: globalMusic.title, artist: globalMusic.artist, artworkUrl: globalMusic.artworkUrl, start: globalMusic.start }
  }
  return null
}

export function TextStoryModal({ userId, onClose, onBack }: TextStoryModalProps) {
  const [scenes, setScenes] = useState<TextScene[]>([newScene()])
  const [activeSceneId, setActiveSceneId] = useState(scenes[0].id)
  const [globalMusic, setGlobalMusic] = useState<GlobalMusic | null>(null)
  const [globalFont, setGlobalFont] = useState<string | null>(null)

  const [colorPanel, setColorPanel] = useState<'bg' | 'text' | null>(null)
  const colorBeforePicker = useRef('')

  const [showEmoji, setShowEmoji] = useState(false)

  // Which font session is open: 'global' (applies to every scene) or a
  // specific scene id (that scene's own separate font).
  const [fontTarget, setFontTarget] = useState<'global' | string | null>(null)
  const fontBeforePicker = useRef<string | null | undefined>(null)

  // Which song session is open: 'global' (applies to every scene) or a
  // specific scene id (that scene's own separate song).
  const [musicTarget, setMusicTarget] = useState<'global' | string | null>(null)
  const [showMusicPicker, setShowMusicPicker] = useState(false)
  const [trimSong, setTrimSong] = useState<SelectedSong | null>(null)

  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [discardAction, setDiscardAction] = useState<'close' | 'back' | null>(null)

  // Inline preview - plays right here in the editor (not the real posted-
  // story viewer), so it never looks like it's already gone live.
  const [previewing, setPreviewing] = useState(false)
  const [previewIndex, setPreviewIndex] = useState(0)
  const [previewProgress, setPreviewProgress] = useState(0)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)
  const previewAudioUrlRef = useRef<string | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const { createTextStory } = useCreateStory()

  const activeScene = scenes.find((s) => s.id === activeSceneId) || scenes[0]
  const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0) || 5

  const updateScene = (id: string, patch: Partial<TextScene>) => {
    setScenes((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current
    const current = activeScene.text
    if (!el) { updateScene(activeSceneId, { text: current + emoji }); return }
    const start = el.selectionStart ?? current.length
    const end = el.selectionEnd ?? current.length
    const next = current.slice(0, start) + emoji + current.slice(end)
    updateScene(activeSceneId, { text: next })
    requestAnimationFrame(() => { el.focus(); const pos = start + emoji.length; el.setSelectionRange(pos, pos) })
  }

  const handleAddScene = () => {
    const s = newScene()
    setScenes((prev) => [...prev, s])
    setActiveSceneId(s.id)
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
      if (next.length === 0) return prev
      if (id === activeSceneId) setActiveSceneId(next[0].id)
      return next
    })
  }

  // Dragging the text box around the canvas.
  const updatePosFromClientPoint = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = Math.min(95, Math.max(5, ((clientX - rect.left) / rect.width) * 100))
    const y = Math.min(95, Math.max(5, ((clientY - rect.top) / rect.height) * 100))
    updateScene(activeSceneId, { textX: x, textY: y })
  }
  const handleDragStart = (e: React.PointerEvent) => {
    dragging.current = true
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const handleDragMove = (e: React.PointerEvent) => {
    if (!dragging.current) return
    updatePosFromClientPoint(e.clientX, e.clientY)
  }
  const handleDragEnd = () => { dragging.current = false }

  const adjustTextSize = (delta: number) => {
    updateScene(activeSceneId, { textSize: Math.min(64, Math.max(14, activeScene.textSize + delta)) })
  }

  const hasUnsavedWork = scenes.some((s) => s.text.trim().length > 0 || !!s.musicUrl) || !!globalMusic
  const requestClose = () => { if (hasUnsavedWork) { setDiscardAction('close'); setShowDiscardConfirm(true) } else onClose() }
  const requestBack = () => { if (hasUnsavedWork) { setDiscardAction('back'); setShowDiscardConfirm(true) } else onBack() }
  const confirmDiscard = () => {
    setShowDiscardConfirm(false)
    if (discardAction === 'back') onBack(); else onClose()
  }

  const [showAudiencePicker, setShowAudiencePicker] = useState(false)

  const handleShare = () => {
    if (!scenes.some((s) => s.text.trim())) return
    setShowAudiencePicker(true)
  }

  const doShare = async (visibility: StoryVisibility, selectedIds: string[]) => {
    try {
      await createTextStory.mutateAsync({
        userId,
        scenes: scenes.filter((s) => s.text.trim()).map((s) => ({ ...s, text: s.text.trim() })),
        globalMusic,
        globalFont,
        visibility,
        visibilitySelectedIds: selectedIds,
      })
      setShowAudiencePicker(false)
      onClose()
    } catch {
      // surfaced via createTextStory.isError below
    }
  }

  // --- Music: one global song by default, "Add Separate Song" on a scene
  // lets it override with its own. ----------------------------------------
  const openGlobalMusic = () => {
    setMusicTarget('global')
    if (globalMusic) {
      setTrimSong({ title: globalMusic.title, artist: globalMusic.artist, artworkUrl: globalMusic.artworkUrl, previewUrl: globalMusic.url })
    } else {
      setShowMusicPicker(true)
    }
  }
  const openSeparateSong = (sceneId: string) => {
    setMusicTarget(sceneId)
    const scene = scenes.find((s) => s.id === sceneId)
    if (scene?.musicUrl) {
      setTrimSong({ title: scene.musicTitle || '', artist: scene.musicArtist || '', artworkUrl: scene.musicArtworkUrl || '', previewUrl: scene.musicUrl })
    } else {
      setShowMusicPicker(true)
    }
  }

  // --- Font: same pattern as music - one global font, or a scene's own. --
  const openGlobalFont = () => { fontBeforePicker.current = globalFont; setFontTarget('global') }
  const openSeparateFont = (sceneId: string) => {
    const scene = scenes.find((s) => s.id === sceneId)
    fontBeforePicker.current = scene?.fontFamily
    setFontTarget(sceneId)
  }

  // --- Inline preview: cycles through scenes right in this canvas -------
  const stopPreview = () => {
    previewAudioRef.current?.pause()
    previewAudioRef.current = null
    previewAudioUrlRef.current = null
    setPreviewing(false)
  }

  const startPreview = () => {
    if (!scenes.some((s) => s.text.trim())) return
    setPreviewIndex(0)
    setPreviewProgress(0)
    setPreviewing(true)
  }

  useEffect(() => {
    if (!previewing) return
    const scene = scenes[previewIndex]
    if (!scene) { stopPreview(); return }

    setPreviewProgress(0)

    // Only (re)start audio if the song actually changed - this is what lets
    // the global song keep playing continuously across scenes instead of
    // restarting every time, exactly like it will after posting.
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
        if (previewIndex < scenes.length - 1) {
          setPreviewIndex((i) => i + 1)
        } else {
          stopPreview()
        }
      }
    }, 50)

    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewing, previewIndex])

  useEffect(() => () => { previewAudioRef.current?.pause() }, [])

  const getMenuItems = (scene: TextScene): SceneMenuItem[] => [
    { icon: <Type className="h-4 w-4" />, label: 'Edit Text', onClick: () => textareaRef.current?.focus() },
    { icon: <Palette className="h-4 w-4" />, label: 'Change Text Color', onClick: () => { colorBeforePicker.current = scene.textColor; setActiveSceneId(scene.id); setColorPanel('text') } },
    { icon: <PaintBucket className="h-4 w-4" />, label: 'Change Background', onClick: () => { colorBeforePicker.current = scene.backgroundColor; setActiveSceneId(scene.id); setColorPanel('bg') } },
    { icon: <Type className="h-4 w-4" />, label: scene.fontFamily ? 'Edit Separate Font' : 'Add Separate Font', onClick: () => openSeparateFont(scene.id) },
    { icon: <Music className="h-4 w-4" />, label: scene.musicUrl ? 'Edit Separate Song' : 'Add Separate Song', onClick: () => openSeparateSong(scene.id) },
    { icon: <Copy className="h-4 w-4" />, label: 'Duplicate Scene', onClick: () => handleDuplicateScene(scene.id) },
    ...(scenes.length > 1 ? [{ icon: <Trash2 className="h-4 w-4" />, label: 'Delete Scene', onClick: () => handleDeleteScene(scene.id), danger: true }] : []),
  ]

  if (previewing) {
    const scene = scenes[previewIndex]
    const music = effectiveMusicFor(scene, globalMusic)
    const font = scene.fontFamily || globalFont
    return (
      <div className="fixed inset-0 bg-black z-[100] flex flex-col">
        <div className="flex gap-1 p-3 pt-4">
          {scenes.map((_, i) => (
            <div key={i} className="flex-1 h-1 bg-white/25 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full"
                style={{
                  width: i < previewIndex ? '100%' : i === previewIndex ? `${previewProgress}%` : '0%',
                  transition: i === previewIndex ? 'width 50ms linear' : undefined,
                }}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between px-4 pb-2">
          <span className="text-white/60 text-xs font-medium">Previewing draft - not posted yet</span>
          <button onClick={stopPreview} className="text-white p-1">
            <X className="h-6 w-6" />
          </button>
        </div>
        <div className="flex-1 relative" style={{ background: resolveBackgroundCss(scene.backgroundColor) }}>
          <p
            style={{
              position: 'absolute', left: `${scene.textX}%`, top: `${scene.textY}%`, transform: 'translate(-50%, -50%)',
              ...getTextFillStyle(scene.textColor),
              fontFamily: font ? `'${font}', sans-serif` : undefined,
              fontSize: `${scene.textSize}px`,
            }}
            className="text-center font-semibold break-words max-w-[85%]"
          >
            {scene.text}
          </p>
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
      {/* Header */}
      <div className="flex items-center justify-between p-4 relative z-10">
        <button onClick={requestBack} className="text-white p-1">
          <ArrowLeft className="h-6 w-6" />
        </button>
        <p className="text-white font-semibold">Text Story</p>
        <button onClick={requestClose} className="text-white p-1">
          <X className="h-6 w-6" />
        </button>
      </div>

      {/* Top: 2 simple options, apply to the currently selected scene */}
      <div className="flex items-center gap-2 px-4 pb-3 relative z-10">
        <button
          onClick={() => { colorBeforePicker.current = activeScene.backgroundColor; setColorPanel('bg') }}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-full bg-white/10 text-white text-sm font-medium hover:bg-white/20 transition-colors"
        >
          <span className="h-4 w-4 rounded-full" style={{ background: resolveBackgroundCss(activeScene.backgroundColor) }} />
          Background Color
        </button>
        <button
          onClick={() => { colorBeforePicker.current = activeScene.textColor; setColorPanel('text') }}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-full bg-white/10 text-white text-sm font-medium hover:bg-white/20 transition-colors"
        >
          <span className="h-4 w-4 rounded-full border border-white/40" style={{ background: activeScene.textColor.startsWith('gradient:') ? resolveBackgroundCss(activeScene.textColor) : activeScene.textColor }} />
          Text Color
        </button>
      </div>

      {colorPanel === 'bg' && (
        <ColorPickerPanel
          label="Background Color"
          initialValue={activeScene.backgroundColor}
          onPreview={(v) => updateScene(activeSceneId, { backgroundColor: v })}
          onCancel={() => { updateScene(activeSceneId, { backgroundColor: colorBeforePicker.current }); setColorPanel(null) }}
          onDone={() => setColorPanel(null)}
        />
      )}
      {colorPanel === 'text' && (
        <ColorPickerPanel
          label="Text Color"
          initialValue={activeScene.textColor}
          onPreview={(v) => updateScene(activeSceneId, { textColor: v })}
          onCancel={() => { updateScene(activeSceneId, { textColor: colorBeforePicker.current }); setColorPanel(null) }}
          onDone={() => setColorPanel(null)}
        />
      )}

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="flex-1 relative overflow-hidden touch-none"
        style={{ background: resolveBackgroundCss(activeScene.backgroundColor) }}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
      >
        <div
          style={{ left: `${activeScene.textX}%`, top: `${activeScene.textY}%`, transform: 'translate(-50%, -50%)' }}
          className="absolute max-w-[85%] select-none"
        >
          <textarea
            ref={textareaRef}
            value={activeScene.text}
            onChange={(e) => updateScene(activeSceneId, { text: e.target.value })}
            placeholder="Start typing..."
            autoFocus
            maxLength={280}
            rows={3}
            style={{
              ...getTextFillStyle(activeScene.textColor),
              fontFamily: (activeScene.fontFamily || globalFont) ? `'${activeScene.fontFamily || globalFont}', sans-serif` : undefined,
              fontSize: `${activeScene.textSize}px`,
            }}
            className="bg-transparent text-center font-semibold outline-none resize-none w-full"
          />
          <div className="flex items-center justify-center gap-2 mt-1">
            <button onPointerDown={handleDragStart} className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center cursor-grab active:cursor-grabbing">
              <Move className="h-3.5 w-3.5 text-white" />
            </button>
            <button onClick={() => adjustTextSize(-4)} className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center">
              <Minus className="h-3.5 w-3.5 text-white" />
            </button>
            <button onClick={() => adjustTextSize(4)} className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center">
              <Plus className="h-3.5 w-3.5 text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* Timeline strip */}
      <StoryTimeline
        scenes={scenes}
        activeSceneId={activeSceneId}
        onSelectScene={setActiveSceneId}
        onAddScene={handleAddScene}
        onResizeScene={(id, duration) => updateScene(id, { duration })}
        trackIcon={<Type className="h-3.5 w-3.5 text-white/40" />}
        renderBlock={(scene, i) => (
          <span className="text-[11px] font-medium text-white truncate flex-1">{scene.text || `Scene ${i + 1}`}</span>
        )}
        getMenuItems={getMenuItems}
        globalMusic={globalMusic}
        onOpenGlobalMusic={openGlobalMusic}
      />

      {/* Footer: emoji + global font + preview + share */}
      <div className="relative p-4 flex items-center gap-2 border-t border-white/10">
        {showEmoji && <EmojiPicker onSelect={insertEmoji} onClose={() => setShowEmoji(false)} />}
        <button onClick={() => setShowEmoji((s) => !s)} className="h-11 w-11 shrink-0 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors">
          <Smile className="h-5 w-5" />
        </button>
        <button
          onClick={openGlobalFont}
          className="h-11 w-11 shrink-0 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
          title="Font for the whole story"
        >
          <Type className="h-5 w-5" />
        </button>
        <button
          onClick={startPreview}
          disabled={!scenes.some((s) => s.text.trim())}
          className="h-11 w-11 shrink-0 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors disabled:opacity-40"
          title="Preview story"
        >
          <Play className="h-5 w-5" />
        </button>
        <Button
          variant="gradient"
          className="flex-1"
          disabled={!scenes.some((s) => s.text.trim()) || createTextStory.isPending}
          onClick={handleShare}
        >
          {createTextStory.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Share to Story'}
        </Button>
      </div>
      {createTextStory.isError && (
        <p className="text-xs text-red-400 text-center pb-3">Couldn't post your story. Try again.</p>
      )}

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
          onDone={(start, duration) => {
            setGlobalMusic({ url: trimSong.previewUrl, title: trimSong.title, artist: trimSong.artist, artworkUrl: trimSong.artworkUrl, start, duration })
            setTrimSong(null)
          }}
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
          onDone={(start, duration) => {
            updateScene(musicTarget, { musicStart: start, musicDuration: duration })
            setTrimSong(null)
          }}
          onRemove={() => {
            updateScene(musicTarget, {
              musicUrl: undefined, musicTitle: undefined, musicArtist: undefined,
              musicArtworkUrl: undefined, musicStart: undefined, musicDuration: undefined,
            })
            setTrimSong(null)
          }}
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
          currentFont={scenes.find((s) => s.id === fontTarget)?.fontFamily || ''}
          onSelect={(f) => updateScene(fontTarget, { fontFamily: f || undefined })}
          onCancel={() => { updateScene(fontTarget, { fontFamily: fontBeforePicker.current || undefined }); setFontTarget(null) }}
          onDone={() => setFontTarget(null)}
        />
      )}

      {showDiscardConfirm && (
        <DiscardConfirmDialog
          onContinueEditing={() => setShowDiscardConfirm(false)}
          onDiscard={confirmDiscard}
        />
      )}

      {showAudiencePicker && (
        <StoryAudienceModal
          userId={userId}
          isPending={createTextStory.isPending}
          onClose={() => setShowAudiencePicker(false)}
          onConfirm={doShare}
        />
      )}
    </div>
  )
}
