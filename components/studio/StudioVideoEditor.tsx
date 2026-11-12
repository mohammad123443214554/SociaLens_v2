'use client'

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createStudioAssetUrl, loadStudioProject, saveStudioProject, uploadStudioAsset } from '@/lib/studio/persistence'
import { StudioAnimationPanel } from './StudioAnimationPanel'
import { normalizeTextAnimationSettings, sampleTextAnimation, type TextAnimationDefinition, type TextAnimationSettings } from '@/lib/studio/animation-engine'
import { BASIC_ENTRANCE_ANIMATIONS } from '@/lib/studio/basic-entrance-animations'
import { EXIT_ANIMATIONS } from '@/lib/studio/exit-animations'
import { BOUNCE_ELASTIC_ANIMATIONS } from '@/lib/studio/bounce-elastic-animations'
import { ROTATION_3D_ANIMATIONS } from '@/lib/studio/rotation-3d-animations'
import { TYPING_CHARACTER_ANIMATIONS } from '@/lib/studio/typing-character-animations'
import { sampleCharacterMotion, splitStudioGraphemes } from '@/lib/studio/character-animation-engine'
import { sampleWordMotion } from '@/lib/studio/word-line-animations'
import { WORD_LINE_ANIMATIONS } from '@/lib/studio/word-line-animations'
import { clipCanvasForMask, sampleMaskReveal } from '@/lib/studio/wipe-mask-reveal-animations'
import { WIPE_MASK_REVEAL_ANIMATIONS } from '@/lib/studio/wipe-mask-reveal-animations'
import { LOOP_CONTINUOUS_ANIMATIONS } from '@/lib/studio/loop-continuous-animations'
import { MOTION_DYNAMIC_ANIMATIONS } from '@/lib/studio/motion-dynamic-animations'
import { CINEMATIC_LIGHT_ANIMATIONS } from '@/lib/studio/cinematic-light-animations'
import { DIGITAL_CREATIVE_ANIMATIONS } from '@/lib/studio/digital-creative-animations'
import { ARTISTIC_ADVANCED_ANIMATIONS } from '@/lib/studio/artistic-advanced-animations'
import { STUDIO_FRAME_DURATION_SECONDS, STUDIO_FRAME_RATE, quantizeStudioTime, studioFrameTimeFromElapsedMs } from '@/lib/studio/frame-clock'

const STUDIO_TEXT_ANIMATIONS = [...BASIC_ENTRANCE_ANIMATIONS, ...EXIT_ANIMATIONS, ...BOUNCE_ELASTIC_ANIMATIONS, ...ROTATION_3D_ANIMATIONS, ...TYPING_CHARACTER_ANIMATIONS, ...WORD_LINE_ANIMATIONS, ...WIPE_MASK_REVEAL_ANIMATIONS, ...LOOP_CONTINUOUS_ANIMATIONS, ...MOTION_DYNAMIC_ANIMATIONS, ...CINEMATIC_LIGHT_ANIMATIONS, ...DIGITAL_CREATIVE_ANIMATIONS, ...ARTISTIC_ADVANCED_ANIMATIONS]
const STUDIO_TEXT_ANIMATION_BY_ID = new Map(STUDIO_TEXT_ANIMATIONS.map(definition => [definition.id, definition]))
import {
  ArrowLeft, AudioLines, Check, Clapperboard,
  Bold, CaseUpper, ChevronDown, Copy, FolderOpen, ImagePlus, Italic, List, ListOrdered, Music2,
  Palette, Pause, Play, Plus, Search, Sparkles, Strikethrough, Trash2, Type, Underline, Video,
  Volume2, VolumeX, X
} from 'lucide-react'

type ClipKind = 'video' | 'image'
type Clip = {
  id: string
  kind: ClipKind
  name: string
  url: string
  duration: number
  trimStart: number
  trimEnd: number
  timelineStart: number
  fileSize: number
  storagePath?: string
}
type AudioTrack = { id: string; name: string; url: string; duration: number; trimStart: number; trimEnd: number; timelineStart: number; fileSize: number; storagePath?: string }
type TextLayer = { id: string; kind: 'heading' | 'subheading' | 'body'; text: string; x: number; y: number; width: number; fontSize: number; color: string; opacity?: number; animation?: Partial<TextAnimationSettings>; effect?: TextEffect; effectIntensity?: number; effectBlur?: number; effectDistance?: number; effectAngle?: number; effectColor?: string; effectSecondaryColor?: string; bold: boolean; italic: boolean; underline: boolean; strikethrough?: boolean; uppercase?: boolean; listStyle?: 'none' | 'bullet' | 'number'; align: 'left' | 'center' | 'right'; rotation: number; timelineStart: number; timelineDuration: number; fontFamily?: string }
type TextDrag = { id: string; pointerId: number; mode: 'move' | 'resize' | 'rotate'; startX: number; startY: number; startAngle: number; originX: number; originY: number; originWidth: number; originFontSize: number; originRotation: number }
type TimelineDrag = { id: string; kind: 'clip' | 'text' | 'audio'; mode: 'move' | 'left' | 'right'; pointerId: number; startX: number; startAt: number; trimStart: number; trimEnd: number; duration: number }
const MIN_TIMELINE_SECONDS = 60
const TIMELINE_PX_PER_SECOND = 16

const MAX_VIDEO_BYTES = 250 * 1024 * 1024
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_AUDIO_BYTES = 50 * 1024 * 1024
const MAX_CLIPS = 20
const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds)) return '00:00'
  const safe = Math.max(0, Math.floor(seconds))
  return String(Math.floor(safe / 60)).padStart(2, '0') + ':' + String(safe % 60).padStart(2, '0')
}
const makeId = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : 'clip-' + Date.now() + '-' + Math.random().toString(36).slice(2)

type FontOption = { family: string; category: string }
const TEXT_EFFECTS = [
  { category: "Basic & Clean", name: "Simple" },
  {
    "category": "Shadow & Depth",
    "name": "Drop Shadow"
  },
  {
    "category": "Shadow & Depth",
    "name": "Long Shadow"
  },
  {
    "category": "Shadow & Depth",
    "name": "Hard Shadow"
  },
  {
    "category": "Shadow & Depth",
    "name": "3D Extrude"
  },
  {
    "category": "Shadow & Depth",
    "name": "Layered Shadow"
  },
  {
    "category": "Shadow & Depth",
    "name": "Floating Shadow"
  },
  {
    "category": "Shadow & Depth",
    "name": "Ambient Shadow"
  },
  {
    "category": "Shadow & Depth",
    "name": "Perspective Depth"
  },
  {
    "category": "Glow & Light",
    "name": "Neon Glow"
  },
  {
    "category": "Glow & Light",
    "name": "Soft Glow"
  },
  {
    "category": "Glow & Light",
    "name": "Outer Glow"
  },
  {
    "category": "Glow & Light",
    "name": "Inner Glow"
  },
  {
    "category": "Glow & Light",
    "name": "Rainbow Glow"
  },
  {
    "category": "Glow & Light",
    "name": "Electric Glow"
  },
  {
    "category": "Glow & Light",
    "name": "Golden Glow"
  },
  {
    "category": "Glow & Light",
    "name": "Holographic Glow"
  },
  {
    "category": "Outline & Stroke",
    "name": "Outline"
  },
  {
    "category": "Outline & Stroke",
    "name": "Double Outline"
  },
  {
    "category": "Outline & Stroke",
    "name": "Triple Stroke"
  },
  {
    "category": "Outline & Stroke",
    "name": "Neon Outline"
  },
  {
    "category": "Outline & Stroke",
    "name": "Gradient Stroke"
  },
  {
    "category": "Outline & Stroke",
    "name": "Hollow Text"
  },
  {
    "category": "Creative & Distortion",
    "name": "Echo"
  },
  {
    "category": "Creative & Distortion",
    "name": "Glitch"
  },
  {
    "category": "Creative & Distortion",
    "name": "RGB Split"
  },
  {
    "category": "Creative & Distortion",
    "name": "Wave Distortion"
  },
  {
    "category": "Creative & Distortion",
    "name": "Warp"
  },
  {
    "category": "Creative & Distortion",
    "name": "Perspective Tilt"
  },
  {
    "category": "Creative & Distortion",
    "name": "Motion Blur"
  },
  {
    "category": "Creative & Distortion",
    "name": "Ghost"
  },
  {
    "category": "Texture & Material",
    "name": "Metallic"
  },
  {
    "category": "Texture & Material",
    "name": "Emboss"
  },
  {
    "category": "Texture & Material",
    "name": "Engrave"
  },
  {
    "category": "Texture & Material",
    "name": "Glass"
  },
  {
    "category": "Texture & Material",
    "name": "Grunge"
  },
  {
    "category": "Premium Artistic",
    "name": "Pixel"
  },
  {
    "category": "Premium Artistic",
    "name": "Halftone"
  },
  {
    "category": "Premium Artistic",
    "name": "Comic"
  },
  {
    "category": "Premium Artistic",
    "name": "Retro"
  },
  {
    "category": "Premium Artistic",
    "name": "Hologram"
  },
] as const
const EFFECT_CATEGORIES = [...new Set(TEXT_EFFECTS.map(effect => effect.category))]
type TextEffect = typeof TEXT_EFFECTS[number]['name']
function getTextEffectStyle(effect: string | undefined, intensity = 60, color = '#a855f7', secondary = '#22d3ee', blur = 8, distance = 4, angle = 45): Record<string, string | number> {
  const n = Math.max(0, Math.min(100, intensity) / 60)
  if (n === 0) return {}
  const dx = Math.round(Math.cos(angle * Math.PI / 180) * distance * n)
  const dy = Math.round(Math.sin(angle * Math.PI / 180) * distance * n)
  const soft = Math.max(0, Math.round(blur * n))
  const glow = Math.max(0, Math.round(blur * n))
  const styles: Record<string, Record<string, string | number>> = {
    'Simple': { textShadow: `${dx}px ${dy}px ${soft}px rgba(0,0,0,.28)` },
    'Drop Shadow': { textShadow: `${dx}px ${dy}px ${soft}px rgba(0,0,0,.75)` },
    'Long Shadow': { textShadow: Array.from({length:Math.min(12,Math.max(3,Math.round(8*n)))},(_,i)=>`${i+1}px ${i+1}px 0 ${color}`).join(',') },
    'Hard Shadow': { textShadow: `${dx}px ${dy}px 0 ${color}` },
    '3D Extrude': { textShadow: Array.from({length:Math.min(10,Math.max(3,Math.round(6*n)))},(_,i)=>`${i+1}px ${i+1}px 0 ${color}`).join(',') },
    'Layered Shadow': { textShadow: `2px 2px 2px ${color}, 5px 5px 8px rgba(0,0,0,.7), 0 0 14px ${secondary}` },
    'Floating Shadow': { textShadow: `0 ${distance*2}px ${soft}px rgba(0,0,0,.55), ${dx}px ${dy}px 2px ${color}` },
    'Ambient Shadow': { textShadow: `0 0 ${glow*2}px ${color}, 0 0 ${glow*3}px rgba(0,0,0,.55)` },
    'Perspective Depth': { textShadow: `2px 2px 0 ${color}, 4px 4px 0 ${color}, 7px 7px 8px rgba(0,0,0,.55)`, transform: 'perspective(220px) rotateX(12deg)' },
    'Neon Glow': { textShadow: `0 0 3px #fff, 0 0 ${glow}px ${color}, 0 0 ${glow*2}px ${color}, 0 0 ${glow*3}px ${color}` },
    'Soft Glow': { textShadow: `0 0 ${glow*2}px ${color}, 0 0 ${glow*3}px ${color}` },
    'Outer Glow': { textShadow: `0 0 ${glow}px ${color}, 0 0 ${glow*2}px ${color}` },
    'Inner Glow': { textShadow: `0 0 2px #fff, 0 0 ${soft}px ${color}`, filter: 'brightness(1.25)' },
    'Rainbow Glow': { textShadow: `0 0 8px #ff3b7a, 0 0 14px #ffd43b, 0 0 20px #36e5a1, 0 0 26px #6b8cff` },
    'Electric Glow': { textShadow: `0 0 3px #fff, 0 0 ${glow}px #22d3ee, 0 0 ${glow*2}px #6366f1, 0 0 ${glow*3}px ${color}` },
    'Golden Glow': { textShadow: `0 0 4px #fff1a8, 0 0 ${glow}px #f59e0b, 0 0 ${glow*2}px #d97706` },
    'Holographic Glow': { textShadow: `0 0 ${glow}px #f0abfc, 0 0 ${glow*2}px #67e8f9, 0 0 ${glow*3}px #c4b5fd` },
    'Outline': { WebkitTextStroke: `${Math.max(1,Math.round(n*1.5))}px ${color}` },
    'Double Outline': { WebkitTextStroke: `${Math.max(1,Math.round(n*1.5))}px ${color}`, textShadow: `0 0 0 ${secondary}, 0 0 2px ${secondary}` },
    'Triple Stroke': { WebkitTextStroke: `${Math.max(1,Math.round(n*2))}px ${color}`, textShadow: `1px 1px 0 ${secondary}, -1px -1px 0 #fff` },
    'Neon Outline': { WebkitTextStroke: `1px ${color}`, textShadow: `0 0 4px ${color}, 0 0 12px ${color}` },
    'Gradient Stroke': { color: 'transparent', WebkitTextStroke: `${Math.max(1,Math.round(n*1.5))}px ${color}`, textShadow: `0 0 4px ${secondary}` },
    'Hollow Text': { color: 'transparent', WebkitTextStroke: `${Math.max(1,Math.round(n*2))}px ${color}` },
    'Echo': { textShadow: `3px 0 ${color}, 6px 0 ${secondary}, 9px 0 rgba(255,255,255,.25)` },
    'Glitch': { textShadow: `-2px 0 #ff1744, 2px 0 #00e5ff`, filter: 'contrast(1.25)' },
    'RGB Split': { textShadow: `-2px 0 rgba(255,0,0,.9), 2px 0 rgba(0,220,255,.9)` },
    'Wave Distortion': { textShadow: `0 2px 0 ${color}, 0 -2px 0 ${secondary}`, filter: 'url(#studio-wave-filter)' },
    'Warp': { transform: 'skewX(-8deg) scaleX(1.08)', filter: 'contrast(1.15)' },
    'Perspective Tilt': { transform: 'perspective(240px) rotateY(-18deg) skewY(-3deg)' },
    'Motion Blur': { textShadow: `5px 0 5px rgba(255,255,255,.5), 10px 0 12px ${color}`, filter: 'blur(.35px)' },
    'Ghost': { textShadow: `4px 0 0 rgba(180,220,255,.35), 8px 0 0 rgba(180,220,255,.2), -4px 0 0 rgba(180,220,255,.2)`, opacity: .88 },
    'Metallic': { color: 'transparent', background: 'linear-gradient(180deg,#fff 0%,#9ca3af 22%,#f8fafc 38%,#4b5563 52%,#e5e7eb 72%,#6b7280 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', filter: 'drop-shadow(1px 2px 1px rgba(0,0,0,.65))' },
    'Emboss': { textShadow: '1px 1px 0 rgba(255,255,255,.8), -1px -1px 1px rgba(0,0,0,.75)' },
    'Engrave': { color: '#9ca3af', textShadow: '1px 1px 1px rgba(255,255,255,.45), -1px -1px 1px rgba(0,0,0,.8)' },
    'Glass': { color: 'rgba(220,245,255,.78)', WebkitTextStroke: '1px rgba(255,255,255,.65)', textShadow: '0 1px 8px rgba(255,255,255,.8), 0 4px 12px rgba(80,180,255,.45)', filter: 'blur(.12px)' },
    'Grunge': { textShadow: `1px 1px 0 ${color}, -1px 0 0 rgba(0,0,0,.6)`, filter: 'contrast(1.55) saturate(.8)' },
    'Pixel': { textShadow: `2px 0 0 ${color}, -2px 2px 0 ${secondary}`, filter: 'contrast(1.5)' },
    'Halftone': { textShadow: `1px 1px 0 ${color}, -1px -1px 0 ${color}`, filter: 'contrast(1.7)' },
    'Comic': { WebkitTextStroke: '1.5px #111827', textShadow: `3px 3px 0 ${color}, 5px 5px 0 #111827`, filter: 'saturate(1.4)' },
    'Retro': { textShadow: `3px 3px 0 ${color}, 6px 6px 0 ${secondary}`, filter: 'sepia(.25) saturate(1.25)' },
    'Hologram': { color: 'transparent', background: 'linear-gradient(100deg,#f0abfc,#67e8f9,#fde68a,#c4b5fd,#f0abfc)', WebkitBackgroundClip: 'text', backgroundClip: 'text', textShadow: '0 0 8px rgba(103,232,249,.55)' },
  }
  const style = styles[effect || 'Simple'] || {}
  const directionalShadow = `${dx}px ${dy}px ${soft}px ${color}66`
  const combinedStyle = { ...style, textShadow: style.textShadow ? `${style.textShadow}, ${directionalShadow}` : directionalShadow }
  // Gradient/material fills must paint through the glyph mask, never the text layer's
  // full-width editing box. WebKit needs text-fill-color explicitly transparent.
  if (style.WebkitBackgroundClip === 'text' || style.backgroundClip === 'text') {
    return {
      ...combinedStyle,
      color: 'transparent',
      backgroundColor: 'transparent',
      backgroundClip: 'text',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundRepeat: 'no-repeat',
      boxDecorationBreak: 'clone',
      WebkitBoxDecorationBreak: 'clone',
    }
  }
  return combinedStyle
}

