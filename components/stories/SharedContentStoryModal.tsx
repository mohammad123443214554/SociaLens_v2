'use client'

import { useEffect, useRef, useState } from 'react'
import { X, ArrowLeft, Type, Loader2, Music, Play, Pause, Clock, Palette, CaseSensitive, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MusicPicker, SelectedSong } from './MusicPicker'
import { DiscardConfirmDialog } from './DiscardConfirmDialog'
import { FontPicker } from './FontPicker'
import { useCreateStory } from '@/lib/hooks/useStories'

interface SharedContentStoryModalProps {
  userId: string
  file: File
  mediaType: 'photo' | 'video'
  linkUrl?: string | null
  linkLabel?: string | null
  onClose: () => void
  onBack: () => void
}

function getTextColorStyle(textColor: string): React.CSSProperties {
  if (textColor.startsWith('gradient:')) {
    const [, c1, c2] = textColor.split(':')
    return {
      backgroundImage: `linear-gradient(135deg, ${c1}, ${c2})`,
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent',
    }
  }
  return { color: textColor }
}

export function SharedContentStoryModal({ userId, file, mediaType, linkUrl, linkLabel, onClose, onBack }: SharedContentStoryModalProps) {
  const [preview] = useState(() => URL.createObjectURL(file))
  useEffect(() => () => URL.revokeObjectURL(preview), [preview])

  const [overlayText, setOverlayText] = useState('')
  const [editingText, setEditingText] = useState(false)
  const [pos, setPos] = useState({ x: 50, y: 50 })
  const [showMusicPicker, setShowMusicPicker] = useState(false)
  const [song, setSong] = useState<SelectedSong | null>(null)
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const [showDuration, setShowDuration] = useState(false)
  const [duration, setDuration] = useState(5)

  const [overlayColor, setOverlayColor] = useState('#ffffff')
  const [showTextSolidPicker, setShowTextSolidPicker] = useState(false)
  const [textSolidColor, setTextSolidColor] = useState('#ffffff')
  const [showTextGradientPicker, setShowTextGradientPicker] = useState(false)
  const [textGradient1, setTextGradient1] = useState('#ec4899')
  const [textGradient2, setTextGradient2] = useState('#06b6d4')
  const [showFontPicker, setShowFontPicker] = useState(false)
  const [overlayFont, setOverlayFont] = useState('')
  const fontBeforePicker = useRef('')

  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const { createMediaStory } = useCreateStory()

  const updatePosFromClientPoint = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100))
    const y = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100))
    setPos({ x, y })
  }
  const handlePointerDown = (e: React.PointerEvent) => {
    dragging.current = true
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const handlePointerMove = (e: React.PointerEvent) => { if (dragging.current) updatePosFromClientPoint(e.clientX, e.clientY) }
  const handlePointerUp = () => { dragging.current = false }

  const toggleSongPreview = () => {
    if (!song) return
    if (previewPlaying) { previewAudioRef.current?.pause(); setPreviewPlaying(false); return }
    const audio = new Audio(song.previewUrl)
    audio.play().catch(() => {})
    audio.onended = () => setPreviewPlaying(false)
    previewAudioRef.current = audio
    setPreviewPlaying(true)
  }
  const removeSong = () => { previewAudioRef.current?.pause(); setPreviewPlaying(false); setSong(null) }
  const applyTextSolidColor = () => { setOverlayColor(textSolidColor); setShowTextSolidPicker(false) }
  const applyTextGradient = () => { setOverlayColor(`gradient:${textGradient1}:${textGradient2}`); setShowTextGradientPicker(false) }

  const requestClose = () => setShowDiscardConfirm(true)
  const requestBack = () => setShowDiscardConfirm(true)
  const [discardAction, setDiscardAction] = useState<'close' | 'back'>('close')
  const confirmDiscard = () => {
    previewAudioRef.current?.pause()
    setShowDiscardConfirm(false)
    if (discardAction === 'back') onBack()
    else onClose()
  }

  const handleShare = async () => {
    previewAudioRef.current?.pause()
    try {
      await createMediaStory.mutateAsync({
        userId,
        file,
        storyType: mediaType,
        overlayText: overlayText.trim() || undefined,
        overlayX: pos.x,
        overlayY: pos.y,
        musicUrl: song?.previewUrl,
        musicTitle: song?.title,
        musicArtist: song?.artist,
        musicArtworkUrl: song?.artworkUrl,
        durationSeconds: mediaType === 'photo' ? duration : undefined,
        overlayTextColor: overlayText.trim() ? overlayColor : undefined,
        overlayFontFamily: overlayText.trim() ? (overlayFont || undefined) : undefined,
        linkUrl: linkUrl || null,
        linkLabel: linkLabel || null,
      })
      onClose()
    } catch {
      // Surfaced via createMediaStory.isError below
    }
  }

  return (
    <div className="fixed inset-0 bg-black z-[100] flex flex-col">
      <div className="flex items-center justify-between p-4 relative z-10">
        <button onClick={() => { setDiscardAction('back'); requestBack() }} className="text-white p-1">
          <ArrowLeft className="h-6 w-6" />
        </button>
        <p className="text-white font-semibold">Add to Story</p>
        <button onClick={() => { setDiscardAction('close'); requestClose() }} className="text-white p-1">
          <X className="h-6 w-6" />
        </button>
      </div>

      <div className="flex-1 relative overflow-hidden flex items-center justify-center">
        <div
          ref={canvasRef}
          className="relative w-full h-full flex items-center justify-center touch-none select-none"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {mediaType === 'photo' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Story preview" className="max-w-full max-h-full object-contain" />
          ) : (
            <video src={preview} className="max-w-full max-h-full object-contain" autoPlay loop muted={!!song} playsInline />
          )}

          {overlayText && (
            <div
              onPointerDown={handlePointerDown}
              style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)' }}
              className="absolute cursor-grab active:cursor-grabbing px-3 py-1.5 max-w-[85%] text-center"
            >
              <p
                className="text-xl font-bold break-words"
                style={{
                  ...getTextColorStyle(overlayColor),
                  textShadow: overlayColor.startsWith('gradient:') ? undefined : '0 1px 6px rgba(0,0,0,0.6)',
                  fontFamily: overlayFont ? `'${overlayFont}', sans-serif` : undefined,
                }}
              >
                {overlayText}
              </p>
            </div>
          )}

          {song && (
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/40 backdrop-blur-sm rounded-full pl-1.5 pr-1.5 py-1.5 max-w-[85%]">
              <button onClick={toggleSongPreview} className="flex items-center gap-2 min-w-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={song.artworkUrl} alt={song.title} className="h-7 w-7 rounded-full object-cover shrink-0" />
                <span className="text-white text-xs font-medium truncate">{song.title} &middot; {song.artist}</span>
                {previewPlaying ? <Pause className="h-3.5 w-3.5 text-white shrink-0" /> : <Play className="h-3.5 w-3.5 text-white shrink-0" />}
              </button>
              <button onClick={removeSong} className="h-5 w-5 shrink-0 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors" aria-label="Remove song">
                <X className="h-3 w-3 text-white" />
              </button>
            </div>
          )}

          {/* Preview of the "Open in X" pill this story will carry - not
              draggable, just showing what viewers will see and be able to
              tap to jump back to the original content. */}
          {linkUrl && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-white/95 text-black rounded-full px-4 py-2 text-sm font-semibold shadow-lg">
              <ExternalLink className="h-4 w-4" />
              {linkLabel ? `Open in ${linkLabel}` : 'Open link'}
            </div>
          )}
        </div>
      </div>

      {editingText && (
        <div className="p-4 border-t border-white/10 space-y-3">
          <input
            autoFocus
            value={overlayText}
            onChange={(e) => setOverlayText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setEditingText(false) }}
            placeholder="Type your caption..."
            maxLength={100}
            className="w-full bg-white/10 text-white placeholder:text-white/50 rounded-xl px-4 py-2.5 outline-none"
          />
          <div className="flex items-center gap-2">
            {['#ffffff', '#000000', '#facc15', '#f472b6'].map((c) => (
              <button
                key={c}
                onClick={() => setOverlayColor(c)}
                style={{ background: c }}
                className={`h-7 w-7 rounded-full border border-white/20 shrink-0 ${overlayColor === c ? 'ring-2 ring-white ring-offset-2 ring-offset-black' : ''}`}
              />
            ))}
            <button onClick={() => setShowTextGradientPicker((s) => !s)} className="h-7 w-7 rounded-full flex items-center justify-center border-2 border-dashed border-white/50 text-white shrink-0" title="Custom text gradient">
              <Palette className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setShowTextSolidPicker((s) => !s)} className="h-7 w-7 rounded-full flex items-center justify-center border-2 border-dashed border-white/50 text-white shrink-0" title="Custom text color">
              <CaseSensitive className="h-4 w-4" />
            </button>
            <button onClick={() => { fontBeforePicker.current = overlayFont; setShowFontPicker(true) }} className="h-7 px-2.5 rounded-full flex items-center gap-1 border-2 border-dashed border-white/50 text-white shrink-0" title="Choose font">
              <Type className="h-3.5 w-3.5" />
              <span className="text-[10px]">Font</span>
            </button>
          </div>

          {showTextSolidPicker && (
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 flex items-center gap-3">
              <input type="color" value={textSolidColor} onChange={(e) => setTextSolidColor(e.target.value)} className="h-9 w-9 rounded-lg cursor-pointer bg-transparent shrink-0" />
              <p className="flex-1 text-lg font-semibold" style={{ color: textSolidColor }}>Aa Preview</p>
              <Button size="sm" variant="gradient" onClick={applyTextSolidColor}>Apply</Button>
            </div>
          )}
          {showTextGradientPicker && (
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 flex items-center gap-3">
              <input type="color" value={textGradient1} onChange={(e) => setTextGradient1(e.target.value)} className="h-9 w-9 rounded-lg cursor-pointer bg-transparent shrink-0" />
              <input type="color" value={textGradient2} onChange={(e) => setTextGradient2(e.target.value)} className="h-9 w-9 rounded-lg cursor-pointer bg-transparent shrink-0" />
              <p className="flex-1 text-lg font-semibold" style={getTextColorStyle(`gradient:${textGradient1}:${textGradient2}`)}>Aa Preview</p>
              <Button size="sm" variant="gradient" onClick={applyTextGradient}>Apply</Button>
            </div>
          )}

          <button onClick={() => setEditingText(false)} className="text-white/70 text-sm">
            Done — drag the text on your {mediaType} to reposition it
          </button>
        </div>
      )}

      {mediaType === 'photo' && showDuration && !editingText && (
        <div className="relative z-20 mx-4 mb-3 bg-white/10 backdrop-blur-md rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white text-sm font-medium">Story duration</span>
            <span className="text-white font-bold text-lg">{duration}s</span>
          </div>
          <input type="range" min={2} max={120} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-full accent-pink-500" />
        </div>
      )}

      {!editingText && (
        <div className="p-4 flex items-center gap-2 border-t border-white/10">
          <button onClick={() => setEditingText(true)} className="h-11 px-3 shrink-0 rounded-full bg-white/10 flex items-center gap-1.5 text-white hover:bg-white/20 transition-colors">
            <Type className="h-5 w-5" />
            <span className="text-sm font-medium hidden sm:inline">{overlayText ? 'Edit text' : 'Add text'}</span>
          </button>
          <button onClick={() => setShowMusicPicker(true)} className="h-11 px-3 shrink-0 rounded-full bg-white/10 flex items-center gap-1.5 text-white hover:bg-white/20 transition-colors">
            <Music className="h-5 w-5" />
            <span className="text-sm font-medium hidden sm:inline">{song ? 'Change song' : 'Add music'}</span>
          </button>
          {mediaType === 'photo' && (
            <button onClick={() => setShowDuration((s) => !s)} className="h-11 px-3 shrink-0 rounded-full bg-white/10 flex items-center gap-1.5 text-white hover:bg-white/20 transition-colors">
              <Clock className="h-5 w-5" />
              <span className="text-xs font-semibold">{duration}s</span>
            </button>
          )}
          <Button variant="gradient" className="flex-1" disabled={createMediaStory.isPending} onClick={handleShare}>
            {createMediaStory.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Share to Story'}
          </Button>
        </div>
      )}
      {createMediaStory.isError && (
        <p className="text-xs text-red-400 text-center pb-3">Couldn't post your story. Try again.</p>
      )}

      {showMusicPicker && (
        <MusicPicker onSelect={(s) => { setSong(s); setShowMusicPicker(false) }} onClose={() => setShowMusicPicker(false)} />
      )}
      {showFontPicker && (
        <FontPicker
          currentFont={overlayFont}
          onSelect={(f) => setOverlayFont(f)}
          onCancel={() => { setOverlayFont(fontBeforePicker.current); setShowFontPicker(false) }}
          onDone={() => setShowFontPicker(false)}
        />
      )}
      {showDiscardConfirm && (
        <DiscardConfirmDialog onContinueEditing={() => setShowDiscardConfirm(false)} onDiscard={confirmDiscard} />
      )}
    </div>
  )
}