const googleFontLoads = new Map<string, Promise<void>>()
function loadGoogleFont(family: string): Promise<void> {
  if (!family || family === 'Default') return Promise.resolve()
  const cached = googleFontLoads.get(family)
  if (cached) return cached
  const promise = new Promise<void>(resolve => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    const params = new URLSearchParams({ family, display: 'swap' })
    link.href = 'https://fonts.googleapis.com/css2?' + params.toString()
    link.onload = () => resolve()
    link.onerror = () => resolve()
    document.head.appendChild(link)
  }).then(async () => {
    try { await document.fonts.load('16px "' + family.replace(/["\\\\]/g, '') + '"') } catch { /* Keep the editor usable if a remote font fails. */ }
  })
  googleFontLoads.set(family, promise)
  return promise
}

function readMediaDuration(file: File, url: string, kind: ClipKind): Promise<number> {
  return new Promise(resolve => {
    const media = document.createElement(kind === 'video' ? 'video' : 'img')
    let settled = false
    const finish = (value: number) => {
      if (settled) return
      settled = true
      resolve(Number.isFinite(value) && value > 0 ? value : (kind === 'image' ? 5 : 0))
    }
    media.onloadedmetadata = () => finish((media as HTMLVideoElement).duration)
    media.onload = () => finish(5)
    media.onerror = () => finish(kind === 'image' ? 5 : 0)
    if (kind === 'video') {
      ;(media as HTMLVideoElement).preload = 'metadata'
      ;(media as HTMLVideoElement).src = url
    } else {
      ;(media as HTMLImageElement).src = url
    }
    window.setTimeout(() => finish(kind === 'image' ? 5 : 0), 12000)
  })
}

export function StudioVideoEditor({ projectName, templateId, projectId }: { projectName: string; templateId: string; projectId: string }) {
  const videoInput = useRef<HTMLInputElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const audioInput = useRef<HTMLInputElement>(null)
  const previewRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const textDrag = useRef<TextDrag | null>(null)
  const timelineDrag = useRef<TimelineDrag | null>(null)
  const textDrafts = useRef<Map<string, string>>(new Map())
  const objectUrls = useRef<Set<string>>(new Set())
  const [clips, setClips] = useState<Clip[]>([])
  const [audio, setAudio] = useState<AudioTrack | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(85)
  const [audioVolume, setAudioVolume] = useState(75)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [playhead, setPlayhead] = useState(0)
  const playbackFrame = useRef<number | null>(null)
  const playbackStartedAt = useRef(0)
  const lastPlaybackTime = useRef(-1)
  const lastAnimationPreviewTime = useRef(-1)
  const [aspect, setAspect] = useState<'9:16' | '16:9' | '1:1'>('9:16')
  const [titleText, setTitleText] = useState('')
  const [subtitleText, setSubtitleText] = useState('')
  const [ctaText, setCtaText] = useState('')
  const [showTitle, setShowTitle] = useState(false)
  const [textLayers, setTextLayers] = useState<TextLayer[]>([])
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const [fontMenuOpen, setFontMenuOpen] = useState(false)
  const [transparencyMenuOpen, setTransparencyMenuOpen] = useState(false)
  const [fontSearch, setFontSearch] = useState('')
  const [fontCatalog, setFontCatalog] = useState<FontOption[]>([])
  const [fontCatalogLoading, setFontCatalogLoading] = useState(false)
  const [fontCatalogError, setFontCatalogError] = useState('')
  const [exportWidth, setExportWidth] = useState(1080)
  const [exportHeight, setExportHeight] = useState(1920)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [saveStatus, setSaveStatus] = useState('Loading project…')
  const [activePanel, setActivePanel] = useState<'media' | 'text' | 'audio' | 'effects' | 'animation'>('media')
  const [animationSearch, setAnimationSearch] = useState('')
  const [isAnimationPreviewing, setIsAnimationPreviewing] = useState(false)
  const [animationPreviewTime, setAnimationPreviewTime] = useState(0)
  const animationPreviewStart = useRef(0)
  const [hydrated, setHydrated] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveSequence = useRef(0)
  const selected = clips.find(item => item.id === selectedId) || clips[0] || null
  const selectedText = textLayers.find(item => item.id === selectedTextId) || null
  const selectedAnimation = selectedText?.animation?.animationId ? STUDIO_TEXT_ANIMATION_BY_ID.get(selectedText.animation.animationId) : undefined
  const selectedAnimationId = selectedText?.animation?.animationId || null
  const previewCycleDurationMs = selectedAnimation ? (selectedText?.animation?.durationMs || selectedAnimation.defaultDurationMs) / Math.max(0.1, selectedText?.animation?.speed || 1) : 850
  const previewRepeats = selectedAnimation ? (selectedText?.animation?.repeatCount ?? ((selectedAnimation.mode === 'loop' || selectedAnimation.mode === 'continuous') ? 0 : 1)) : 1
  const previewDurationMs = selectedAnimation ? (selectedAnimation.mode === 'exit' ? 0 : (selectedText?.animation?.delayMs || 0)) + previewCycleDurationMs * (previewRepeats === 0 ? 2 : Math.max(1, previewRepeats)) : 850
  const exitPreviewDurationSeconds = previewCycleDurationMs * (previewRepeats === 0 ? 2 : Math.max(1, previewRepeats)) / 1000
  const animationPreviewStartSeconds = selectedText && selectedAnimation?.mode === 'exit'
    ? Math.max(selectedText.timelineStart, Math.min(selectedText.timelineStart + selectedText.timelineDuration - exitPreviewDurationSeconds, selectedText.timelineStart + (selectedText.animation?.delayMs || 0) / 1000))
    : selectedText?.timelineStart || 0
  const getLayerAnimationSample = (layer: TextLayer, timelineTime: number) => {
    const animationId = layer.animation?.animationId
    const definition = animationId ? STUDIO_TEXT_ANIMATION_BY_ID.get(animationId) : undefined
    if (!definition) return null
    return sampleTextAnimation({ definition, settings: { ...layer.animation, animationId: definition.id, durationMs: layer.animation?.durationMs || definition.defaultDurationMs, enabled: true }, timelineTimeSeconds: timelineTime, layerStartSeconds: layer.timelineStart, layerDurationSeconds: layer.timelineDuration })
  }
  const getFormattedText = (layer: TextLayer) => {
    const value = layer.uppercase ? layer.text.toLocaleUpperCase() : layer.text
    if (layer.listStyle === 'bullet') return value.split(/\n/).map(line => line ? '• ' + line : line).join('\n')
    if (layer.listStyle === 'number') return value.split(/\n/).map((line, index) => line ? (index + 1) + '. ' + line : line).join('\n')
    return value
  }
  const getAnimatedGradientFill = (layer: TextLayer) => layer.effect === 'Metallic' || layer.effect === 'Hologram'
    ? { ...getTextEffectStyle(layer.effect, layer.effectIntensity ?? 60, layer.effectColor || '#a855f7', layer.effectSecondaryColor || '#22d3ee', layer.effectBlur ?? 8, layer.effectDistance ?? 4, layer.effectAngle ?? 45), display: 'inline-block', backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', WebkitTextFillColor: 'transparent' }
    : {}
  const getAnimatedTextContent = (layer: TextLayer, timelineTime: number) => {
    const definition = STUDIO_TEXT_ANIMATION_BY_ID.get(layer.animation?.animationId || '')
    const formattedText = getFormattedText(layer)
    if (definition?.maskEffect) {
      const animationSample = getLayerAnimationSample(layer, timelineTime)
      if (!animationSample) return formattedText
      const mask = sampleMaskReveal({ effect: definition.maskEffect, progress: animationSample.motionProgress, intensity: layer.animation?.intensity ?? 1 })
      return <span style={{ display: 'block', width: '100%', ...getAnimatedGradientFill(layer), clipPath: mask.maskImage ? undefined : mask.clipPath, maskImage: mask.maskImage, WebkitMaskImage: mask.maskImage, maskSize: '100% 100%', WebkitMaskSize: '100% 100%', willChange: isAnimationPreviewing || playing ? 'clip-path, mask-image' : 'auto' }}>{formattedText}</span>
    }
    if (definition?.wordEffect) {
      const animationSample = getLayerAnimationSample(layer, timelineTime)
      if (!animationSample) return formattedText
      const tokens = formattedText.split(/(\s+)/)
      const words = tokens.filter(token => token && !/^\s+$/.test(token))
      const lineCount = Math.max(1, formattedText.split(/\n/).length)
      let wordIndex = 0
      let lineIndex = 0
      return tokens.map((token, tokenIndex) => {
        if (!token || /^\s+$/.test(token)) {
          lineIndex += (token.match(/\n/g) || []).length
          return token
        }
        const currentWord = wordIndex++
        const motion = sampleWordMotion({ effect: definition.wordEffect!, progress: animationSample.motionProgress, index: currentWord, count: words.length, lineIndex, lineCount, intensity: layer.animation?.intensity ?? 1 })
        return <span key={tokenIndex} style={{ display: 'inline-block', whiteSpace: 'pre', opacity: motion.opacity, transform: 'translate3d(' + motion.x + 'px,' + motion.y + 'px,0) rotate(' + motion.rotate + 'deg) rotateX(' + motion.rotateX + 'deg) scale(' + motion.scale + ')', transformOrigin: 'center bottom', filter: motion.blur ? 'blur(' + motion.blur + 'px)' : undefined, clipPath: motion.clip < 1 ? 'inset(0 ' + ((1-motion.clip)*100) + '% 0 0)' : undefined, letterSpacing: motion.spacing ? motion.spacing + 'px' : undefined, ...getAnimatedGradientFill(layer), willChange: (isAnimationPreviewing || playing) ? 'transform, opacity' : 'auto' }}>{token}</span>
      })
    }
    if (!definition?.characterEffect) return formattedText
    const sample = getLayerAnimationSample(layer, timelineTime)
    if (!sample) return formattedText
    const glyphs = splitStudioGraphemes(formattedText)
    return glyphs.map((glyph, index) => {
      const motion = sampleCharacterMotion({ effect: definition.characterEffect!, progress: sample.motionProgress, index, count: glyphs.length, intensity: layer.animation?.intensity ?? 1 })
      return <span key={index} style={{ display: 'inline-block', whiteSpace: 'pre', opacity: motion.opacity, transform: 'translate3d(' + motion.translateX + 'px,' + motion.translateY + 'px,0) rotate(' + motion.rotate + 'deg) scale(' + motion.scaleX + ',' + motion.scaleY + ')', transformOrigin: 'left center', filter: motion.blur ? 'blur(' + motion.blur + 'px)' : undefined, clipPath: motion.clipProgress < 1 ? 'inset(0 ' + ((1 - motion.clipProgress) * 100) + '% 0 0)' : undefined, ...getAnimatedGradientFill(layer), willChange: (isAnimationPreviewing || playing) ? 'transform, opacity' : 'auto' }}>{glyph}</span>
    })
  }
  const totalDuration = useMemo(() => clips.reduce((sum, item) => sum + Math.max(0.1, item.trimEnd - item.trimStart), 0), [clips])
  const projectEnd = useMemo(() => Math.max(0, ...clips.map(item => item.timelineStart + item.trimEnd - item.trimStart), ...textLayers.map(item => item.timelineStart + item.timelineDuration), audio ? audio.timelineStart + audio.trimEnd - audio.trimStart : 0), [clips, textLayers, audio])
  const timelineSeconds = Math.max(MIN_TIMELINE_SECONDS, Math.ceil(projectEnd / 5) * 5)
  const timelineWidth = timelineSeconds * TIMELINE_PX_PER_SECOND
  const activeTimelineClip = useMemo(() => [...clips].filter(item => playhead >= item.timelineStart && playhead < item.timelineStart + item.trimEnd - item.trimStart).sort((a, b) => a.timelineStart - b.timelineStart).at(-1) || null, [clips, playhead])
  const currentDuration = selected ? Math.max(0, selected.trimEnd - selected.trimStart) : 0

  useEffect(() => () => {
    objectUrls.current.forEach(url => URL.revokeObjectURL(url))
    objectUrls.current.clear()
  }, [])
  useEffect(() => {
    const families = [...new Set(textLayers.map(layer => layer.fontFamily || 'Default'))].filter(family => family !== 'Default')
    families.forEach(family => { void loadGoogleFont(family) })
  }, [textLayers])

  useEffect(() => {
    let active = true
    const restore = async () => {
      try {
        const row = await loadStudioProject(projectId, 'video')
        if (!active) return
        if (row?.data) {
          const data = row.data as Record<string, unknown>
          const savedClips = Array.isArray(data.clips) ? data.clips as Array<Record<string, unknown>> : []
          const restored = await Promise.all(savedClips.map(async item => ({
            id: String(item.id), kind: item.kind as ClipKind, name: String(item.name),
            url: await createStudioAssetUrl(String(item.storagePath)), duration: Number(item.duration),
            trimStart: Number(item.trimStart), trimEnd: Number(item.trimEnd), timelineStart: Math.max(0, Number(item.timelineStart) || 0), fileSize: Number(item.fileSize),
            storagePath: String(item.storagePath),
          })))
          if (!active) return
          setClips(restored)
          if (typeof data.audioPath === 'string' && data.audioPath) {
            const audioUrl = await createStudioAssetUrl(data.audioPath)
            if (!active) return
            setAudio({ id: String(data.audioId || makeId()), name: String(data.audioName || 'Background music'), url: audioUrl, duration: Number(data.audioDuration || 0), trimStart: Number(data.audioTrimStart) || 0, trimEnd: Number(data.audioTrimEnd) || Number(data.audioDuration || 0), timelineStart: Math.max(0, Number(data.audioTimelineStart) || 0), fileSize: Number(data.audioFileSize || 0), storagePath: data.audioPath })
          }
          if (typeof data.selectedId === 'string') setSelectedId(data.selectedId)
          if (typeof data.muted === 'boolean') setMuted(data.muted)
          if (typeof data.volume === 'number') setVolume(data.volume)
          if (typeof data.audioVolume === 'number') setAudioVolume(data.audioVolume)
          if (data.aspect === '9:16' || data.aspect === '16:9' || data.aspect === '1:1') setAspect(data.aspect)
          if (typeof data.titleText === 'string') setTitleText(data.titleText)
          if (typeof data.subtitleText === 'string') setSubtitleText(data.subtitleText)
          if (typeof data.ctaText === 'string') setCtaText(data.ctaText)
          if (Array.isArray(data.textLayers)) {
            const restoredText: TextLayer[] = (data.textLayers as Array<Record<string, unknown>>).filter(item => typeof item.id === 'string' && typeof item.text === 'string').map((item): TextLayer => ({
              id: String(item.id), kind: (item.kind === 'heading' || item.kind === 'subheading' ? item.kind : 'body') as TextLayer['kind'],
              text: String(item.text), x: Math.min(95, Math.max(0, Number(item.x) || 0)), y: Math.min(95, Math.max(0, Number(item.y) || 0)),
              width: Math.min(100, Math.max(12, Number(item.width) || 80)), fontSize: Math.min(160, Math.max(10, Number(item.fontSize) || 24)),
              color: typeof item.color === 'string' ? item.color : '#ffffff', effect: TEXT_EFFECTS.some(effect => effect.name === item.effect) ? item.effect as TextEffect : 'Simple', effectIntensity: Number.isFinite(Number(item.effectIntensity)) ? Math.min(100, Math.max(0, Number(item.effectIntensity))) : 60, effectBlur: Number.isFinite(Number(item.effectBlur)) ? Math.min(40, Math.max(0, Number(item.effectBlur))) : 8, effectDistance: Number.isFinite(Number(item.effectDistance)) ? Math.min(40, Math.max(0, Number(item.effectDistance))) : 4, effectAngle: Number.isFinite(Number(item.effectAngle)) ? Number(item.effectAngle) : 45, effectColor: typeof item.effectColor === 'string' ? item.effectColor : '#a855f7', effectSecondaryColor: typeof item.effectSecondaryColor === 'string' ? item.effectSecondaryColor : '#22d3ee', opacity: Number.isFinite(Number(item.opacity)) ? Math.min(100, Math.max(0, Number(item.opacity))) : 100, bold: item.bold !== false, italic: item.italic === true,
              underline: item.underline === true, fontFamily: typeof item.fontFamily === 'string' ? item.fontFamily : 'Default', align: item.align === 'left' || item.align === 'right' ? item.align : 'center', rotation: typeof item.rotation === 'number' && Number.isFinite(item.rotation) ? item.rotation : 0,
              timelineStart: Math.max(0, Number(item.timelineStart) || 0), timelineDuration: Math.max(0.1, Number(item.timelineDuration) || 5),
              animation: item.animation && typeof item.animation === 'object' ? normalizeTextAnimationSettings(item.animation as Partial<TextAnimationSettings>) : undefined,
            }))
            setTextLayers(restoredText)
            if (typeof data.selectedTextId === 'string') setSelectedTextId(data.selectedTextId)
          } else {
            const legacy: TextLayer[] = []
            if (data.showTitle && typeof data.titleText === 'string' && data.titleText) legacy.push({ id: makeId(), kind: 'heading', text: data.titleText, x: 8, y: 12, width: 84, fontSize: 42, color: '#ffffff', bold: true, italic: false, underline: false, align: 'center', rotation: 0, timelineStart: 0, timelineDuration: 5 })
            if (data.showTitle && typeof data.subtitleText === 'string' && data.subtitleText) legacy.push({ id: makeId(), kind: 'subheading', text: data.subtitleText, x: 8, y: 25, width: 84, fontSize: 25, color: '#ffffff', bold: false, italic: false, underline: false, align: 'center', rotation: 0, timelineStart: 0, timelineDuration: 5 })
            if (data.showTitle && typeof data.ctaText === 'string' && data.ctaText) legacy.push({ id: makeId(), kind: 'body', text: data.ctaText, x: 25, y: 80, width: 50, fontSize: 18, color: '#111827', bold: true, italic: false, underline: false, align: 'center', rotation: 0, timelineStart: 0, timelineDuration: 5 })
            setTextLayers(legacy)
            if (legacy[0]) setSelectedTextId(legacy[0].id)
          }
          if (typeof data.showTitle === 'boolean') setShowTitle(data.showTitle)
          if (typeof data.exportWidth === 'number') setExportWidth(data.exportWidth)
          if (typeof data.exportHeight === 'number') setExportHeight(data.exportHeight)
          setSaveStatus('Draft restored')
        } else {
          if (templateId === 'creator-pro-reel') {
            setAspect('9:16')
            setTitleText('MAKE IT MATTER')
            setSubtitleText('Your story. Your style. Your next big moment.')
            setCtaText('WATCH NOW')
            setShowTitle(true)
            const templateLayers: TextLayer[] = [
              { id: makeId(), kind: 'heading', text: 'MAKE IT MATTER', x: 8, y: 18, width: 84, fontSize: 42, color: '#ffffff', bold: true, italic: false, underline: false, align: 'center', rotation: 0, timelineStart: 0, timelineDuration: 5 },
              { id: makeId(), kind: 'subheading', text: 'Your story. Your style. Your next big moment.', x: 8, y: 31, width: 84, fontSize: 25, color: '#ffffff', bold: false, italic: false, underline: false, align: 'center', rotation: 0, timelineStart: 0, timelineDuration: 5 },
              { id: makeId(), kind: 'body', text: 'WATCH NOW', x: 25, y: 80, width: 50, fontSize: 18, color: '#ffffff', bold: true, italic: false, underline: false, align: 'center', rotation: 0, timelineStart: 0, timelineDuration: 5 },
            ]
            setTextLayers(templateLayers)
            setSelectedTextId(templateLayers[0].id)
          }
          setSaveStatus('New draft')
        }
      } catch (cause) {
        if (active) setSaveStatus(cause instanceof Error ? cause.message : 'Could not load draft')
      } finally { if (active) setHydrated(true) }
    }
    void restore()
    return () => { active = false }
  }, [projectId])

  useEffect(() => {
    if (!hydrated) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveStatus('Unsaved changes')
    const sequence = ++saveSequence.current
    saveTimer.current = setTimeout(async () => {
      try {
        await saveStudioProject({
          id: projectId, project_type: 'video', name: projectName, template_id: templateId || null,
          data: {
            clips: clips.map(({ id, kind, name, duration, trimStart, trimEnd, timelineStart, fileSize, storagePath }) => ({ id, kind, name, duration, trimStart, trimEnd, timelineStart, fileSize, storagePath })),
            audioPath: audio?.storagePath || null, audioId: audio?.id || null, audioName: audio?.name || null,
            audioDuration: audio?.duration || 0, audioTrimStart: audio?.trimStart || 0, audioTrimEnd: audio?.trimEnd || 0, audioTimelineStart: audio?.timelineStart || 0, audioFileSize: audio?.fileSize || 0, selectedId, muted, volume,
            audioVolume, aspect, titleText, subtitleText, ctaText, showTitle, textLayers, selectedTextId, exportWidth, exportHeight,
          },
        })
        if (sequence === saveSequence.current) setSaveStatus('All changes saved')
      } catch (cause) {
        if (sequence === saveSequence.current) setSaveStatus(cause instanceof Error ? cause.message : 'Save failed')
      }
    }, 1000)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [hydrated, projectId, projectName, templateId, clips, audio, selectedId, muted, volume, audioVolume, aspect, titleText, subtitleText, ctaText, showTitle, textLayers, selectedTextId, exportWidth, exportHeight])


  useEffect(() => {
    if (!editingTextId) return
    const editable = document.querySelector<HTMLElement>('[data-text-layer-id="' + editingTextId + '"] [contenteditable="true"]')
    if (editable) {
      editable.focus()
      const selection = window.getSelection()
      selection?.selectAllChildren(editable)
      selection?.collapseToEnd()
    }
  }, [editingTextId])

  useEffect(() => {
    const video = previewRef.current
    if (!video || !activeTimelineClip || activeTimelineClip.kind !== 'video') return
    const localTime = activeTimelineClip.trimStart + Math.max(0, playhead - activeTimelineClip.timelineStart)
    if (!playing && Math.abs(video.currentTime - localTime) > 0.08) video.currentTime = Math.min(activeTimelineClip.trimEnd, localTime)
    video.volume = muted ? 0 : volume / 100
    video.muted = muted
    if (playing && video.paused) void video.play().catch(() => setError('The browser could not play this video clip.'))
    if (!playing && !video.paused) video.pause()
  }, [activeTimelineClip?.id, playhead, playing, muted, volume])

  useEffect(() => {
    const video = previewRef.current
    if (!video || !activeTimelineClip || activeTimelineClip.kind !== 'video') return
    const localTime = activeTimelineClip.trimStart + Math.max(0, playhead - activeTimelineClip.timelineStart)
    if (Math.abs(video.currentTime - localTime) > 0.35) video.currentTime = Math.min(activeTimelineClip.trimEnd, localTime)
  }, [activeTimelineClip?.id])

  useEffect(() => () => {
    if (playbackFrame.current !== null) cancelAnimationFrame(playbackFrame.current)
  }, [])

  const addMedia = async (files: FileList | null, kind: ClipKind) => {
    if (!files?.length) return
    setError('')
    setNotice('')
    const accepted: File[] = []
    for (const file of Array.from(files)) {
      if (kind === 'video' && !file.type.startsWith('video/')) { setError(file.name + ' is not a supported video file.'); continue }
      if (kind === 'image' && !['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'].includes(file.type)) { setError(file.name + ' is not a supported image.'); continue }
      const limit = kind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
      if (file.size > limit) { setError(file.name + ' exceeds the ' + (kind === 'video' ? '250 MB' : '20 MB') + ' limit.'); continue }
      accepted.push(file)
    }
    if (clips.length + accepted.length > MAX_CLIPS) {
      setError('A project can contain up to ' + MAX_CLIPS + ' video and image clips.')
      return
    }
    const additions: Clip[] = []
    for (const file of accepted) {
      const url = URL.createObjectURL(file)
      objectUrls.current.add(url)
      let storagePath: string
      try { storagePath = await uploadStudioAsset(projectId, file) }
      catch (cause) { URL.revokeObjectURL(url); objectUrls.current.delete(url); setError(cause instanceof Error ? cause.message : 'Media upload failed.'); continue }
      const duration = kind === 'image' ? 5 : await readMediaDuration(file, url, kind)
      if (kind === 'video' && duration <= 0) {
        URL.revokeObjectURL(url)
        objectUrls.current.delete(url)
        setError('Could not read ' + file.name + '. Try another MP4, WebM or MOV file.')
        continue
      }
      const timelineStart = Math.max(0, [...clips, ...additions].reduce((end, item) => Math.max(end, item.timelineStart + item.trimEnd - item.trimStart), 0))
      additions.push({ id: makeId(), kind, name: file.name, url, duration, trimStart: 0, trimEnd: Math.max(0.1, duration), timelineStart, fileSize: file.size, storagePath })
    }
    if (additions.length) {
      setClips(items => [...items, ...additions])
      setSelectedId(additions[0].id)
      setNotice(additions.length + ' media ' + (additions.length === 1 ? 'clip added' : 'clips added') + ' to your timeline.')
    }
  }

  const addAudio = async (file?: File) => {
    if (!file) return
    setError('')
    if (!file.type.startsWith('audio/')) { setError('Choose an MP3, WAV, M4A, AAC or other supported audio file.'); return }
    if (file.size > MAX_AUDIO_BYTES) { setError('Audio file is larger than 50 MB.'); return }
    const url = URL.createObjectURL(file)
    objectUrls.current.add(url)
    let storagePath: string
    try { storagePath = await uploadStudioAsset(projectId, file) }
    catch (cause) { URL.revokeObjectURL(url); objectUrls.current.delete(url); setError(cause instanceof Error ? cause.message : 'Audio upload failed.'); return }
    const duration = await new Promise<number>(resolve => {
      const el = document.createElement('audio')
      el.onloadedmetadata = () => resolve(Number.isFinite(el.duration) ? el.duration : 0)
      el.onerror = () => resolve(0)
      el.src = url
    })
    if (!duration) { URL.revokeObjectURL(url); objectUrls.current.delete(url); setError('Could not read this audio file.'); return }
    setAudio(current => { if (current) { URL.revokeObjectURL(current.url); objectUrls.current.delete(current.url) }; return { id: makeId(), name: file.name, url, duration, trimStart: 0, trimEnd: duration, timelineStart: 0, fileSize: file.size, storagePath } })
    setNotice('Music track added. Adjust its volume in the Audio panel.')
  }

  const updateClip = (id: string, patch: Partial<Clip>) => setClips(items => items.map(item => item.id === id ? { ...item, ...patch } : item))
  const addTextLayer = (kind: TextLayer['kind']) => {
    const presets = {
      heading: { text: 'Add a heading', fontSize: 42, bold: true, y: 18 },
      subheading: { text: 'Add a subheading', fontSize: 30, bold: true, y: 32 },
      body: { text: 'Add a little bit of body text', fontSize: 20, bold: false, y: 45 },
    }
    const preset = presets[kind]
    const layer: TextLayer = { id: makeId(), kind, text: preset.text, x: 10, y: preset.y, width: 80, fontSize: preset.fontSize, color: '#ffffff', effect: 'Simple', effectIntensity: 60, effectBlur: 8, effectDistance: 4, effectAngle: 45, effectColor: '#a855f7', effectSecondaryColor: '#22d3ee', bold: preset.bold, italic: false, underline: false, fontFamily: 'Default', align: 'center', rotation: 0, timelineStart: 0, timelineDuration: 5 }
    setTextLayers(items => [...items, layer])
    setSelectedTextId(layer.id)
    setEditingTextId(null)
    setActivePanel('text')
    setNotice('Text added. Edit it directly on the canvas.')
  }
  const updateTextLayer = (id: string, patch: Partial<TextLayer>) => setTextLayers(items => items.map(item => item.id === id ? { ...item, ...patch } : item))
  const duplicateTextLayer = (id: string) => {
    const layer = textLayers.find(item => item.id === id)
    if (!layer) return
    const copy: TextLayer = { ...layer, id: makeId(), x: Math.min(100 - layer.width, layer.x + 4), y: Math.min(96, layer.y + 4) }
    setTextLayers(items => [...items, copy])
    setSelectedTextId(copy.id)
    setEditingTextId(null)
    setNotice('Text duplicated.')
  }
  const beginTimelineDrag = (event: ReactPointerEvent<HTMLElement>, kind: TimelineDrag['kind'], id: string, mode: TimelineDrag['mode']) => {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const clip = kind === 'clip' ? clips.find(item => item.id === id) : null
    const layer = kind === 'text' ? textLayers.find(item => item.id === id) : null
    const track = kind === 'audio' && audio?.id === id ? audio : null
    if (clip) timelineDrag.current = { id, kind, mode, pointerId: event.pointerId, startX: event.clientX, startAt: clip.timelineStart, trimStart: clip.trimStart, trimEnd: clip.trimEnd, duration: clip.duration }
    else if (layer) timelineDrag.current = { id, kind, mode, pointerId: event.pointerId, startX: event.clientX, startAt: layer.timelineStart, trimStart: 0, trimEnd: layer.timelineDuration, duration: Math.max(MIN_TIMELINE_SECONDS, layer.timelineStart + layer.timelineDuration) }
    else if (track) timelineDrag.current = { id, kind, mode, pointerId: event.pointerId, startX: event.clientX, startAt: track.timelineStart, trimStart: track.trimStart, trimEnd: track.trimEnd, duration: track.duration }
  }
  const moveTimelineDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = timelineDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const delta = (event.clientX - drag.startX) / TIMELINE_PX_PER_SECOND
    if (drag.kind === 'text') {
      const layer = textLayers.find(item => item.id === drag.id)
      if (!layer) return
      if (drag.mode === 'move') updateTextLayer(drag.id, { timelineStart: Math.max(0, drag.startAt + delta) })
      else if (drag.mode === 'left') {
        const end = drag.startAt + drag.trimEnd
        const nextStart = Math.max(0, Math.min(end - 0.1, drag.startAt + delta))
        updateTextLayer(drag.id, { timelineStart: nextStart, timelineDuration: Math.max(0.1, end - nextStart) })
      } else updateTextLayer(drag.id, { timelineDuration: Math.max(0.1, drag.trimEnd + delta) })
    } else if (drag.kind === 'clip') {
      const clip = clips.find(item => item.id === drag.id)
      if (!clip) return
      if (drag.mode === 'move') updateClip(drag.id, { timelineStart: Math.max(0, drag.startAt + delta) })
      else if (drag.mode === 'left') {
        const nextStart = Math.max(0, Math.min(drag.trimEnd - 0.1, drag.trimStart + delta))
        updateClip(drag.id, { trimStart: nextStart, timelineStart: Math.max(0, drag.startAt + nextStart - drag.trimStart) })
      } else updateClip(drag.id, { trimEnd: Math.max(drag.trimStart + 0.1, Math.min(drag.duration, drag.trimEnd + delta)) })
    } else if (audio?.id === drag.id) {
      if (drag.mode === 'move') setAudio({ ...audio, timelineStart: Math.max(0, drag.startAt + delta) })
      else if (drag.mode === 'left') {
        const nextStart = Math.max(0, Math.min(drag.trimEnd - 0.1, drag.trimStart + delta))
        setAudio({ ...audio, trimStart: nextStart, timelineStart: Math.max(0, drag.startAt + nextStart - drag.trimStart) })
      } else setAudio({ ...audio, trimEnd: Math.max(drag.trimStart + 0.1, Math.min(drag.duration, drag.trimEnd + delta)) })
    }
  }
  const endTimelineDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (timelineDrag.current?.pointerId === event.pointerId) timelineDrag.current = null
  }
  const removeTextLayer = (id: string) => {
    textDrafts.current.delete(id)
    setTextLayers(items => items.filter(item => item.id !== id))
    if (selectedTextId === id) setSelectedTextId(null)
    if (editingTextId === id) setEditingTextId(null)
  }
  const beginTextDrag = (event: ReactPointerEvent<HTMLElement>, layer: TextLayer, mode: TextDrag['mode']) => {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const rect = canvasRef.current?.getBoundingClientRect()
    const centerX = rect ? rect.left + (layer.x + layer.width / 2) / 100 * rect.width : event.clientX
    const centerY = rect ? rect.top + (layer.y + 2) / 100 * rect.height : event.clientY
    const startAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX)
    textDrag.current = { id: layer.id, pointerId: event.pointerId, mode, startX: event.clientX, startY: event.clientY, startAngle, originX: layer.x, originY: layer.y, originWidth: layer.width, originFontSize: layer.fontSize, originRotation: layer.rotation }
    setSelectedTextId(layer.id)
    setEditingTextId(null)
  }
  const moveTextPointer = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = textDrag.current
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!drag || drag.pointerId !== event.pointerId || !rect) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (drag.mode === 'move') updateTextLayer(drag.id, { x: Math.min(100, Math.max(0, drag.originX + dx / rect.width * 100)), y: Math.min(96, Math.max(0, drag.originY + dy / rect.height * 100)) })
    else if (drag.mode === 'resize') updateTextLayer(drag.id, { width: Math.min(100, Math.max(12, drag.originWidth + dx / rect.width * 100)), fontSize: Math.min(160, Math.max(10, drag.originFontSize + dy * 0.35)) })
    else {
      const centerX = rect.left + (drag.originX + drag.originWidth / 2) / 100 * rect.width
      const centerY = rect.top + (drag.originY + 2) / 100 * rect.height
      const angle = Math.atan2(event.clientY - centerY, event.clientX - centerX)
      const delta = (angle - drag.startAngle) * 180 / Math.PI
      updateTextLayer(drag.id, { rotation: ((drag.originRotation + delta + 360) % 360) })
    }
  }
  const endTextPointer = (event: ReactPointerEvent<HTMLElement>) => {
    if (textDrag.current?.pointerId === event.pointerId) textDrag.current = null
  }
  const removeClip = (id: string) => {
    const target = clips.find(item => item.id === id)
    if (!target) return
    URL.revokeObjectURL(target.url)
    objectUrls.current.delete(target.url)
    const next = clips.filter(item => item.id !== id)
    setClips(next)
    if (selectedId === id) setSelectedId(next[0]?.id || null)
  }
  const moveClip = (id: string, direction: number) => setClips(items => {
    const index = items.findIndex(item => item.id === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= items.length) return items
    const next = [...items]
    ;[next[index], next[target]] = [next[target], next[index]]
    return next
  })
  const togglePlayback = () => {
    if (playing) {
      if (playbackFrame.current !== null) cancelAnimationFrame(playbackFrame.current)
      playbackFrame.current = null
      previewRef.current?.pause()
      audioRef.current?.pause()
      setPlaying(false)
      return
    }
    if (!clips.length || projectEnd <= 0) { setNotice('Add a video or photo to the timeline before playing.'); return }
    const startAt = playhead >= projectEnd ? 0 : playhead
    setPlayhead(startAt)
    lastPlaybackTime.current = startAt
    playbackStartedAt.current = performance.now() - startAt * 1000
    setPlaying(true)
    setError('')
    const tick = (now: number) => {
      const elapsedMs = Math.max(0, now - playbackStartedAt.current)
      const time = Math.min(projectEnd, quantizeStudioTime(startAt + elapsedMs / 1000))
      if (time !== lastPlaybackTime.current) {
        lastPlaybackTime.current = time
        setPlayhead(time)
      }
      const active = [...clips].filter(item => time >= item.timelineStart && time < item.timelineStart + item.trimEnd - item.trimStart).sort((a, b) => a.timelineStart - b.timelineStart).at(-1)
      const video = previewRef.current
      if (active?.kind === 'video' && video) {
        const localTime = active.trimStart + time - active.timelineStart
        const frameAlignedVideoTime = quantizeStudioTime(localTime)
        if (Math.abs(video.currentTime - frameAlignedVideoTime) > STUDIO_FRAME_DURATION_SECONDS * 2.5) video.currentTime = Math.min(active.trimEnd, frameAlignedVideoTime)
        video.volume = muted ? 0 : volume / 100
        video.muted = muted
        if (video.paused) void video.play().catch(() => setError('The browser could not play this video clip.'))
      } else if (video && !video.paused) video.pause()
      if (audioRef.current && audio) {
        const elapsed = time - audio.timelineStart
        const audioActive = elapsed >= 0 && elapsed < audio.trimEnd - audio.trimStart
        if (audioActive) {
          const target = quantizeStudioTime(audio.trimStart + elapsed)
          if (Math.abs(audioRef.current.currentTime - target) > 0.1) audioRef.current.currentTime = target
          audioRef.current.volume = audioVolume / 100
          if (audioRef.current.paused) void audioRef.current.play().catch(() => setNotice('Browser blocked background audio preview.'))
        } else if (!audioRef.current.paused) audioRef.current.pause()
      }
      if (time >= projectEnd) {
        playbackFrame.current = null
        previewRef.current?.pause()
        audioRef.current?.pause()
        setPlaying(false)
        return
      }
      playbackFrame.current = requestAnimationFrame(tick)
    }
    playbackFrame.current = requestAnimationFrame(tick)
  }
  const seekTimeline = (event: ReactPointerEvent<HTMLElement>) => {
    if (playing) {
      if (playbackFrame.current !== null) cancelAnimationFrame(playbackFrame.current)
      playbackFrame.current = null
      previewRef.current?.pause()
      audioRef.current?.pause()
      setPlaying(false)
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const localX = Math.max(0, Math.min(timelineWidth, event.clientX - rect.left))
    setPlayhead(localX / TIMELINE_PX_PER_SECOND)
  }
  useEffect(() => { if (audioRef.current) audioRef.current.volume = audioVolume / 100 }, [audioVolume, audio?.url])

  useEffect(() => {
    if (!isAnimationPreviewing) return
    let frame = 0
    const tick = (now: number) => {
      const elapsed = Math.max(0, now - animationPreviewStart.current)
      const duration = previewDurationMs
      const nextPreviewTime = elapsed >= duration ? duration : studioFrameTimeFromElapsedMs(elapsed) * 1000
      if (nextPreviewTime !== lastAnimationPreviewTime.current) {
        lastAnimationPreviewTime.current = nextPreviewTime
        setAnimationPreviewTime(nextPreviewTime)
        // Keep the project playhead fixed: only the selected text layer uses this preview clock.
        // The underlying video and audio remain paused on their current frame.
      }
      if (elapsed >= duration) {
        setIsAnimationPreviewing(false)
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [isAnimationPreviewing, selectedAnimation, selectedText?.animation?.durationMs, selectedText?.animation?.delayMs, selectedText?.animation?.speed, selectedText?.animation?.repeatCount, animationPreviewStartSeconds])

  useEffect(() => { setIsAnimationPreviewing(false); setAnimationPreviewTime(0) }, [selectedTextId])

  const resetTextAnimation = () => {
    if (!selectedText) return
    setIsAnimationPreviewing(false)
    setAnimationPreviewTime(0)
    updateTextLayer(selectedText.id, { animation: undefined })
    setNotice('Animation settings reset for the selected text layer.')
  }

  const updateSelectedAnimationSettings = (patch: Partial<TextAnimationSettings>) => {
    if (!selectedText || !selectedAnimation) return
    setIsAnimationPreviewing(false)
    setAnimationPreviewTime(0)
    updateTextLayer(selectedText.id, { animation: normalizeTextAnimationSettings({ ...selectedText.animation, ...patch, animationId: selectedAnimation.id, enabled: true }) })
  }
  const applyTextAnimation = (id: string) => {
    if (!selectedText) return
    const definition = STUDIO_TEXT_ANIMATION_BY_ID.get(id)
    if (!definition) return

    if (playing) {
      if (playbackFrame.current !== null) cancelAnimationFrame(playbackFrame.current)
      playbackFrame.current = null
      previewRef.current?.pause()
      audioRef.current?.pause()
      setPlaying(false)
    }

    const previousSettings = selectedText.animation || {}
    const repeatCount = previousSettings.repeatCount ?? (definition.mode === 'loop' || definition.mode === 'continuous' ? 0 : 1)
    const cycleDurationMs = previousSettings.durationMs ?? definition.defaultDurationMs
    const previewDuration = cycleDurationMs / Math.max(0.1, previousSettings.speed ?? 1) * (repeatCount === 0 ? 2 : Math.max(1, repeatCount))
    const previewStartSeconds = definition.mode === 'exit'
      ? Math.max(selectedText.timelineStart, selectedText.timelineStart + selectedText.timelineDuration - previewDuration / 1000)
      : selectedText.timelineStart

    setIsAnimationPreviewing(false)
    setAnimationPreviewTime(0)
    updateTextLayer(selectedText.id, { animation: normalizeTextAnimationSettings({
      ...previousSettings,
      animationId: id,
      durationMs: cycleDurationMs,
      delayMs: previousSettings.delayMs ?? 0,
      repeatCount,
      direction: previousSettings.direction ?? 'normal',
      easing: previousSettings.easing ?? definition.defaultEasing ?? 'ease',
      speed: previousSettings.speed ?? 1,
      intensity: previousSettings.intensity ?? 1,
      enabled: true,
    }) })
    setPlayhead(quantizeStudioTime(previewStartSeconds))

    // Start after React commits the new layer settings so the preview clock
    // samples the newly selected definition on its very first frame.
    window.requestAnimationFrame(() => {
      animationPreviewStart.current = performance.now()
      lastAnimationPreviewTime.current = 0
      setAnimationPreviewTime(0)
      setIsAnimationPreviewing(true)
    })
  }


  const exportVideo = async () => {
    if (!clips.length) { setError('Add at least one video or photo clip before exporting.'); return }
    if (typeof MediaRecorder === 'undefined') { setError('Video export is not supported by this browser. Try the latest Chrome or Edge.'); return }
    if (!HTMLCanvasElement.prototype.captureStream) { setError('This browser does not support canvas video export. Try the latest Chrome or Edge.'); return }
    setError('')
    setNotice('')
    setExporting(true)
    setExportProgress(0)
    let recorder: MediaRecorder | null = null
    let audioContext: AudioContext | null = null
    let musicElement: HTMLAudioElement | null = null
    let audioDestination: MediaStreamAudioDestinationNode | null = null
    let exportStream: MediaStream | null = null
    const exportVideos = new Map<string, HTMLVideoElement>()
    let animationFrame = 0
    try {
      await Promise.all([...new Set(textLayers.map(layer => layer.fontFamily || 'Default'))].filter(family => family !== 'Default').map(loadGoogleFont))
      const canvas = document.createElement('canvas')
      canvas.width = Math.min(1920, Math.max(240, Math.round(exportWidth)))
      canvas.height = Math.min(1920, Math.max(240, Math.round(exportHeight)))
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Could not create the video rendering canvas.')
      const stream = canvas.captureStream(STUDIO_FRAME_RATE)
      exportStream = stream
      const AudioContextClass = window.AudioContext
      if (AudioContextClass && (audio || clips.some(item => item.kind === 'video'))) {
        audioContext = new AudioContextClass()
        await audioContext.resume()
        audioDestination = audioContext.createMediaStreamDestination()
        audioDestination.stream.getAudioTracks().forEach(track => stream.addTrack(track))
        if (audio) {
          musicElement = document.createElement('audio')
          musicElement.src = audio.url
          musicElement.loop = true
          const musicSource = audioContext.createMediaElementSource(musicElement)
          musicSource.connect(audioDestination)
          musicElement.volume = audioVolume / 100
        }
        for (const clip of clips.filter(item => item.kind === 'video')) {
          const videoElement = document.createElement('video')
          videoElement.crossOrigin = 'anonymous'
          videoElement.src = clip.url
          videoElement.muted = false
          videoElement.playsInline = true
          videoElement.preload = 'auto'
          await new Promise<void>((resolve, reject) => {
            videoElement.onloadedmetadata = () => resolve()
            videoElement.onerror = () => reject(new Error('Could not prepare audio/video clip: ' + clip.name))
          })
          const videoSource = audioContext.createMediaElementSource(videoElement)
          videoSource.connect(audioDestination)
          exportVideos.set(clip.id, videoElement)
        }
      }
      const mimeTypes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
      const mimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type))
      if (!mimeType) throw new Error('No supported WebM or MP4 recording format was found in this browser.')
      const chunks: BlobPart[] = []
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: /Android|iPhone|iPad/i.test(navigator.userAgent) ? 3_000_000 : canvas.width >= 1080 ? 5_000_000 : 2_500_000 })
      const stopped = new Promise<Blob>((resolve, reject) => {
        recorder!.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
        recorder!.onstop = () => resolve(new Blob(chunks, { type: recorder!.mimeType || mimeType }))
        recorder!.onerror = () => reject(new Error('The browser stopped recording unexpectedly.'))
      })
      const orderedExportTextLayers = [...textLayers].sort((a, b) => a.timelineStart - b.timelineStart)
      const drawTitle = (timelineTime: number) => {
        ctx.save()
        const scale = canvas.width / 420
        for (const layer of orderedExportTextLayers) {
          if (timelineTime < layer.timelineStart) break
          if (timelineTime >= layer.timelineStart + layer.timelineDuration) continue
          ctx.save()
          const animationSample = getLayerAnimationSample(layer, timelineTime)
          if (animationSample && !animationSample.visible) { ctx.restore(); continue }
          ctx.globalAlpha = Math.min(100, Math.max(0, layer.opacity ?? 100)) / 100 * (animationSample?.opacity ?? 1)
          ctx.fillStyle = layer.color
          ctx.textAlign = layer.align
          ctx.textBaseline = 'top'
          const exportFontFamily = layer.fontFamily && layer.fontFamily !== 'Default' ? '"' + layer.fontFamily.replace(/["\\]/g, '') + '", sans-serif' : 'Arial, Helvetica, sans-serif'
          ctx.font = (layer.italic ? 'italic ' : '') + (layer.bold ? '700 ' : '400 ') + Math.round(layer.fontSize * scale) + 'px ' + exportFontFamily
          const effect = layer.effect || 'Simple'
          const strength = Math.max(0, Math.min(100, layer.effectIntensity ?? 60)) / 60
          const effectColor = layer.effectColor || '#a855f7'
          const secondEffectColor = layer.effectSecondaryColor || '#22d3ee'
          const maxWidth = canvas.width * layer.width / 100
          const boxX = canvas.width * layer.x / 100
          const boxY = canvas.height * layer.y / 100
          ctx.translate(boxX + maxWidth / 2, boxY + Math.round(layer.fontSize * scale) / 2)
          ctx.rotate(layer.rotation * Math.PI / 180)
          // Match the live editor: animation transforms pivot around this text layer's center.
          if (animationSample) {
            ctx.translate(animationSample.translateX * scale, animationSample.translateY * scale)
            const rx = animationSample.rotateX * Math.PI / 180
            const ry = animationSample.rotateY * Math.PI / 180
            ctx.transform(Math.cos(ry), Math.sin(rx) * 0.35, Math.sin(ry) * 0.35, Math.cos(rx), 0, 0)
            ctx.scale(animationSample.scaleX, animationSample.scaleY)
            ctx.rotate(animationSample.rotate * Math.PI / 180)
            ctx.transform(1, Math.tan(animationSample.skewY * Math.PI / 180), Math.tan(animationSample.skewX * Math.PI / 180), 1, 0, 0)
            if (typeof ctx.filter === 'string' && animationSample.blur > 0) ctx.filter = 'blur(' + animationSample.blur * scale + 'px)'
          }
          const x = -maxWidth / 2
          const y = -Math.round(layer.fontSize * scale) / 2
          const lineHeight = Math.round(layer.fontSize * scale * 1.2)
          const formattedText = getFormattedText(layer)
          const animationDefinition = STUDIO_TEXT_ANIMATION_BY_ID.get(layer.animation?.animationId || '')
          if (animationDefinition?.maskEffect && animationSample) {
            const mask = sampleMaskReveal({ effect: animationDefinition.maskEffect, progress: animationSample.progress, intensity: layer.animation?.intensity ?? 1 })
            ctx.translate(x, y)
            clipCanvasForMask(ctx, mask, maxWidth, Math.max(lineHeight, lineHeight * formattedText.split('\\n').length))
            ctx.translate(-x, -y)
          }
          const characterDefinition = STUDIO_TEXT_ANIMATION_BY_ID.get(layer.animation?.animationId || '')
          const wordDefinition = STUDIO_TEXT_ANIMATION_BY_ID.get(layer.animation?.animationId || '')
          const characterList = splitStudioGraphemes(formattedText)
          const wordCount = (formattedText.match(/\S+/g) || []).length
          let wordOffset = 0
          let characterOffset = 0
          formattedText.split(/\n/).forEach((line, index) => {
            const textX = layer.align === 'left' ? x : layer.align === 'right' ? x + maxWidth : x + maxWidth / 2
          ctx.shadowColor = strength > 0 ? effectColor : 'transparent'
          ctx.shadowBlur = (layer.effectBlur ?? 8) * strength * scale
          ctx.shadowOffsetX = Math.cos((layer.effectAngle ?? 45) * Math.PI / 180) * (layer.effectDistance ?? 4) * strength * scale
          ctx.shadowOffsetY = Math.sin((layer.effectAngle ?? 45) * Math.PI / 180) * (layer.effectDistance ?? 4) * strength * scale
          ctx.lineJoin = 'round'
          if (['Drop Shadow','Floating Shadow','Ambient Shadow','Layered Shadow','Hard Shadow','Long Shadow','3D Extrude','Perspective Depth'].includes(effect)) {
            ctx.shadowColor = effectColor; ctx.shadowBlur = effect === 'Hard Shadow' || effect === 'Long Shadow' || effect === '3D Extrude' ? 0 : (layer.effectBlur ?? 8) * strength * scale; ctx.shadowOffsetX = Math.cos((layer.effectAngle ?? 45) * Math.PI / 180) * (layer.effectDistance ?? 4) * strength * scale; ctx.shadowOffsetY = Math.sin((layer.effectAngle ?? 45) * Math.PI / 180) * (layer.effectDistance ?? 4) * strength * scale
          } else if (['Neon Glow','Soft Glow','Outer Glow','Inner Glow','Rainbow Glow','Electric Glow','Golden Glow','Holographic Glow','Neon Outline'].includes(effect)) {
            ctx.shadowColor = effect === 'Golden Glow' ? '#f59e0b' : effect === 'Rainbow Glow' || effect === 'Holographic Glow' ? '#e879f9' : effectColor; ctx.shadowBlur = (layer.effectBlur ?? 8) * strength * scale
          } else if (['Echo','Ghost','Motion Blur','Glitch','RGB Split','Pixel','Retro','Comic'].includes(effect)) {
            ctx.shadowColor = effectColor; ctx.shadowBlur = effect === 'Motion Blur' ? 7 * strength : 2 * strength; ctx.shadowOffsetX = effect === 'Motion Blur' ? 7 * strength : 3 * strength; ctx.shadowOffsetY = effect === 'Retro' || effect === 'Comic' ? 3 * strength : 0
          }
          if (!characterDefinition?.characterEffect && ['Outline','Double Outline','Triple Stroke','Neon Outline','Gradient Stroke','Hollow Text','Comic'].includes(effect)) {
            ctx.lineWidth = Math.max(1, (effect === 'Triple Stroke' ? 3 : 1.8) * strength * scale); ctx.strokeStyle = effectColor
            ctx.strokeText(line, textX, y + index * lineHeight, maxWidth)
            if (effect === 'Double Outline' || effect === 'Triple Stroke') { ctx.lineWidth = Math.max(1, scale); ctx.strokeStyle = secondEffectColor; ctx.strokeText(line, textX, y + index * lineHeight, maxWidth) }
            if (effect === 'Hollow Text') { ctx.shadowBlur = 0; return }
          }
          if (['Metallic','Hologram'].includes(effect)) {
            const gradient = ctx.createLinearGradient(x, y, x + maxWidth, y + lineHeight)
            if (effect === 'Hologram') { gradient.addColorStop(0,'#ff4d6d'); gradient.addColorStop(.22,'#ffb703'); gradient.addColorStop(.45,'#80ed99'); gradient.addColorStop(.68,'#4cc9f0'); gradient.addColorStop(.85,'#9b5de5'); gradient.addColorStop(1,'#ff4d6d') }
            else { gradient.addColorStop(0,effectColor); gradient.addColorStop(.5,secondEffectColor); gradient.addColorStop(1,effectColor) }
            ctx.fillStyle = gradient
          }
          if (effect === 'Emboss') { ctx.shadowColor = 'rgba(255,255,255,.8)'; ctx.shadowOffsetX = -1*scale; ctx.shadowOffsetY = -1*scale; ctx.shadowBlur = 1*scale }
          if (effect === 'Engrave') { ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowOffsetX = -1*scale; ctx.shadowOffsetY = -1*scale; ctx.shadowBlur = 1*scale }
          if (!characterDefinition?.characterEffect && (effect === 'Glitch' || effect === 'RGB Split')) { ctx.save(); ctx.globalAlpha *= .55; ctx.fillStyle = effect === 'Glitch' ? '#ff1744' : '#ff3030'; ctx.fillText(line, textX - 2*scale, y + index * lineHeight, maxWidth); ctx.fillStyle = '#00d9ff'; ctx.fillText(line, textX + 2*scale, y + index * lineHeight, maxWidth); ctx.restore() }
          if (!characterDefinition?.characterEffect && (effect === 'Echo' || effect === 'Ghost' || effect === 'Long Shadow' || effect === '3D Extrude')) { ctx.save(); ctx.globalAlpha *= .32; ctx.fillStyle = effectColor; for(let step=4;step>=1;step--) ctx.fillText(line,textX+step*scale,y+index*lineHeight+step*scale,maxWidth); ctx.restore() }
            if (wordDefinition?.wordEffect && animationSample) {
              const tokens = line.match(/\S+|\s+/g) || []
              const measuredLine = ctx.measureText(line).width
              let cursor = layer.align === 'left' ? textX : layer.align === 'right' ? textX + maxWidth - measuredLine : textX + (maxWidth - measuredLine) / 2
              let lineIndex = index
              tokens.forEach(token => {
                if (/^\s+$/.test(token)) { cursor += ctx.measureText(token).width; return }
                const wordWidth = ctx.measureText(token).width
                const motion = sampleWordMotion({ effect: wordDefinition.wordEffect!, progress: animationSample.progress, index: wordOffset++, count: Math.max(1, wordCount), lineIndex, lineCount: formattedText.split('\\n').length, intensity: layer.animation?.intensity ?? 1 })
                ctx.save()
                ctx.globalAlpha *= motion.opacity
                ctx.textAlign = 'left'
                ctx.textBaseline = 'top'
                ctx.translate(cursor + wordWidth / 2 + motion.x * scale, y + index * lineHeight + lineHeight / 2 + motion.y * scale)
                ctx.rotate(motion.rotate * Math.PI / 180)
                ctx.transform(1, 0, Math.tan(motion.rotateX * Math.PI / 180), 1, 0, 0)
                ctx.scale(motion.scale, motion.scale)
                if (typeof ctx.filter === 'string' && motion.blur > 0) ctx.filter = 'blur(' + motion.blur * scale + 'px)'
                if (motion.clip < 1) { ctx.beginPath(); ctx.rect(-wordWidth / 2, -lineHeight / 2, wordWidth * motion.clip, lineHeight * 2); ctx.clip() }
                if (motion.opacity > .001) ctx.fillText(token, -wordWidth / 2, lineHeight * .1)
                ctx.restore()
                cursor += wordWidth
              })
              characterOffset += splitStudioGraphemes(line).length + 1
            } else if (characterDefinition?.characterEffect && animationSample) {
              const glyphs=splitStudioGraphemes(line),widths=glyphs.map(g=>ctx.measureText(g).width),natural=widths.reduce((s,w)=>s+w,0)+Math.max(0,glyphs.length-1)*animationSample.letterSpacing*scale,fit=natural>maxWidth&&natural>0?maxWidth/natural:1,lineWidth=natural*fit
              let cursor=layer.align==='left'?textX:layer.align==='right'?textX+maxWidth-lineWidth:textX+(maxWidth-lineWidth)/2
              glyphs.forEach((glyph,glyphIndex)=>{const motion=sampleCharacterMotion({effect:characterDefinition.characterEffect!,progress:animationSample.motionProgress,index:characterOffset+glyphIndex,count:characterList.length,intensity:layer.animation?.intensity??1}),w=widths[glyphIndex]*fit;ctx.save();ctx.globalAlpha*=motion.opacity;ctx.textAlign='left';ctx.textBaseline='top';ctx.translate(cursor+w/2+motion.translateX*scale,y+index*lineHeight+lineHeight/2+motion.translateY*scale);ctx.rotate(motion.rotate*Math.PI/180);ctx.scale(motion.scaleX*fit,motion.scaleY);if(typeof ctx.filter==='string'&&motion.blur>0)ctx.filter='blur('+motion.blur*scale+'px)';if(motion.clipProgress<1){ctx.beginPath();ctx.rect(-widths[glyphIndex]/2,-lineHeight*.5,widths[glyphIndex]*motion.clipProgress,lineHeight*2);ctx.clip()}if(motion.opacity>.001){if(['Outline','Double Outline','Triple Stroke','Neon Outline','Gradient Stroke','Hollow Text','Comic'].includes(effect)){ctx.strokeStyle=effectColor;ctx.lineWidth=Math.max(1,(effect==='Triple Stroke'?3:1.8)*strength*scale);ctx.strokeText(glyph,-widths[glyphIndex]/2,lineHeight*.1)}ctx.fillText(glyph,-widths[glyphIndex]/2,lineHeight*.1)};ctx.restore();cursor+=w+animationSample.letterSpacing*scale*fit});characterOffset+=glyphs.length+1
            } else {ctx.fillText(line,textX,y+index*lineHeight,maxWidth);characterOffset+=splitStudioGraphemes(line).length+1}
            if (layer.underline || layer.strikethrough) {
              const measured = Math.min(maxWidth, ctx.measureText(line).width)
              const startX = layer.align === 'left' ? x : layer.align === 'right' ? x + maxWidth - measured : x + (maxWidth - measured) / 2
              const thickness = Math.max(1, scale)
              if (layer.underline) ctx.fillRect(startX, y + index * lineHeight + lineHeight - thickness, measured, thickness)
              if (layer.strikethrough) ctx.fillRect(startX, y + index * lineHeight + lineHeight * 0.55, measured, thickness)
            }
          })
          ctx.restore()
        }
        ctx.restore()
      }
      const drawVideoFrame = (video: HTMLVideoElement, timelineTime: number) => {
        ctx.fillStyle = '#000000'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        const scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight)
        const width = video.videoWidth * scale
        const height = video.videoHeight * scale
        ctx.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
        drawTitle(timelineTime)
      }
      recorder.start(1000)
      let timelineCursor = 0
      const orderedClips = [...clips].sort((a, b) => a.timelineStart - b.timelineStart)
      const syncMusic = (timelineTime: number) => {
        if (!musicElement || !audio) return
        const elapsed = timelineTime - audio.timelineStart
        const active = elapsed >= 0 && elapsed < audio.trimEnd - audio.trimStart
        if (active) {
          const target = audio.trimStart + elapsed
          if (Math.abs(musicElement.currentTime - target) > 0.35) musicElement.currentTime = target
          if (musicElement.paused) void musicElement.play().catch(() => undefined)
        } else if (!musicElement.paused) musicElement.pause()
      }
      for (let index = 0; index < orderedClips.length; index++) {
        const clip = orderedClips[index]
        if (clip.timelineStart > timelineCursor) {
          const gapStart = timelineCursor
          const gapDuration = clip.timelineStart - gapStart
          const gapStartedAt = performance.now()
          await new Promise<void>(resolve => {
            const frame = (now: number) => {
              const elapsed = Math.min(gapDuration, (now - gapStartedAt) / 1000)
              const timelineTime = quantizeStudioTime(gapStart + elapsed)
              ctx.fillStyle = '#000000'
              ctx.fillRect(0, 0, canvas.width, canvas.height)
              drawTitle(timelineTime)
              syncMusic(timelineTime)
              setExportProgress(Math.min(99, Math.round((timelineTime / Math.max(1, projectEnd)) * 100)))
              if (elapsed >= gapDuration) resolve()
              else animationFrame = requestAnimationFrame(frame)
            }
            animationFrame = requestAnimationFrame(frame)
          })
          timelineCursor = clip.timelineStart
        }
        if (clip.kind === 'image') {
          const image = new Image()
          image.src = clip.url
          await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Could not load photo clip: ' + clip.name)) })
          const durationMs = Math.max(100, (clip.trimEnd - clip.trimStart) * 1000)
          const start = performance.now()
          await new Promise<void>(resolve => {
            const frame = (now: number) => {
              ctx.fillStyle = '#000000'
              ctx.fillRect(0, 0, canvas.width, canvas.height)
              const scale = Math.min(canvas.width / image.width, canvas.height / image.height)
              const width = image.width * scale
              const height = image.height * scale
              ctx.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
              const timelineTime = quantizeStudioTime(clip.timelineStart + Math.min(durationMs / 1000, (now - start) / 1000))
              drawTitle(timelineTime)
              syncMusic(timelineTime)
              setExportProgress(Math.min(99, Math.round((timelineTime / Math.max(1, projectEnd)) * 100)))
              if (now - start >= durationMs) { timelineCursor = Math.max(timelineCursor, clip.timelineStart + durationMs / 1000); resolve() }
              else animationFrame = requestAnimationFrame(frame)
            }
            animationFrame = requestAnimationFrame(frame)
          })
        } else {
          const video = exportVideos.get(clip.id) || document.createElement('video')
          if (!exportVideos.has(clip.id)) {
            video.crossOrigin = 'anonymous'
            video.src = clip.url
            video.muted = true
            video.playsInline = true
            video.preload = 'auto'
            await new Promise<void>((resolve, reject) => {
              video.onloadedmetadata = () => resolve()
              video.onerror = () => reject(new Error('Could not load video clip: ' + clip.name))
            })
          }
          video.currentTime = clip.trimStart
          await new Promise<void>(resolve => { video.onseeked = () => resolve() })
          await video.play()
          await new Promise<void>((resolve, reject) => {
            const frame = () => {
              const timelineTime = quantizeStudioTime(clip.timelineStart + Math.min(clip.trimEnd - clip.trimStart, video.currentTime - clip.trimStart))
              if (video.readyState >= 2 && video.videoWidth > 0) drawVideoFrame(video, timelineTime)
              syncMusic(timelineTime)
              setExportProgress(Math.min(99, Math.round((timelineTime / Math.max(1, projectEnd)) * 100)))
              if (video.currentTime >= clip.trimEnd || video.ended) { video.pause(); resolve(); return }
              animationFrame = requestAnimationFrame(frame)
            }
            video.onerror = () => reject(new Error('Playback failed while exporting: ' + clip.name))
            animationFrame = requestAnimationFrame(frame)
          })
          video.pause()
          timelineCursor = Math.max(timelineCursor, clip.timelineStart + clip.trimEnd - clip.trimStart)
          video.removeAttribute('src')
          video.load()
        }
      }
      // Text layers and music may extend beyond the final media clip. Render that
      // remaining project interval instead of truncating the export at the last clip.
      if (projectEnd > timelineCursor + 1 / (STUDIO_FRAME_RATE * 2)) {
        const tailStart = timelineCursor
        const tailDuration = projectEnd - tailStart
        const tailStartedAt = performance.now()
        await new Promise<void>(resolve => {
          const frame = (now: number) => {
            const elapsed = Math.min(tailDuration, (now - tailStartedAt) / 1000)
            const timelineTime = elapsed >= tailDuration ? projectEnd : quantizeStudioTime(tailStart + elapsed)
            ctx.fillStyle = '#000000'
            ctx.fillRect(0, 0, canvas.width, canvas.height)
            drawTitle(timelineTime)
            syncMusic(timelineTime)
            setExportProgress(Math.min(99, Math.round((timelineTime / Math.max(1, projectEnd)) * 100)))
            if (elapsed >= tailDuration) resolve()
            else animationFrame = requestAnimationFrame(frame)
          }
          animationFrame = requestAnimationFrame(frame)
        })
      }
      if (recorder.state !== 'inactive') recorder.stop()
      const blob = await stopped
      if (!blob.size) throw new Error('The exported video was empty. Please try again.')
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const extension = blob.type.includes('mp4') ? 'mp4' : 'webm'
      link.download = (projectName || 'socialens-video').replace(/[^a-z0-9-_]+/gi, '-').slice(0, 60) + '.' + extension
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60000)
      setExportProgress(100)
      setNotice('Video export complete. Your ' + extension.toUpperCase() + ' file is ready.')
    } catch (cause) {
      if (recorder && recorder.state !== 'inactive') recorder.stop()
      setError(cause instanceof Error ? cause.message : 'Video export failed. Please try again.')
    } finally {
      if (animationFrame) cancelAnimationFrame(animationFrame)
      if (musicElement) { musicElement.pause(); musicElement.removeAttribute('src'); musicElement.load() }
      exportVideos.forEach(video => { video.pause(); video.removeAttribute('src'); video.load() })
      if (audioContext) await audioContext.close().catch(() => undefined)
      exportStream?.getTracks().forEach(track => track.stop())
      exportStream = null
      setExporting(false)
    }
  }

  return (
    <main className="fixed inset-0 z-[70] flex min-h-0 flex-col overflow-hidden bg-[#080a13] pt-[env(safe-area-inset-top)] text-white">
      <header className="z-30 flex h-[62px] min-h-[62px] shrink-0 items-center justify-between border-b border-white/[0.09] bg-[#0c0f1d] px-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.assign('/studio') }} aria-label="Back to Studio" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/[0.06] hover:text-white"><ArrowLeft className="h-4 w-4" /></button>
          <img src="/images/socialens-studio-logo.png" alt="SociaLens Studio" className="h-9 w-9 shrink-0 object-contain" />
          <div className="hidden min-w-0 sm:block"><p className="truncate text-sm font-extrabold tracking-tight"><span className="text-white">SociaLens</span> <span className="bg-gradient-to-r from-fuchsia-400 to-violet-400 bg-clip-text text-transparent">Studio</span></p><p className="text-[9px] text-slate-500">Video editor</p></div>
          <div className="mx-2 hidden h-8 w-px bg-white/10 lg:block" />
          <div className="min-w-0 max-w-[180px] border-l border-white/10 pl-3 sm:max-w-[260px]"><p className="truncate text-xs font-semibold text-slate-200">{projectName || 'Untitled video project'}</p><p className="mt-0.5 flex items-center gap-1.5 text-[9px] text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {saveStatus}</p></div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full border border-emerald-400/15 bg-emerald-400/[0.06] px-3 py-2 text-[10px] text-emerald-200 md:flex"><Check className="h-3.5 w-3.5" /> {saveStatus === 'All changes saved' ? 'Saved' : saveStatus}</span>
          <button type="button" disabled={exporting || !clips.length} onClick={() => void exportVideo()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 text-[11px] font-bold shadow-lg shadow-violet-950/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">{exporting ? 'Exporting ' + exportProgress + '%' : <><DownloadIcon /> Export</>}</button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <nav className="z-20 hidden w-[76px] shrink-0 flex-col items-center gap-2 border-r border-white/[0.08] bg-[#0d1020] py-3 md:flex">
          <button type="button" onClick={() => setActivePanel('media')} className={'flex w-[60px] flex-col items-center gap-1.5 rounded-xl px-1 py-3 text-[9px] font-semibold transition ' + (activePanel === 'media' ? 'bg-gradient-to-b from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-950/40' : 'text-slate-400 hover:bg-white/[0.05] hover:text-white')}><FolderOpen className="h-5 w-5" />Media</button>
          <button type="button" onClick={() => setActivePanel('text')} className={'flex w-[60px] flex-col items-center gap-1.5 rounded-xl px-1 py-3 text-[9px] font-semibold transition ' + (activePanel === 'text' ? 'bg-gradient-to-b from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-950/40' : 'text-slate-400 hover:bg-white/[0.05] hover:text-white')}><Type className="h-5 w-5" />Text</button>
          <button type="button" onClick={() => setActivePanel('audio')} className={'flex w-[60px] flex-col items-center gap-1.5 rounded-xl px-1 py-3 text-[9px] font-semibold transition ' + (activePanel === 'audio' ? 'bg-gradient-to-b from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-950/40' : 'text-slate-400 hover:bg-white/[0.05] hover:text-white')}><Music2 className="h-5 w-5" />Audio</button>
          <button type="button" onClick={() => { setActivePanel('animation'); setFontMenuOpen(false); setTransparencyMenuOpen(false) }} className={'flex w-[60px] flex-col items-center gap-1.5 rounded-xl px-1 py-3 text-[9px] font-semibold transition ' + (activePanel === 'animation' ? 'bg-gradient-to-b from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-950/40' : 'text-slate-400 hover:bg-white/[0.05] hover:text-white')}><Sparkles className="h-5 w-5" />Animate</button>
          <div className="mt-auto flex flex-col items-center gap-1 pb-2"><span className="text-[8px] text-slate-600">SOCIALENS</span><span className="h-1 w-1 rounded-full bg-fuchsia-400" /></div>
        </nav>

        <aside className="hidden w-[260px] shrink-0 flex-col border-r border-white/[0.08] bg-[#0d1020] lg:flex">
          <div className="border-b border-white/[0.07] px-4 py-4">
            <div className="flex items-center justify-between"><h2 className="text-[12px] font-bold text-white">{activePanel === 'media' ? 'Project media' : activePanel === 'text' ? 'Text editor' : activePanel === 'audio' ? 'Audio library' : activePanel === 'effects' ? 'Text effects' : 'Text animations'}</h2><span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[9px] text-slate-500">{activePanel === 'media' ? clips.length + ' clips' : activePanel === 'audio' ? (audio ? '1 track' : '0 tracks') : activePanel === 'effects' ? '40 effects' : '3 text styles'}</span></div>
            <p className="mt-1 text-[9px] text-slate-500">{activePanel === 'media' ? 'Import and manage your video and photo clips.' : activePanel === 'text' ? 'Edit the text currently shown on your canvas.' : activePanel === 'audio' ? 'Add a music track and control its volume.' : activePanel === 'animation' ? 'Explore motion families for the selected text layer.' : 'Style the appearance of your selected text.'}</p>
          </div>

          {activePanel === 'media' && <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
            <div className="mb-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => videoInput.current?.click()} className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-[10px] font-bold"><Video className="h-3.5 w-3.5" /> Import video</button>
              <button type="button" onClick={() => imageInput.current?.click()} className="flex h-10 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] text-[10px] font-semibold text-slate-200 hover:bg-white/[0.08]"><ImagePlus className="h-3.5 w-3.5" /> Add photo</button>
            </div>
            <div className="mb-2 flex items-center justify-between px-1"><span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">Imported clips</span><span className="text-[9px] text-slate-600">{clips.length}/20</span></div>
            {clips.length ? <div className="space-y-1.5">{clips.map((item,index) => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={'flex w-full items-center gap-2 rounded-lg border p-2 text-left transition ' + (selected?.id === item.id ? 'border-fuchsia-400/40 bg-fuchsia-500/[0.09]' : 'border-transparent bg-white/[0.025] hover:border-white/10 hover:bg-white/[0.05]')}><span className="flex h-9 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[#171b2d]">{item.kind === 'image' ? <img src={item.url} alt="" className="h-full w-full object-cover" /> : <Video className="h-4 w-4 text-violet-300" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-semibold text-slate-200">{item.name}</span><span className="mt-0.5 block text-[9px] text-slate-500">{item.kind === 'image' ? 'Photo' : 'Video'} · {formatTime(item.trimEnd-item.trimStart)}</span></span><span className="text-[9px] text-slate-600">{index+1}</span></button>)}</div> : <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center"><div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.035]"><FolderOpen className="h-5 w-5 text-slate-500" /></div><p className="text-[11px] font-semibold text-slate-300">No media imported</p><p className="mt-1 text-[9px] leading-4 text-slate-500">Your imported videos and photos will appear here.</p></div>}
            <div className="mt-auto border-t border-white/[0.07] pt-3"><p className="text-[9px] leading-4 text-slate-600">Video limit: 250 MB · Photo limit: 20 MB · Up to 20 clips</p></div>
          </div>}

          {activePanel === 'text' && <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
            <p className="text-[10px] leading-4 text-slate-500">Choose a text style. It will be added directly to your canvas, where you can edit, move and resize it.</p>
            <button type="button" onClick={() => addTextLayer('heading')} className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-left transition hover:border-fuchsia-400/40 hover:bg-fuchsia-500/[0.07]"><span className="block text-[19px] font-extrabold text-white">Add a heading</span><span className="mt-1 block text-[9px] text-slate-500">Large title text</span></button>
            <button type="button" onClick={() => addTextLayer('subheading')} className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-left transition hover:border-fuchsia-400/40 hover:bg-fuchsia-500/[0.07]"><span className="block text-[15px] font-bold text-white">Add a subheading</span><span className="mt-1 block text-[9px] text-slate-500">Medium supporting text</span></button>
            <button type="button" onClick={() => addTextLayer('body')} className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-left transition hover:border-fuchsia-400/40 hover:bg-fuchsia-500/[0.07]"><span className="block text-[11px] font-medium text-white">Add a little bit of body text</span><span className="mt-1 block text-[9px] text-slate-500">Small body text</span></button>
          </div>}
          {activePanel === 'effects' && <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
            {!selectedText ? <div className="rounded-xl border border-dashed border-white/10 p-5 text-center text-[10px] text-slate-400">Select a text layer on the canvas to apply effects.</div> : <>
              {EFFECT_CATEGORIES.map(category => <section key={category}><h3 className="mb-2 text-[9px] font-bold uppercase tracking-[.12em] text-slate-500">{category}</h3><div className="grid grid-cols-2 gap-2">{TEXT_EFFECTS.filter(effect=>effect.category===category).map(effect=><button key={effect.name} type="button" onClick={()=>updateTextLayer(selectedText.id,{effect:effect.name,effectIntensity:selectedText.effectIntensity??60})} aria-pressed={selectedText.effect===effect.name} className={'group flex min-w-0 flex-col overflow-hidden rounded-xl border p-1.5 text-left transition '+(selectedText.effect===effect.name?'border-fuchsia-400/60 bg-fuchsia-500/10 ring-1 ring-fuchsia-400/20':'border-white/10 bg-white/[0.025] hover:border-fuchsia-300/30 hover:bg-white/[0.06]')}><span className="flex h-[54px] w-full items-center justify-center overflow-hidden rounded-lg border border-white/[0.07] bg-[#101525] px-1"><span aria-hidden="true" className="inline-block max-w-full whitespace-nowrap text-center text-[23px] leading-none tracking-tight" style={{display:'inline-block',width:'fit-content',maxWidth:'100%',fontFamily:selectedText.fontFamily&&selectedText.fontFamily!=='Default' ? '"'+selectedText.fontFamily+'", sans-serif' : 'Arial, Helvetica, sans-serif',fontWeight:selectedText.bold?900:400,fontStyle:selectedText.italic?'italic':'normal',color:selectedText.color,...getTextEffectStyle(effect.name,selectedText.effectIntensity??60,selectedText.effectColor||'#a855f7',selectedText.effectSecondaryColor||'#22d3ee',selectedText.effectBlur??8,selectedText.effectDistance??4,selectedText.effectAngle??45)}}>Aa</span></span><span className="mt-1.5 block w-full truncate px-0.5 text-center text-[9px] font-semibold leading-4 text-slate-200">{effect.name}</span></button>)}</div></section>)}
              <div className="h-px bg-white/10" />
              <label className="block text-[9px] font-semibold text-slate-300">Effect intensity · {selectedText.effectIntensity ?? 60}%<input type="range" min="0" max="100" value={selectedText.effectIntensity ?? 60} onChange={event=>updateTextLayer(selectedText.id,{effectIntensity:Number(event.target.value)})} className="mt-2 w-full accent-fuchsia-500" /></label>
              <label className="block text-[9px] font-semibold text-slate-300">Blur / softness · {selectedText.effectBlur ?? 8}<input type="range" min="0" max="40" value={selectedText.effectBlur ?? 8} onChange={event=>updateTextLayer(selectedText.id,{effectBlur:Number(event.target.value)})} className="mt-2 w-full accent-fuchsia-500" /></label>
              <label className="block text-[9px] font-semibold text-slate-300">Shadow distance · {selectedText.effectDistance ?? 4}<input type="range" min="0" max="40" value={selectedText.effectDistance ?? 4} onChange={event=>updateTextLayer(selectedText.id,{effectDistance:Number(event.target.value)})} className="mt-2 w-full accent-fuchsia-500" /></label>
              <label className="block text-[9px] font-semibold text-slate-300">Direction / angle · {selectedText.effectAngle ?? 45}°<input type="range" min="0" max="360" value={selectedText.effectAngle ?? 45} onChange={event=>updateTextLayer(selectedText.id,{effectAngle:Number(event.target.value)})} className="mt-2 w-full accent-fuchsia-500" /></label>
              <div className="grid grid-cols-2 gap-2"><label className="text-[9px] text-slate-400">Effect colour<input aria-label="Effect colour" type="color" value={selectedText.effectColor || '#a855f7'} onChange={event=>updateTextLayer(selectedText.id,{effectColor:event.target.value})} className="mt-1 h-9 w-full cursor-pointer rounded-md border border-white/10 bg-[#080b16] p-1" /></label><label className="text-[9px] text-slate-400">Second colour<input aria-label="Second effect colour" type="color" value={selectedText.effectSecondaryColor || '#22d3ee'} onChange={event=>updateTextLayer(selectedText.id,{effectSecondaryColor:event.target.value})} className="mt-1 h-9 w-full cursor-pointer rounded-md border border-white/10 bg-[#080b16] p-1" /></label></div>
              <button type="button" onClick={()=>updateTextLayer(selectedText.id,{effect:'Simple',effectIntensity:60,effectBlur:8,effectDistance:4,effectAngle:45,effectColor:'#a855f7',effectSecondaryColor:'#22d3ee'})} className="rounded-lg border border-white/10 py-2 text-[9px] font-semibold text-slate-400 hover:bg-white/[0.05]">Reset effect settings</button>
            </>}
          </div>}
          {activePanel === 'animation' && <StudioAnimationPanel search={animationSearch} onSearchChange={setAnimationSearch} selectedText={selectedText} animationSettings={selectedText?.animation || {}} animationMode={selectedAnimation?.mode || 'entrance'} onUpdateAnimationSettings={updateSelectedAnimationSettings} selectedAnimationId={selectedAnimationId} onSelectAnimation={applyTextAnimation} />}
          {activePanel === 'audio' && <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
            <button type="button" onClick={() => audioInput.current?.click()} className="flex h-10 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-[10px] font-bold"><Music2 className="h-4 w-4" /> {audio ? 'Replace audio track' : 'Import audio'}</button>
            {audio ? <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/[0.04] p-3"><div className="flex items-center gap-2"><Music2 className="h-4 w-4 shrink-0 text-cyan-300" /><div className="min-w-0"><p className="truncate text-[10px] font-semibold text-cyan-100">{audio.name}</p><p className="text-[9px] text-cyan-100/50">{formatTime(audio.duration)} duration</p></div></div><label className="mt-4 block text-[9px] text-slate-400">Track volume · {audioVolume}%<input type="range" min="0" max="100" value={audioVolume} onChange={event => setAudioVolume(Number(event.target.value))} className="mt-2 w-full accent-cyan-400" /></label><button type="button" onClick={() => { URL.revokeObjectURL(audio.url); objectUrls.current.delete(audio.url); setAudio(null) }} className="mt-3 w-full rounded-lg border border-red-400/20 py-2 text-[9px] font-semibold text-red-300 hover:bg-red-400/[0.06]">Remove audio track</button></div> : <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center"><Music2 className="mx-auto h-7 w-7 text-slate-600" /><p className="mt-2 text-[10px] font-semibold text-slate-300">No audio track</p><p className="mt-1 text-[9px] text-slate-500">Import a music or audio file to add it to your project.</p></div>}
            <p className="text-[9px] leading-4 text-slate-600">Supported audio files up to 50 MB.</p>
          </div>}
        </aside>

        <section onPointerDown={event => { const target = event.target as HTMLElement; if (!target.closest("[data-text-layer-id], [data-text-toolbar]")) { setSelectedTextId(null); setEditingTextId(null) } }} className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[radial-gradient(ellipse_at_50%_30%,rgba(88,54,160,0.15),transparent_55%),#080a13]">
          <div className="flex h-10 min-h-10 shrink-0 items-center gap-2 overflow-x-auto border-b border-white/[0.07] bg-[#0c0f1c] px-3 md:hidden">
            <button type="button" onClick={() => videoInput.current?.click()} className="shrink-0 rounded-md bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-2 text-[9px] font-bold">Import video</button>
            <button type="button" onClick={() => imageInput.current?.click()} className="shrink-0 rounded-md border border-white/10 px-3 py-2 text-[9px] font-semibold text-slate-200">Add photo</button>
            <button type="button" onClick={() => audioInput.current?.click()} className="shrink-0 rounded-md border border-white/10 px-3 py-2 text-[9px] font-semibold text-slate-200">Add audio</button>
            <button type="button" onClick={() => setActivePanel('text')} className="shrink-0 rounded-md border border-white/10 px-3 py-2 text-[9px] font-semibold text-slate-200">Text</button>
            <button type="button" onClick={() => setActivePanel('audio')} className="shrink-0 rounded-md border border-white/10 px-3 py-2 text-[9px] font-semibold text-slate-200">Audio settings</button>
            <button type="button" onClick={() => setActivePanel('animation')} className={'shrink-0 rounded-md border px-3 py-2 text-[9px] font-semibold '+(activePanel==='animation'?'border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-100':'border-white/10 text-slate-200')}>Animation</button>
          </div>
          {activePanel === 'text' && <div className="grid shrink-0 grid-cols-3 gap-2 border-b border-white/[0.07] bg-[#101426] p-3 md:hidden">
            <button type="button" onClick={() => addTextLayer('heading')} className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-3 text-[10px] font-extrabold text-white">Heading</button>
            <button type="button" onClick={() => addTextLayer('subheading')} className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-3 text-[10px] font-bold text-white">Subheading</button>
            <button type="button" onClick={() => addTextLayer('body')} className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-3 text-[9px] font-medium text-white">Body text</button>
          </div>}
          {activePanel === 'audio' && <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-white/[0.07] bg-[#101426] px-3 py-2 md:hidden">
            {audio ? <><span className="max-w-[140px] truncate text-[9px] text-cyan-100">{audio.name}</span><label className="flex min-w-[120px] flex-1 items-center gap-2 text-[9px] text-slate-400">Volume<input type="range" min="0" max="100" value={audioVolume} onChange={event => setAudioVolume(Number(event.target.value))} className="w-full accent-cyan-400" /></label><button type="button" onClick={() => { URL.revokeObjectURL(audio.url); objectUrls.current.delete(audio.url); setAudio(null) }} className="text-[9px] text-red-300">Remove</button></> : <span className="text-[9px] text-slate-500">No audio track added yet.</span>}
          </div>}
          <div data-text-toolbar="true" className="sticky top-0 z-50 flex min-h-[48px] shrink-0 flex-wrap items-center gap-1.5 overflow-visible border-b border-fuchsia-400/20 bg-[#111629] px-3 py-2 shadow-xl sm:px-5" role="toolbar" aria-label="Selected text formatting">
            {selectedText && <>
            <button type="button" onClick={() => removeTextLayer(selectedText.id)} title="Delete text" aria-label="Delete text" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-red-300 transition hover:bg-red-400/10"><Trash2 className="h-4 w-4" /></button>
            <button type="button" onClick={() => duplicateTextLayer(selectedText.id)} title="Duplicate text" aria-label="Duplicate text" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-200 transition hover:bg-white/10"><Copy className="h-4 w-4" /></button>
            <div className="relative shrink-0">
              <button type="button" onClick={async () => {
                const opening = !fontMenuOpen
                setFontMenuOpen(opening)
                if (opening && fontCatalog.length === 0 && !fontCatalogLoading) {
                  setFontCatalogLoading(true)
                  setFontCatalogError('')
                  try {
                    const response = await fetch('/api/studio/fonts')
                    const data = await response.json() as { fonts?: FontOption[]; error?: string }
                    if (!response.ok || !Array.isArray(data.fonts) || data.fonts.length < 1000) throw new Error(data.error || 'The font catalogue could not be loaded.')
                    setFontCatalog(data.fonts)
                  } catch (cause) {
                    setFontCatalogError(cause instanceof Error ? cause.message : 'The font catalogue could not be loaded.')
                  } finally { setFontCatalogLoading(false) }
                }
              }} title="Choose font" aria-label="Choose font" aria-expanded={fontMenuOpen} className="flex h-8 max-w-[150px] items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-[10px] font-semibold text-slate-100 transition hover:bg-white/10">
                <Type className="h-3.5 w-3.5 shrink-0 text-fuchsia-300" /><span className="max-w-[105px] truncate">{selectedText.fontFamily || 'Default'}</span><ChevronDown className="h-3 w-3 shrink-0" />
              </button>
              {fontMenuOpen && <div className="absolute left-0 top-10 z-[80] flex w-[min(300px,80vw)] max-h-[min(420px,65vh)] flex-col overflow-hidden rounded-xl border border-white/15 bg-[#111629] p-2 shadow-2xl">
                <div className="mb-2 flex items-center gap-2 rounded-lg border border-white/10 bg-[#080c18] px-2">
                  <Search className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  <input value={fontSearch} onChange={event => setFontSearch(event.target.value)} placeholder="Search fonts" aria-label="Search fonts" className="h-9 min-w-0 flex-1 bg-transparent text-[11px] text-white outline-none placeholder:text-slate-500" />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  <button type="button" onClick={() => { updateTextLayer(selectedText.id, { fontFamily: 'Default' }); setFontMenuOpen(false); setFontSearch('') }} className={'mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[11px] transition hover:bg-white/10 ' + ((!selectedText.fontFamily || selectedText.fontFamily === 'Default') ? 'bg-fuchsia-500/15 text-fuchsia-100' : 'text-slate-200')}>
                    <span>Default</span><span className="text-[9px] text-slate-500">Simple</span>
                  </button>
                  {fontCatalogLoading && <p className="px-3 py-5 text-center text-[10px] text-slate-400">Loading Google Fonts…</p>}
                  {fontCatalogError && <p className="px-3 py-4 text-center text-[10px] text-rose-300">{fontCatalogError}</p>}
                  {!fontCatalogLoading && fontCatalog.filter(font => font.family.toLowerCase().includes(fontSearch.trim().toLowerCase())).map(font => <button key={font.family} type="button" onMouseEnter={() => { void loadGoogleFont(font.family) }} onFocus={() => { void loadGoogleFont(font.family) }} onClick={async () => { await loadGoogleFont(font.family); updateTextLayer(selectedText.id, { fontFamily: font.family }); setFontMenuOpen(false); setFontSearch('') }} style={{ fontFamily: '"' + font.family.replace(/["\\\\]/g, '') + '", sans-serif' }} className={'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[11px] transition hover:bg-white/10 ' + (selectedText.fontFamily === font.family ? 'bg-fuchsia-500/15 text-fuchsia-100' : 'text-slate-200')}>
                    <span className="truncate">{font.family}</span><span className="shrink-0 font-sans text-[8px] capitalize text-slate-500">{font.category}</span>
                  </button>)}
                  {!fontCatalogLoading && !fontCatalogError && fontCatalog.length > 0 && fontCatalog.filter(font => font.family.toLowerCase().includes(fontSearch.trim().toLowerCase())).length === 0 && <p className="px-3 py-5 text-center text-[10px] text-slate-500">No fonts found.</p>}
                </div>
              </div>}
            </div>
            <span className="mx-1 h-6 w-px shrink-0 bg-white/10" />
            <div className="relative shrink-0">
              <button type="button" onClick={() => setTransparencyMenuOpen(value => !value)} aria-label="Transparency" aria-expanded={transparencyMenuOpen} title="Transparency" className={'flex h-8 w-8 items-center justify-center rounded-lg transition ' + (transparencyMenuOpen ? 'bg-fuchsia-500/20 text-fuchsia-200 ring-1 ring-fuchsia-400/30' : 'text-slate-200 hover:bg-white/10')}>
                <svg viewBox="0 0 20 20" aria-hidden="true" className="h-[17px] w-[17px]" fill="currentColor"><path d="M2 2h4v4H2zM10 2h4v4h-4zM6 6h4v4H6zM14 6h4v4h-4zM2 10h4v4H2zM10 10h4v4h-4zM6 14h4v4H6zM14 14h4v4h-4z" opacity=".9"/><path d="M6 2h4v4H6zM14 2h4v4h-4zM2 6h4v4H2zM10 6h4v4h-4zM6 10h4v4H6zM14 10h4v4h-4zM2 14h4v4H2zM10 14h4v4h-4z" opacity=".35"/></svg>
              </button>
              {transparencyMenuOpen && <div className="absolute left-0 top-10 z-[85] w-[220px] rounded-xl border border-white/15 bg-[#111629] p-3 shadow-2xl">
                <div className="mb-3 flex items-center justify-between"><span className="text-[11px] font-semibold text-slate-100">Transparency</span><span className="rounded-md bg-white/[0.07] px-2 py-1 text-[10px] font-semibold tabular-nums text-fuchsia-200">{Math.round(selectedText.opacity ?? 100)}%</span></div>
                <input aria-label="Text transparency" type="range" min="0" max="100" step="1" value={selectedText.opacity ?? 100} onChange={event => updateTextLayer(selectedText.id, { opacity: Number(event.target.value) })} className="w-full cursor-pointer accent-fuchsia-500" />
                <div className="mt-1 flex justify-between text-[9px] text-slate-500"><span>0%</span><span>100%</span></div>
              </div>}
            </div>
            <label title="Text color" className="relative flex h-8 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-100 transition hover:bg-white/10"><Palette className="h-4 w-4" /><span className="absolute bottom-1 left-2 right-2 h-1 rounded-full" style={{ backgroundColor: selectedText.color }} /><input aria-label="Text color" type="color" value={selectedText.color} onChange={event => updateTextLayer(selectedText.id,{color:event.target.value})} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" /></label>
            <button type="button" onClick={() => { setActivePanel('effects'); setFontMenuOpen(false); setTransparencyMenuOpen(false) }} aria-label="Text effects" title="Text effects" className={'flex h-8 items-center gap-1.5 rounded-lg border px-2 text-[10px] font-semibold transition '+(activePanel==='effects'?'border-fuchsia-400/50 bg-fuchsia-500/15 text-fuchsia-100':'border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/10')}><span className="text-sm">✧</span> Effects</button>
            <button type="button" onClick={() => { setActivePanel('animation'); setFontMenuOpen(false); setTransparencyMenuOpen(false) }} aria-label="Text animations" title="Text animations" className={'flex h-8 items-center gap-1.5 rounded-lg border px-2 text-[10px] font-semibold transition '+(activePanel==='animation'?'border-fuchsia-400/50 bg-fuchsia-500/15 text-fuchsia-100':'border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/10')}><Sparkles className="h-3.5 w-3.5" /> Animation</button>
            <span className="mx-1 h-6 w-px shrink-0 bg-white/10" />
            <span className="mx-1 h-6 w-px shrink-0 bg-white/10" />
            <button type="button" onClick={() => updateTextLayer(selectedText.id,{bold:!selectedText.bold})} aria-label="Bold" aria-pressed={selectedText.bold} title="Bold" className={'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ' + (selectedText.bold ? 'bg-fuchsia-500/20 text-fuchsia-200 ring-1 ring-fuchsia-400/30' : 'text-slate-200 hover:bg-white/10')}><Bold className="h-4 w-4" /></button>
            <button type="button" onClick={() => updateTextLayer(selectedText.id,{italic:!selectedText.italic})} aria-label="Italic" aria-pressed={selectedText.italic} title="Italic" className={'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ' + (selectedText.italic ? 'bg-fuchsia-500/20 text-fuchsia-200 ring-1 ring-fuchsia-400/30' : 'text-slate-200 hover:bg-white/10')}><Italic className="h-4 w-4" /></button>
            <button type="button" onClick={() => updateTextLayer(selectedText.id,{underline:!selectedText.underline})} aria-label="Underline" aria-pressed={selectedText.underline} title="Underline" className={'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ' + (selectedText.underline ? 'bg-fuchsia-500/20 text-fuchsia-200 ring-1 ring-fuchsia-400/30' : 'text-slate-200 hover:bg-white/10')}><Underline className="h-4 w-4" /></button>
            <button type="button" onClick={() => updateTextLayer(selectedText.id,{strikethrough:!selectedText.strikethrough})} aria-label="Strikethrough" aria-pressed={!!selectedText.strikethrough} title="Strikethrough" className={'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ' + (selectedText.strikethrough ? 'bg-fuchsia-500/20 text-fuchsia-200 ring-1 ring-fuchsia-400/30' : 'text-slate-200 hover:bg-white/10')}><Strikethrough className="h-4 w-4" /></button>
            <button type="button" onClick={() => updateTextLayer(selectedText.id,{uppercase:!selectedText.uppercase})} aria-label="Uppercase" aria-pressed={!!selectedText.uppercase} title="Uppercase" className={'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ' + (selectedText.uppercase ? 'bg-fuchsia-500/20 text-fuchsia-200 ring-1 ring-fuchsia-400/30' : 'text-slate-200 hover:bg-white/10')}><CaseUpper className="h-4 w-4" /></button>
            <span className="mx-1 h-6 w-px shrink-0 bg-white/10" />
            <button type="button" onClick={() => updateTextLayer(selectedText.id,{listStyle:selectedText.listStyle === 'bullet' ? 'none' : 'bullet'})} aria-label="Bullet list" aria-pressed={selectedText.listStyle === 'bullet'} title="Bullet list" className={'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ' + (selectedText.listStyle === 'bullet' ? 'bg-fuchsia-500/20 text-fuchsia-200 ring-1 ring-fuchsia-400/30' : 'text-slate-200 hover:bg-white/10')}><List className="h-4 w-4" /></button>
            <button type="button" onClick={() => updateTextLayer(selectedText.id,{listStyle:selectedText.listStyle === 'number' ? 'none' : 'number'})} aria-label="Numbered list" aria-pressed={selectedText.listStyle === 'number'} title="Numbered list" className={'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ' + (selectedText.listStyle === 'number' ? 'bg-fuchsia-500/20 text-fuchsia-200 ring-1 ring-fuchsia-400/30' : 'text-slate-200 hover:bg-white/10')}><ListOrdered className="h-4 w-4" /></button>
            </>}
          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3 sm:p-5">
            <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-xl border border-white/[0.07] bg-[#05060d] shadow-[0_20px_70px_rgba(0,0,0,0.42)]">
              <div ref={canvasRef} onPointerDown={event => { const target = event.target as HTMLElement; if (!target.closest("[data-text-layer-id], [data-text-toolbar]")) { setSelectedTextId(null); setEditingTextId(null) } }} className={'relative flex max-h-full max-w-full items-center justify-center overflow-hidden rounded-md bg-black ring-1 ring-violet-400/20 ' + (aspect === '9:16' ? 'h-full aspect-[9/16]' : aspect === '16:9' ? 'w-full max-w-5xl aspect-video' : 'h-full aspect-square')} style={{ maxHeight: 'min(72dvh, 720px)' }}>
                {activeTimelineClip?.kind === 'video' ? <video key={activeTimelineClip.id} ref={previewRef} src={activeTimelineClip.url} playsInline preload="auto" className="h-full w-full object-contain" /> : activeTimelineClip?.kind === 'image' ? <img src={activeTimelineClip.url} alt={activeTimelineClip.name} className="h-full w-full object-contain" /> : <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center"><Clapperboard className="h-10 w-10 text-violet-400/60" /><p className="text-sm font-semibold text-slate-300">{clips.length ? 'Timeline gap' : 'Your video canvas'}</p><p className="max-w-xs text-[10px] leading-4 text-slate-500">{clips.length ? 'No media clip is placed at this point in the timeline.' : 'Import a video or photo to start editing your project.'}</p>{!clips.length && <button type="button" onClick={() => videoInput.current?.click()} className="rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-[10px] font-bold"><Plus className="mr-1 inline h-3 w-3" /> Import video</button>}</div>}
                {audio && <audio ref={audioRef} src={audio.url} preload="metadata" />}
                {textLayers.filter(layer => (playhead >= layer.timelineStart && playhead < layer.timelineStart + layer.timelineDuration) || (isAnimationPreviewing && selectedTextId === layer.id)).map(layer => { const layerTimelineTime = isAnimationPreviewing && selectedTextId === layer.id ? animationPreviewStartSeconds + animationPreviewTime / 1000 : playhead; return <div key={layer.id} data-text-layer-id={layer.id} onPointerDown={event => { if (event.target === event.currentTarget) beginTextDrag(event,layer,'move') }} onPointerMove={moveTextPointer} onPointerUp={endTextPointer} onPointerCancel={endTextPointer} onClick={event => { event.stopPropagation(); setSelectedTextId(layer.id) }} className={'absolute z-20 min-h-[28px] rounded-sm px-1 py-0.5 outline-none ' + (selectedTextId === layer.id ? 'border border-dashed border-fuchsia-400 shadow-[0_0_0_1px_rgba(217,70,239,.15)]' : 'border border-transparent hover:border-white/40')} style={{ left: layer.x + '%', top: layer.y + '%', width: layer.width + '%', color: layer.color, fontSize: layer.fontSize + 'px', fontFamily: layer.fontFamily && layer.fontFamily !== 'Default' ? '"' + layer.fontFamily + '", sans-serif' : 'Arial, Helvetica, sans-serif', fontWeight: layer.bold ? 700 : 400, fontStyle: layer.italic ? 'italic' : 'normal', textDecoration: layer.underline && layer.strikethrough ? 'underline line-through' : layer.underline ? 'underline' : layer.strikethrough ? 'line-through' : 'none', textAlign: layer.align, lineHeight: 1.15, cursor: editingTextId === layer.id ? 'text' : 'move', overflowWrap: 'anywhere', transform: (() => { const sample = getLayerAnimationSample(layer, layerTimelineTime); return sample ? (sample.perspective > 0 ? 'perspective(' + sample.perspective + 'px) ' : '') + 'rotateX(' + sample.rotateX + 'deg) rotateY(' + sample.rotateY + 'deg) translate(' + sample.translateX + 'px, ' + sample.translateY + 'px) scale(' + sample.scaleX + ', ' + sample.scaleY + ') rotate(' + (layer.rotation + sample.rotate) + 'deg) skew(' + sample.skewX + 'deg, ' + sample.skewY + 'deg)' : 'rotate(' + layer.rotation + 'deg)' })(), filter: (() => { const sample = getLayerAnimationSample(layer, layerTimelineTime); return sample?.blur ? 'blur(' + sample.blur + 'px)' : undefined })(), transformOrigin: 'center center', transformStyle: 'preserve-3d', backfaceVisibility: 'hidden', opacity: (() => { const sample = getLayerAnimationSample(layer, layerTimelineTime); return sample ? sample.opacity : 1 })() }}>
                  <div dir="auto" contentEditable={editingTextId === layer.id} suppressContentEditableWarning onClick={event => { event.stopPropagation(); setSelectedTextId(layer.id); if (editingTextId !== layer.id) { const node = event.currentTarget; setEditingTextId(layer.id); window.requestAnimationFrame(() => { node.focus(); const selection = window.getSelection(); const range = document.createRange(); range.selectNodeContents(node); range.collapse(false); selection?.removeAllRanges(); selection?.addRange(range) }) } }} onInput={event => { textDrafts.current.set(layer.id, event.currentTarget.innerText.split(/\n/).map(line => layer.listStyle === 'bullet' ? line.replace(/^•\s?/, '') : layer.listStyle === 'number' ? line.replace(/^\d+\\.\s?/, '') : line).join('\n')) }} onBlur={event => { const value = textDrafts.current.get(layer.id); if (value !== undefined) { updateTextLayer(layer.id,{text:value}); textDrafts.current.delete(layer.id) } setEditingTextId(current => current === layer.id ? null : current) }} onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.blur() } }} className="inline-block min-h-[24px] max-w-full whitespace-pre-wrap break-words outline-none" style={{ display:'inline-block', width:'fit-content', maxWidth:'100%', opacity: (layer.opacity ?? 100) / 100 }}><span style={{ display:'inline-block', maxWidth:'100%', whiteSpace:'pre-wrap', verticalAlign:'top', backgroundSize:'100% 100%', backgroundPosition:'center', color:layer.color, ...getTextEffectStyle(layer.effect, layer.effectIntensity ?? 60, layer.effectColor || '#a855f7', layer.effectSecondaryColor || '#22d3ee', layer.effectBlur ?? 8, layer.effectDistance ?? 4, layer.effectAngle ?? 45) }}>{editingTextId === layer.id ? getFormattedText(layer) : getAnimatedTextContent(layer, layerTimelineTime)}</span></div>
                  {selectedTextId === layer.id && <>
                    <button type="button" aria-label="Move text" title="Drag to move" onPointerDown={event => beginTextDrag(event,layer,'move')} onPointerMove={moveTextPointer} onPointerUp={endTextPointer} onPointerCancel={endTextPointer} className="absolute -top-7 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full border border-white bg-slate-900 text-[11px] text-white shadow-md cursor-move touch-none">✥</button>
                    <button type="button" aria-label="Rotate text" title="Drag to rotate" onPointerDown={event => beginTextDrag(event,layer,'rotate')} onPointerMove={moveTextPointer} onPointerUp={endTextPointer} onPointerCancel={endTextPointer} className="absolute -bottom-7 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full border border-white bg-slate-900 text-[12px] text-white shadow-md cursor-grab touch-none">↻</button>
                    <button type="button" aria-label="Resize text" title="Drag to resize" onPointerDown={event => beginTextDrag(event,layer,'resize')} onPointerMove={moveTextPointer} onPointerUp={endTextPointer} onPointerCancel={endTextPointer} className="absolute -bottom-2 -right-2 h-4 w-4 rounded-full border-2 border-white bg-fuchsia-500 shadow-md cursor-nwse-resize touch-none" />
                  </>}
                </div>})}
                <div className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-1 text-[9px] tabular-nums text-white">{formatTime(playhead)} / {formatTime(projectEnd)}</div>
              </div>
            </div>
          </div>

          <div className="flex h-[38px] min-h-[38px] shrink-0 items-center justify-between border-t border-white/[0.07] bg-[#0c0f1c]/90 px-3 sm:px-5">
            <div className="flex items-center gap-2 text-[9px] text-slate-400"><Volume2 className="h-3.5 w-3.5" /><span className="hidden sm:inline">Preview volume</span><input aria-label="Preview volume" type="range" min="0" max="100" value={volume} onChange={event => setVolume(Number(event.target.value))} className="w-16 accent-fuchsia-500 sm:w-24" /><button type="button" onClick={() => setMuted(value => !value)} aria-label={muted ? 'Unmute preview' : 'Mute preview'} className="rounded p-1 text-slate-400 hover:bg-white/10">{muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}</button></div>
            <div className="flex items-center gap-3 text-[9px] tabular-nums text-slate-500"><span>{clips.length} clips</span><span>{formatTime(totalDuration)}</span></div>
          </div>

          <section className="z-10 shrink-0 border-t border-white/[0.09] bg-[#0b0e1a] px-2 pb-[calc(8px+env(safe-area-inset-bottom))] pt-2 sm:px-4">
            <div className="mb-2 flex items-center justify-between gap-2"><div className="flex items-center gap-2"><AudioLines className="h-3.5 w-3.5 text-fuchsia-300" /><h2 className="text-[10px] font-bold text-slate-200">Timeline</h2><span className="hidden text-[9px] text-slate-600 sm:inline">Full-length editing range · drag strips to move, drag edges to trim</span></div><div className="flex items-center gap-3"><span className="text-[9px] tabular-nums text-slate-500">{formatTime(playhead)} / {formatTime(projectEnd)}</span><button type="button" onClick={() => void togglePlayback()} disabled={!clips.length} aria-label={playing ? 'Pause timeline' : 'Play timeline'} className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md shadow-violet-950/40 disabled:opacity-30">{playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</button></div></div>
            <div className="overflow-x-auto overscroll-x-contain rounded-md">
              <div className="relative" style={{ width: timelineWidth + 72 }}>
                <div className="flex h-6 items-end border-b border-white/10">
                  <div className="w-[72px] shrink-0" />
                  <div className="relative h-full cursor-crosshair" style={{ width: timelineWidth }} onPointerDown={seekTimeline}>
                    {Array.from({ length: Math.floor(timelineSeconds / 5) + 1 }, (_, index) => <div key={index} className="absolute bottom-0 h-3 border-l border-white/20 pl-1 text-[8px] tabular-nums text-slate-500 pointer-events-none" style={{ left: index * 5 * TIMELINE_PX_PER_SECOND }}>{formatTime(index * 5)}</div>)}
                  </div>
                </div>
                {[
                  { key: 'text', label: 'Text', icon: <Type className="h-3 w-3" />, tone: 'fuchsia' },
                  { key: 'image', label: 'Image', icon: <ImagePlus className="h-3 w-3" />, tone: 'sky' },
                  { key: 'video', label: 'Video', icon: <Video className="h-3 w-3" />, tone: 'violet' },
                  { key: 'audio', label: 'Audio', icon: <Music2 className="h-3 w-3" />, tone: 'emerald' },
                ].map(track => <div key={track.key} className="flex min-h-[34px] border-b border-white/[0.045]">
                  <div className={'flex w-[72px] shrink-0 items-center gap-1.5 border-r px-2 text-[9px] font-semibold ' + (track.tone === 'fuchsia' ? 'border-fuchsia-400/10 bg-[#21152b] text-fuchsia-100' : track.tone === 'sky' ? 'border-sky-400/10 bg-[#10212b] text-sky-100' : track.tone === 'violet' ? 'border-violet-400/10 bg-[#1b1830] text-violet-100' : 'border-emerald-400/10 bg-[#10271f] text-emerald-100')}>{track.icon}{track.label}</div>
                  <div className="relative min-h-[34px] shrink-0 cursor-crosshair" style={{ width: timelineWidth, height: track.key === 'text' ? Math.max(34, textLayers.length * 30 + 4) : 34 }} onPointerDown={seekTimeline}>
                    {track.key === 'text' && textLayers.map(layer => <div key={layer.id} onPointerDown={event => beginTimelineDrag(event,'text',layer.id,'move')} onPointerMove={moveTimelineDrag} onPointerUp={endTimelineDrag} onPointerCancel={endTimelineDrag} onClick={() => { setSelectedTextId(layer.id); setActivePanel('text') }} title={layer.text + (layer.animation?.animationId ? ' · ' + (STUDIO_TEXT_ANIMATION_BY_ID.get(layer.animation.animationId)?.name || 'Animation') : '')} data-animation-id={layer.animation?.animationId || undefined} className={'absolute flex h-[22px] min-w-[12px] items-center overflow-visible rounded bg-gradient-to-r from-violet-600 to-fuchsia-600 text-[8px] font-semibold text-white shadow-sm cursor-grab touch-none ' + (selectedTextId === layer.id ? 'ring-1 ring-fuchsia-200' : '')} style={{ top: 6 + textLayers.findIndex(item => item.id === layer.id) * 30, left: layer.timelineStart * TIMELINE_PX_PER_SECOND, width: Math.max(12, layer.timelineDuration * TIMELINE_PX_PER_SECOND) }}>
                      <span onPointerDown={event => beginTimelineDrag(event,'text',layer.id,'left')} onPointerMove={moveTimelineDrag} onPointerUp={endTimelineDrag} onPointerCancel={endTimelineDrag} className="absolute -left-0.5 top-0 z-10 h-full w-2 cursor-ew-resize rounded-l bg-white/30" />
                      <span className="flex min-w-0 flex-1 items-center gap-1 truncate px-2"><span className="truncate">{layer.text || 'Untitled text'}</span>{layer.animation?.animationId && <span className="shrink-0 rounded bg-black/20 px-1 py-0.5 text-[7px] font-bold text-fuchsia-100" title={STUDIO_TEXT_ANIMATION_BY_ID.get(layer.animation.animationId)?.name || 'Text animation'}>{STUDIO_TEXT_ANIMATION_BY_ID.get(layer.animation.animationId)?.name || 'Animated'}</span>}</span>
                      <span onPointerDown={event => beginTimelineDrag(event,'text',layer.id,'right')} onPointerMove={moveTimelineDrag} onPointerUp={endTimelineDrag} onPointerCancel={endTimelineDrag} className="absolute -right-0.5 top-0 z-10 h-full w-2 cursor-ew-resize rounded-r bg-white/30" />
                    </div>)}
                    {(track.key === 'image' || track.key === 'video') && clips.filter(item => item.kind === track.key).map((clip, index) => <div key={clip.id} onPointerDown={event => beginTimelineDrag(event,'clip',clip.id,'move')} onPointerMove={moveTimelineDrag} onPointerUp={endTimelineDrag} onPointerCancel={endTimelineDrag} onClick={() => setSelectedId(clip.id)} title={clip.name} className={'absolute top-[6px] flex h-[22px] min-w-[14px] items-center overflow-visible rounded text-[8px] font-semibold cursor-grab touch-none ' + (track.key === 'image' ? 'bg-sky-500/35 text-sky-100' : 'bg-violet-500/40 text-violet-100') + (selected?.id === clip.id ? ' ring-1 ring-white/70' : '')} style={{ left: clip.timelineStart * TIMELINE_PX_PER_SECOND, width: Math.max(14, (clip.trimEnd - clip.trimStart) * TIMELINE_PX_PER_SECOND) }}>
                      <span onPointerDown={event => beginTimelineDrag(event,'clip',clip.id,'left')} onPointerMove={moveTimelineDrag} onPointerUp={endTimelineDrag} onPointerCancel={endTimelineDrag} className="absolute -left-0.5 top-0 z-10 h-full w-2 cursor-ew-resize rounded-l bg-white/35" />
                      <span className="min-w-0 flex-1 truncate px-2">{index + 1}. {clip.name}</span>
                      <span onPointerDown={event => beginTimelineDrag(event,'clip',clip.id,'right')} onPointerMove={moveTimelineDrag} onPointerUp={endTimelineDrag} onPointerCancel={endTimelineDrag} className="absolute -right-0.5 top-0 z-10 h-full w-2 cursor-ew-resize rounded-r bg-white/35" />
                    </div>)}
                    {track.key === 'audio' && audio && <div onPointerDown={event => beginTimelineDrag(event,'audio',audio.id,'move')} onPointerMove={moveTimelineDrag} onPointerUp={endTimelineDrag} onPointerCancel={endTimelineDrag} title={audio.name} className="absolute top-[6px] flex h-[22px] min-w-[14px] items-center overflow-visible rounded bg-emerald-500/30 text-[8px] font-semibold text-emerald-100 cursor-grab touch-none" style={{ left: audio.timelineStart * TIMELINE_PX_PER_SECOND, width: Math.max(14, (audio.trimEnd - audio.trimStart) * TIMELINE_PX_PER_SECOND) }}>
                      <span onPointerDown={event => beginTimelineDrag(event,'audio',audio.id,'left')} onPointerMove={moveTimelineDrag} onPointerUp={endTimelineDrag} onPointerCancel={endTimelineDrag} className="absolute -left-0.5 top-0 z-10 h-full w-2 cursor-ew-resize rounded-l bg-white/35" />
                      <span className="min-w-0 flex-1 truncate px-2">{audio.name}</span>
                      <span onPointerDown={event => beginTimelineDrag(event,'audio',audio.id,'right')} onPointerMove={moveTimelineDrag} onPointerUp={endTimelineDrag} onPointerCancel={endTimelineDrag} className="absolute -right-0.5 top-0 z-10 h-full w-2 cursor-ew-resize rounded-r bg-white/35" />
                    </div>}
                    {((track.key === 'text' && !textLayers.length) || (track.key === 'image' && !clips.some(item => item.kind === 'image')) || (track.key === 'video' && !clips.some(item => item.kind === 'video')) || (track.key === 'audio' && !audio)) && <span className="absolute left-2 top-[11px] text-[8px] text-slate-600">+ Add {track.key === 'text' ? 'text' : track.key === 'audio' ? 'audio' : track.key}</span>}
                  </div>
                </div>)}
                <div className="pointer-events-none absolute bottom-0 top-6 z-30 border-l-2 border-rose-400 shadow-[0_0_8px_rgba(251,113,133,.65)]" style={{ left: 72 + playhead * TIMELINE_PX_PER_SECOND }}><div className="-ml-[5px] -mt-1 h-2.5 w-2.5 rounded-full bg-rose-400 shadow" /></div>
              </div>
            </div>
          </section>
        </section>

        <aside className="hidden w-[280px] shrink-0 flex-col overflow-y-auto border-l border-white/[0.08] bg-[#0d1020] xl:flex">
          <div className="flex h-[48px] min-h-[48px] items-center border-b border-white/[0.07] px-4"><span className="border-b-2 border-fuchsia-500 py-4 text-[11px] font-bold text-white">Design</span><span className="ml-4 text-[10px] text-slate-600">Properties</span></div>
          <div className="space-y-4 p-4">
            <section><div className="mb-2 flex items-center justify-between"><h3 className="text-[10px] font-bold text-slate-200">Canvas</h3><span className="text-[9px] text-slate-600">Aspect ratio</span></div><div className="grid grid-cols-3 gap-1.5">{(['9:16','16:9','1:1'] as const).map(item => <button key={item} type="button" onClick={() => { setAspect(item); setExportWidth(item === '9:16' ? 1080 : item === '16:9' ? 1920 : 1080); setExportHeight(item === '9:16' ? 1920 : 1080) }} className={'h-9 rounded-lg border text-[9px] font-semibold transition ' + (aspect === item ? 'border-fuchsia-400/50 bg-fuchsia-500/10 text-fuchsia-200' : 'border-white/10 bg-white/[0.025] text-slate-400 hover:bg-white/[0.06]')}>{item}</button>)}</div></section>
            <div className="h-px bg-white/[0.07]" />
            <section><div className="mb-2 flex items-center justify-between"><h3 className="text-[10px] font-bold text-slate-200">Selected clip</h3><span className="text-[9px] text-slate-600">{selected ? selected.kind : 'None'}</span></div>{selected ? <><p className="truncate text-[10px] text-slate-400">{selected.name}</p><label className="mt-3 block text-[9px] text-slate-400">Trim start · {formatTime(selected.trimStart)}<input aria-label="Trim start" type="range" min="0" max={Math.max(0,selected.trimEnd-0.25)} step="0.1" value={selected.trimStart} onChange={event => updateClip(selected.id,{trimStart:Math.min(Number(event.target.value),selected.trimEnd-0.1)})} className="mt-2 w-full accent-fuchsia-500" /></label><label className="mt-3 block text-[9px] text-slate-400">Trim end · {formatTime(selected.trimEnd)}<input aria-label="Trim end" type="range" min={Math.min(selected.duration,selected.trimStart+0.1)} max={selected.duration} step="0.1" value={selected.trimEnd} onChange={event => updateClip(selected.id,{trimEnd:Math.max(Number(event.target.value),selected.trimStart+0.1)})} className="mt-2 w-full accent-fuchsia-500" /></label><button type="button" onClick={() => removeClip(selected.id)} className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-red-400/20 text-[9px] font-semibold text-red-300 hover:bg-red-400/[0.06]"><Trash2 className="h-3.5 w-3.5" /> Remove selected clip</button></> : <p className="text-[9px] leading-4 text-slate-600">Select a clip from the media list or timeline to edit its trim points.</p>}</section>
            <div className="h-px bg-white/[0.07]" />
            <section><div className="mb-2 flex items-center justify-between"><h3 className="text-[10px] font-bold text-slate-200">Text overlay</h3><button type="button" onClick={() => { setShowTitle(value => !value); setActivePanel('text') }} className="text-[9px] text-fuchsia-300">{showTitle ? 'Hide' : 'Show'}</button></div><p className="text-[9px] text-slate-500">{showTitle ? 'Text is visible on the canvas.' : 'Text overlay is currently hidden.'}</p><button type="button" onClick={() => setActivePanel('text')} className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.03] py-2 text-[9px] font-semibold text-slate-300 hover:bg-white/[0.07]">Edit headline and message</button></section>
            <div className="h-px bg-white/[0.07]" />
            <section><div className="mb-2 flex items-center justify-between"><h3 className="text-[10px] font-bold text-slate-200">Audio</h3><span className="text-[9px] text-slate-600">{audio ? 'Added' : 'Empty'}</span></div>{audio ? <><p className="truncate text-[9px] text-slate-400">{audio.name}</p><label className="mt-2 block text-[9px] text-slate-400">Track volume · {audioVolume}%<input type="range" min="0" max="100" value={audioVolume} onChange={event => setAudioVolume(Number(event.target.value))} className="mt-2 w-full accent-emerald-400" /></label></> : <button type="button" onClick={() => audioInput.current?.click()} className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-2 text-[9px] font-semibold text-slate-300 hover:bg-white/[0.07]">Import audio</button>}</section>
            <div className="h-px bg-white/[0.07]" />
            <section><h3 className="mb-2 text-[10px] font-bold text-slate-200">Export size</h3><div className="grid grid-cols-2 gap-2"><label className="text-[9px] text-slate-500">Width<input type="number" min="240" max="1920" value={exportWidth} onChange={event => setExportWidth(Math.min(1920,Math.max(240,Number(event.target.value)||240)))} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-[#080b16] px-2 text-[10px] text-white" /></label><label className="text-[9px] text-slate-500">Height<input type="number" min="240" max="1920" value={exportHeight} onChange={event => setExportHeight(Math.min(1920,Math.max(240,Number(event.target.value)||240)))} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-[#080b16] px-2 text-[10px] text-white" /></label></div></section>
          </div>
        </aside>
      </div>

      {activePanel === 'animation' && <div className="fixed inset-x-3 bottom-[calc(12px+env(safe-area-inset-bottom))] top-[calc(58px+env(safe-area-inset-top))] z-[90] flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d1020] shadow-2xl lg:hidden"><div className="flex h-11 shrink-0 items-center justify-between border-b border-white/[0.07] px-3"><span className="text-[11px] font-bold text-white">Text animations</span><button type="button" onClick={() => setActivePanel('text')} aria-label="Close animation panel" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10"><X className="h-4 w-4" /></button></div><StudioAnimationPanel search={animationSearch} onSearchChange={setAnimationSearch} selectedText={selectedText} animationSettings={selectedText?.animation || {}} animationMode={selectedAnimation?.mode || 'entrance'} onUpdateAnimationSettings={updateSelectedAnimationSettings} selectedAnimationId={selectedAnimationId} onSelectAnimation={(id) => { applyTextAnimation(id); setActivePanel('text') }} /></div>}

      <input ref={videoInput} type="file" accept="video/*" multiple className="hidden" onChange={event => { void addMedia(event.target.files,'video'); event.currentTarget.value = '' }} />
      <input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" multiple className="hidden" onChange={event => { void addMedia(event.target.files,'image'); event.currentTarget.value = '' }} />
      <input ref={audioInput} type="file" accept="audio/*" className="hidden" onChange={event => { void addAudio(event.target.files?.[0]); event.currentTarget.value = '' }} />

      {exporting && <div className="fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-1/2 z-[100] w-[min(92vw,520px)] -translate-x-1/2 rounded-xl border border-violet-300/20 bg-[#171b2d] p-3 shadow-2xl"><div className="mb-2 flex justify-between text-[10px] text-slate-300"><span>Rendering your video</span><span>{exportProgress}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-pink-500 transition-[width]" style={{ width: exportProgress + '%' }} /></div><p className="mt-2 text-[9px] text-slate-500">Keep this tab open until the export finishes.</p></div>}
      {(error || notice) && <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-[100] w-[min(92vw,520px)] -translate-x-1/2 rounded-xl border border-white/10 bg-[#171b2d] px-4 py-3 text-xs shadow-2xl" role={error ? 'alert' : 'status'}><div className="flex items-start gap-2"><span className={error ? 'text-red-300' : 'text-emerald-300'}>{error || notice}</span><button type="button" onClick={() => { setError(''); setNotice('') }} className="ml-auto text-slate-400" aria-label="Dismiss message"><X className="h-4 w-4" /></button></div></div>}
    </main>
  )
}

function DownloadIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-none stroke-current stroke-[2]"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v3h16v-3" strokeLinecap="round" strokeLinejoin="round" /></svg>
}