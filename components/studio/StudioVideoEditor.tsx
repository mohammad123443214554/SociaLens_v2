'use client'

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createStudioAssetUrl, loadStudioProject, saveStudioProject, uploadStudioAsset } from '@/lib/studio/persistence'
import {
  ArrowLeft, AudioLines, Check, ChevronLeft, ChevronRight, Clapperboard,
  FolderOpen, ImagePlus, Music2, Pause, Play, Plus, Trash2, Type, Video,
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
  fileSize: number
  storagePath?: string
}
type AudioTrack = { id: string; name: string; url: string; duration: number; fileSize: number; storagePath?: string }
type TextLayer = { id: string; kind: 'heading' | 'subheading' | 'body'; text: string; x: number; y: number; width: number; fontSize: number; color: string; bold: boolean; italic: boolean; underline: boolean; align: 'left' | 'center' | 'right' }
type TextDrag = { id: string; pointerId: number; mode: 'move' | 'resize'; startX: number; startY: number; originX: number; originY: number; originWidth: number; originFontSize: number }

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
  const [aspect, setAspect] = useState<'9:16' | '16:9' | '1:1'>('9:16')
  const [titleText, setTitleText] = useState('')
  const [subtitleText, setSubtitleText] = useState('')
  const [ctaText, setCtaText] = useState('')
  const [showTitle, setShowTitle] = useState(false)
  const [textLayers, setTextLayers] = useState<TextLayer[]>([])
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const [exportWidth, setExportWidth] = useState(1080)
  const [exportHeight, setExportHeight] = useState(1920)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [saveStatus, setSaveStatus] = useState('Loading project…')
  const [activePanel, setActivePanel] = useState<'media' | 'text' | 'audio'>('media')
  const [hydrated, setHydrated] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveSequence = useRef(0)
  const selected = clips.find(item => item.id === selectedId) || clips[0] || null
  const selectedText = textLayers.find(item => item.id === selectedTextId) || null
  const totalDuration = useMemo(() => clips.reduce((sum, item) => sum + Math.max(0.1, item.trimEnd - item.trimStart), 0), [clips])
  const currentDuration = selected ? Math.max(0, selected.trimEnd - selected.trimStart) : 0

  useEffect(() => () => {
    objectUrls.current.forEach(url => URL.revokeObjectURL(url))
    objectUrls.current.clear()
  }, [])
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
            trimStart: Number(item.trimStart), trimEnd: Number(item.trimEnd), fileSize: Number(item.fileSize),
            storagePath: String(item.storagePath),
          })))
          if (!active) return
          setClips(restored)
          if (typeof data.audioPath === 'string' && data.audioPath) {
            const audioUrl = await createStudioAssetUrl(data.audioPath)
            if (!active) return
            setAudio({ id: String(data.audioId || makeId()), name: String(data.audioName || 'Background music'), url: audioUrl, duration: Number(data.audioDuration || 0), fileSize: Number(data.audioFileSize || 0), storagePath: data.audioPath })
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
            const restoredText = (data.textLayers as Array<Record<string, unknown>>).filter(item => typeof item.id === 'string' && typeof item.text === 'string').map(item => ({
              id: String(item.id), kind: (item.kind === 'heading' || item.kind === 'subheading' ? item.kind : 'body') as TextLayer['kind'],
              text: String(item.text), x: Math.min(95, Math.max(0, Number(item.x) || 0)), y: Math.min(95, Math.max(0, Number(item.y) || 0)),
              width: Math.min(100, Math.max(12, Number(item.width) || 80)), fontSize: Math.min(160, Math.max(10, Number(item.fontSize) || 24)),
              color: typeof item.color === 'string' ? item.color : '#ffffff', bold: item.bold !== false, italic: item.italic === true,
              underline: item.underline === true, align: item.align === 'left' || item.align === 'right' ? item.align : 'center',
            }))
            setTextLayers(restoredText)
            if (typeof data.selectedTextId === 'string') setSelectedTextId(data.selectedTextId)
          } else {
            const legacy: TextLayer[] = []
            if (data.showTitle && typeof data.titleText === 'string' && data.titleText) legacy.push({ id: makeId(), kind: 'heading', text: data.titleText, x: 8, y: 12, width: 84, fontSize: 42, color: '#ffffff', bold: true, italic: false, underline: false, align: 'center' })
            if (data.showTitle && typeof data.subtitleText === 'string' && data.subtitleText) legacy.push({ id: makeId(), kind: 'subheading', text: data.subtitleText, x: 8, y: 25, width: 84, fontSize: 25, color: '#ffffff', bold: false, italic: false, underline: false, align: 'center' })
            if (data.showTitle && typeof data.ctaText === 'string' && data.ctaText) legacy.push({ id: makeId(), kind: 'body', text: data.ctaText, x: 25, y: 80, width: 50, fontSize: 18, color: '#111827', bold: true, italic: false, underline: false, align: 'center' })
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
            clips: clips.map(({ id, kind, name, duration, trimStart, trimEnd, fileSize, storagePath }) => ({ id, kind, name, duration, trimStart, trimEnd, fileSize, storagePath })),
            audioPath: audio?.storagePath || null, audioId: audio?.id || null, audioName: audio?.name || null,
            audioDuration: audio?.duration || 0, audioFileSize: audio?.fileSize || 0, selectedId, muted, volume,
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
    if (!video || !selected || selected.kind !== 'video') return
    video.currentTime = Math.min(selected.trimStart, Math.max(0, selected.duration - 0.05))
    video.volume = muted ? 0 : volume / 100
    video.muted = muted
    setPlaying(false)
    setPlayhead(selected.trimStart)
  }, [selectedId, selected?.url, selected?.trimStart, muted, volume])

  useEffect(() => {
    const video = previewRef.current
    if (!video || !selected || selected.kind !== 'video') return
    const update = () => {
      setPlayhead(video.currentTime)
      if (video.currentTime >= selected.trimEnd) {
        video.pause()
        video.currentTime = selected.trimStart
        setPlaying(false)
      }
    }
    video.addEventListener('timeupdate', update)
    return () => video.removeEventListener('timeupdate', update)
  }, [selectedId, selected?.trimEnd, selected?.trimStart, selected?.kind])

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
      additions.push({ id: makeId(), kind, name: file.name, url, duration, trimStart: 0, trimEnd: duration, fileSize: file.size, storagePath })
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
    setAudio(current => { if (current) { URL.revokeObjectURL(current.url); objectUrls.current.delete(current.url) }; return { id: makeId(), name: file.name, url, duration, fileSize: file.size, storagePath } })
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
    const layer: TextLayer = { id: makeId(), kind, text: preset.text, x: 10, y: preset.y, width: 80, fontSize: preset.fontSize, color: '#ffffff', bold: preset.bold, italic: false, underline: false, align: 'center' }
    setTextLayers(items => [...items, layer])
    setSelectedTextId(layer.id)
    setEditingTextId(layer.id)
    setActivePanel('text')
    setNotice('Text added. Edit it directly on the canvas.')
  }
  const updateTextLayer = (id: string, patch: Partial<TextLayer>) => setTextLayers(items => items.map(item => item.id === id ? { ...item, ...patch } : item))
  const removeTextLayer = (id: string) => {
    setTextLayers(items => items.filter(item => item.id !== id))
    if (selectedTextId === id) setSelectedTextId(null)
    if (editingTextId === id) setEditingTextId(null)
  }
  const beginTextDrag = (event: ReactPointerEvent<HTMLElement>, layer: TextLayer, mode: 'move' | 'resize') => {
    if (editingTextId === layer.id && mode === 'move') return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    textDrag.current = { id: layer.id, pointerId: event.pointerId, mode, startX: event.clientX, startY: event.clientY, originX: layer.x, originY: layer.y, originWidth: layer.width, originFontSize: layer.fontSize }
    setSelectedTextId(layer.id)
  }
  const moveTextPointer = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = textDrag.current
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!drag || drag.pointerId !== event.pointerId || !rect) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (drag.mode === 'move') updateTextLayer(drag.id, { x: Math.min(100, Math.max(0, drag.originX + dx / rect.width * 100)), y: Math.min(96, Math.max(0, drag.originY + dy / rect.height * 100)) })
    else updateTextLayer(drag.id, { width: Math.min(100, Math.max(12, drag.originWidth + dx / rect.width * 100)), fontSize: Math.min(160, Math.max(10, drag.originFontSize + dy * 0.35)) })
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
  const togglePlayback = async () => {
    const video = previewRef.current
    if (!video || !selected || selected.kind !== 'video') {
      setNotice('Select a video clip to play its preview.')
      return
    }
    if (playing) { video.pause(); audioRef.current?.pause(); setPlaying(false); return }
    if (video.currentTime < selected.trimStart || video.currentTime >= selected.trimEnd) video.currentTime = selected.trimStart
    try { await video.play(); if (audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.volume = audioVolume / 100; void audioRef.current.play().catch(() => setNotice('Video is playing; browser blocked automatic music preview. Press play again after interacting with the page.')) }; setPlaying(true); setError('') }
    catch { setError('The browser could not play this video. Try another supported file or format.') }
  }
  useEffect(() => { if (audioRef.current) audioRef.current.volume = audioVolume / 100 }, [audioVolume, audio?.url])

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
    const exportVideos = new Map<string, HTMLVideoElement>()
    let animationFrame = 0
    try {
      const canvas = document.createElement('canvas')
      canvas.width = Math.min(1920, Math.max(240, Math.round(exportWidth)))
      canvas.height = Math.min(1920, Math.max(240, Math.round(exportHeight)))
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Could not create the video rendering canvas.')
      const stream = canvas.captureStream(30)
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
      const drawTitle = () => {
        if (!textLayers.length) return
        ctx.save()
        const scale = canvas.width / 420
        for (const layer of textLayers) {
          ctx.fillStyle = layer.color
          ctx.textAlign = layer.align
          ctx.textBaseline = 'top'
          ctx.font = (layer.italic ? 'italic ' : '') + (layer.bold ? '700 ' : '400 ') + Math.round(layer.fontSize * scale) + 'px Arial'
          const x = canvas.width * layer.x / 100
          const y = canvas.height * layer.y / 100
          const maxWidth = canvas.width * layer.width / 100
          const lineHeight = Math.round(layer.fontSize * scale * 1.2)
          layer.text.split(/\\n/).forEach((line, index) => {
            const textX = layer.align === 'left' ? x : layer.align === 'right' ? x + maxWidth : x + maxWidth / 2
            ctx.fillText(line, textX, y + index * lineHeight, maxWidth)
            if (layer.underline) {
              const measured = Math.min(maxWidth, ctx.measureText(line).width)
              const startX = layer.align === 'left' ? x : layer.align === 'right' ? x + maxWidth - measured : x + (maxWidth - measured) / 2
              ctx.fillRect(startX, y + index * lineHeight + lineHeight - Math.max(1, scale), measured, Math.max(1, scale))
            }
          })
        }
        ctx.restore()
      }
      const drawVideoFrame = (video: HTMLVideoElement) => {
        ctx.fillStyle = '#000000'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        const scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight)
        const width = video.videoWidth * scale
        const height = video.videoHeight * scale
        ctx.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
        drawTitle()
      }
      recorder.start(1000)
      if (musicElement) { musicElement.currentTime = 0; await musicElement.play() }
      for (let index = 0; index < clips.length; index++) {
        const clip = clips[index]
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
              drawTitle()
              setExportProgress(Math.min(99, Math.round(((index + (now - start) / durationMs) / clips.length) * 100)))
              if (now - start >= durationMs) resolve()
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
              if (video.readyState >= 2 && video.videoWidth > 0) drawVideoFrame(video)
              setExportProgress(Math.min(99, Math.round(((index + Math.min(1, (video.currentTime - clip.trimStart) / Math.max(0.1, clip.trimEnd - clip.trimStart))) / clips.length) * 100)))
              if (video.currentTime >= clip.trimEnd || video.ended) { video.pause(); resolve(); return }
              animationFrame = requestAnimationFrame(frame)
            }
            video.onerror = () => reject(new Error('Playback failed while exporting: ' + clip.name))
            animationFrame = requestAnimationFrame(frame)
          })
          video.pause()
          video.removeAttribute('src')
          video.load()
        }
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
      setExporting(false)
    }
  }

  const jumpClip = (direction: number) => {
    if (!clips.length) return
    const index = clips.findIndex(item => item.id === selectedId)
    const next = clips[Math.min(clips.length - 1, Math.max(0, index + direction))]
    if (next) setSelectedId(next.id)
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
          <div className="mt-auto flex flex-col items-center gap-1 pb-2"><span className="text-[8px] text-slate-600">SOCIALENS</span><span className="h-1 w-1 rounded-full bg-fuchsia-400" /></div>
        </nav>

        <aside className="hidden w-[260px] shrink-0 flex-col border-r border-white/[0.08] bg-[#0d1020] lg:flex">
          <div className="border-b border-white/[0.07] px-4 py-4">
            <div className="flex items-center justify-between"><h2 className="text-[12px] font-bold text-white">{activePanel === 'media' ? 'Project media' : activePanel === 'text' ? 'Text editor' : 'Audio library'}</h2><span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[9px] text-slate-500">{activePanel === 'media' ? clips.length + ' clips' : activePanel === 'audio' ? (audio ? '1 track' : '0 tracks') : '3 text styles'}</span></div>
            <p className="mt-1 text-[9px] text-slate-500">{activePanel === 'media' ? 'Import and manage your video and photo clips.' : activePanel === 'text' ? 'Edit the text currently shown on your canvas.' : 'Add a music track and control its volume.'}</p>
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
            {selectedText && <div className="mt-2 rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/[0.05] p-3"><div className="mb-2 flex items-center justify-between"><span className="text-[10px] font-semibold text-fuchsia-100">Selected text</span><button type="button" onClick={() => removeTextLayer(selectedText.id)} className="text-[9px] text-red-300">Delete</button></div><label className="block text-[9px] text-slate-400">Font size · {Math.round(selectedText.fontSize)}px<input type="range" min="10" max="160" value={selectedText.fontSize} onChange={event => updateTextLayer(selectedText.id,{fontSize:Number(event.target.value)})} className="mt-2 w-full accent-fuchsia-500" /></label><label className="mt-3 flex items-center justify-between text-[9px] text-slate-400">Text color<input type="color" value={selectedText.color} onChange={event => updateTextLayer(selectedText.id,{color:event.target.value})} className="h-8 w-12 cursor-pointer rounded border border-white/10 bg-transparent" /></label><div className="mt-3 grid grid-cols-3 gap-1"><button type="button" onClick={() => updateTextLayer(selectedText.id,{bold:!selectedText.bold})} className={'rounded-md border py-2 text-xs font-bold ' + (selectedText.bold ? 'border-fuchsia-400/40 bg-fuchsia-500/15 text-white' : 'border-white/10 text-slate-400')}>B</button><button type="button" onClick={() => updateTextLayer(selectedText.id,{italic:!selectedText.italic})} className={'rounded-md border py-2 text-xs italic ' + (selectedText.italic ? 'border-fuchsia-400/40 bg-fuchsia-500/15 text-white' : 'border-white/10 text-slate-400')}>I</button><button type="button" onClick={() => updateTextLayer(selectedText.id,{underline:!selectedText.underline})} className={'rounded-md border py-2 text-xs underline ' + (selectedText.underline ? 'border-fuchsia-400/40 bg-fuchsia-500/15 text-white' : 'border-white/10 text-slate-400')}>U</button></div></div>}
          </div>}
          {activePanel === 'audio' && <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
            <button type="button" onClick={() => audioInput.current?.click()} className="flex h-10 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-[10px] font-bold"><Music2 className="h-4 w-4" /> {audio ? 'Replace audio track' : 'Import audio'}</button>
            {audio ? <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/[0.04] p-3"><div className="flex items-center gap-2"><Music2 className="h-4 w-4 shrink-0 text-cyan-300" /><div className="min-w-0"><p className="truncate text-[10px] font-semibold text-cyan-100">{audio.name}</p><p className="text-[9px] text-cyan-100/50">{formatTime(audio.duration)} duration</p></div></div><label className="mt-4 block text-[9px] text-slate-400">Track volume · {audioVolume}%<input type="range" min="0" max="100" value={audioVolume} onChange={event => setAudioVolume(Number(event.target.value))} className="mt-2 w-full accent-cyan-400" /></label><button type="button" onClick={() => { URL.revokeObjectURL(audio.url); objectUrls.current.delete(audio.url); setAudio(null) }} className="mt-3 w-full rounded-lg border border-red-400/20 py-2 text-[9px] font-semibold text-red-300 hover:bg-red-400/[0.06]">Remove audio track</button></div> : <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center"><Music2 className="mx-auto h-7 w-7 text-slate-600" /><p className="mt-2 text-[10px] font-semibold text-slate-300">No audio track</p><p className="mt-1 text-[9px] text-slate-500">Import a music or audio file to add it to your project.</p></div>}
            <p className="text-[9px] leading-4 text-slate-600">Supported audio files up to 50 MB.</p>
          </div>}
        </aside>

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[radial-gradient(ellipse_at_50%_30%,rgba(88,54,160,0.15),transparent_55%),#080a13]">
          <div className="flex h-10 min-h-10 shrink-0 items-center gap-2 overflow-x-auto border-b border-white/[0.07] bg-[#0c0f1c] px-3 md:hidden">
            <button type="button" onClick={() => videoInput.current?.click()} className="shrink-0 rounded-md bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-2 text-[9px] font-bold">Import video</button>
            <button type="button" onClick={() => imageInput.current?.click()} className="shrink-0 rounded-md border border-white/10 px-3 py-2 text-[9px] font-semibold text-slate-200">Add photo</button>
            <button type="button" onClick={() => audioInput.current?.click()} className="shrink-0 rounded-md border border-white/10 px-3 py-2 text-[9px] font-semibold text-slate-200">Add audio</button>
            <button type="button" onClick={() => setActivePanel('text')} className="shrink-0 rounded-md border border-white/10 px-3 py-2 text-[9px] font-semibold text-slate-200">Text</button>
            <button type="button" onClick={() => setActivePanel('audio')} className="shrink-0 rounded-md border border-white/10 px-3 py-2 text-[9px] font-semibold text-slate-200">Audio settings</button>
          </div>
          {activePanel === 'text' && <div className="grid shrink-0 grid-cols-3 gap-2 border-b border-white/[0.07] bg-[#101426] p-3 md:hidden">
            <button type="button" onClick={() => addTextLayer('heading')} className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-3 text-[10px] font-extrabold text-white">Heading</button>
            <button type="button" onClick={() => addTextLayer('subheading')} className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-3 text-[10px] font-bold text-white">Subheading</button>
            <button type="button" onClick={() => addTextLayer('body')} className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-3 text-[9px] font-medium text-white">Body text</button>
          </div>}
          {activePanel === 'audio' && <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-white/[0.07] bg-[#101426] px-3 py-2 md:hidden">
            {audio ? <><span className="max-w-[140px] truncate text-[9px] text-cyan-100">{audio.name}</span><label className="flex min-w-[120px] flex-1 items-center gap-2 text-[9px] text-slate-400">Volume<input type="range" min="0" max="100" value={audioVolume} onChange={event => setAudioVolume(Number(event.target.value))} className="w-full accent-cyan-400" /></label><button type="button" onClick={() => { URL.revokeObjectURL(audio.url); objectUrls.current.delete(audio.url); setAudio(null) }} className="text-[9px] text-red-300">Remove</button></> : <span className="text-[9px] text-slate-500">No audio track added yet.</span>}
          </div>}
          <div className="flex h-[48px] min-h-[48px] shrink-0 items-center justify-between border-b border-white/[0.07] bg-[#0c0f1c]/85 px-3 sm:px-5">
            <div className="flex items-center gap-2"><span className="text-[10px] font-semibold text-slate-200">Preview</span><span className="rounded-md border border-white/10 bg-white/[0.035] px-2 py-1 text-[9px] text-slate-500">{aspect}</span><span className="hidden text-[9px] text-slate-600 sm:inline">{selected ? selected.kind === 'video' ? 'Video clip' : 'Photo clip' : 'No clip selected'}</span></div>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => jumpClip(-1)} disabled={!selected || clips.findIndex(item => item.id === selected.id) <= 0} aria-label="Previous clip" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.06] disabled:opacity-25"><ChevronLeft className="h-4 w-4" /></button>
              <button type="button" onClick={() => void togglePlayback()} disabled={!selected || selected.kind !== 'video'} aria-label={playing ? 'Pause preview' : 'Play preview'} className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md shadow-violet-950/40 disabled:opacity-30">{playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</button>
              <button type="button" onClick={() => jumpClip(1)} disabled={!selected || clips.findIndex(item => item.id === selected.id) >= clips.length - 1} aria-label="Next clip" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.06] disabled:opacity-25"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3 sm:p-5">
            <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-xl border border-white/[0.07] bg-[#05060d] shadow-[0_20px_70px_rgba(0,0,0,0.42)]">
              <div ref={canvasRef} onPointerDown={event => { if (event.target === event.currentTarget) { setSelectedTextId(null); setEditingTextId(null) } }} className={'relative flex max-h-full max-w-full items-center justify-center overflow-hidden rounded-md bg-black ring-1 ring-violet-400/20 ' + (aspect === '9:16' ? 'h-full aspect-[9/16]' : aspect === '16:9' ? 'w-full max-w-5xl aspect-video' : 'h-full aspect-square')} style={{ maxHeight: 'min(72dvh, 720px)' }}>
                {selected?.kind === 'video' ? <video key={selected.id} ref={previewRef} src={selected.url} playsInline preload="metadata" className="h-full w-full object-contain" onEnded={() => { audioRef.current?.pause(); setPlaying(false) }} /> : selected?.kind === 'image' ? <img src={selected.url} alt={selected.name} className="h-full w-full object-contain" /> : <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center"><Clapperboard className="h-10 w-10 text-violet-400/60" /><p className="text-sm font-semibold text-slate-300">Your video canvas</p><p className="max-w-xs text-[10px] leading-4 text-slate-500">Import a video or photo to start editing your project.</p><button type="button" onClick={() => videoInput.current?.click()} className="rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-[10px] font-bold"><Plus className="mr-1 inline h-3 w-3" /> Import video</button></div>}
                {audio && <audio ref={audioRef} src={audio.url} preload="metadata" />}
                {textLayers.map(layer => <div key={layer.id} data-text-layer-id={layer.id} onPointerDown={event => beginTextDrag(event,layer,'move')} onPointerMove={moveTextPointer} onPointerUp={endTextPointer} onPointerCancel={endTextPointer} onClick={event => { event.stopPropagation(); setSelectedTextId(layer.id) }} onDoubleClick={event => { event.stopPropagation(); setSelectedTextId(layer.id); setEditingTextId(layer.id) }} className={'absolute z-20 min-h-[28px] touch-none rounded-sm px-1 py-0.5 outline-none ' + (selectedTextId === layer.id ? 'border border-dashed border-fuchsia-400 shadow-[0_0_0_1px_rgba(217,70,239,.15)]' : 'border border-transparent hover:border-white/40')} style={{ left: layer.x + '%', top: layer.y + '%', width: layer.width + '%', color: layer.color, fontSize: layer.fontSize + 'px', fontWeight: layer.bold ? 700 : 400, fontStyle: layer.italic ? 'italic' : 'normal', textDecoration: layer.underline ? 'underline' : 'none', textAlign: layer.align, lineHeight: 1.15, cursor: editingTextId === layer.id ? 'text' : 'move', overflowWrap: 'anywhere' }}>
                  <div contentEditable={editingTextId === layer.id} suppressContentEditableWarning onInput={event => updateTextLayer(layer.id,{text:event.currentTarget.innerText})} onBlur={() => setEditingTextId(current => current === layer.id ? null : current)} className="min-h-[24px] whitespace-pre-wrap break-words outline-none">{layer.text}</div>
                  {selectedTextId === layer.id && editingTextId !== layer.id && <button type="button" aria-label="Resize text" onPointerDown={event => beginTextDrag(event,layer,'resize')} onPointerMove={moveTextPointer} onPointerUp={endTextPointer} onPointerCancel={endTextPointer} className="absolute -bottom-2 -right-2 h-4 w-4 rounded-full border-2 border-white bg-fuchsia-500 shadow-md" />}
                </div>)}
                {selected?.kind === 'video' && <div className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-1 text-[9px] tabular-nums text-white">{formatTime(playhead)} / {formatTime(selected.duration)}</div>}
              </div>
            </div>
          </div>

          <div className="flex h-[38px] min-h-[38px] shrink-0 items-center justify-between border-t border-white/[0.07] bg-[#0c0f1c]/90 px-3 sm:px-5">
            <div className="flex items-center gap-2 text-[9px] text-slate-400"><Volume2 className="h-3.5 w-3.5" /><span className="hidden sm:inline">Preview volume</span><input aria-label="Preview volume" type="range" min="0" max="100" value={volume} onChange={event => setVolume(Number(event.target.value))} className="w-16 accent-fuchsia-500 sm:w-24" /><button type="button" onClick={() => setMuted(value => !value)} aria-label={muted ? 'Unmute preview' : 'Mute preview'} className="rounded p-1 text-slate-400 hover:bg-white/10">{muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}</button></div>
            <div className="flex items-center gap-3 text-[9px] tabular-nums text-slate-500"><span>{clips.length} clips</span><span>{formatTime(totalDuration)}</span></div>
          </div>

          <section className="z-10 shrink-0 border-t border-white/[0.09] bg-[#0b0e1a] px-2 pb-[calc(8px+env(safe-area-inset-bottom))] pt-2 sm:px-4">
            <div className="mb-2 flex items-center justify-between gap-2"><div className="flex items-center gap-2"><AudioLines className="h-3.5 w-3.5 text-fuchsia-300" /><h2 className="text-[10px] font-bold text-slate-200">Timeline</h2><span className="hidden text-[9px] text-slate-600 sm:inline">Project tracks</span></div><span className="text-[9px] tabular-nums text-slate-500">{formatTime(totalDuration)}</span></div>
            <div className="space-y-1.5">
              <div className="flex h-[30px] min-h-[30px] items-center overflow-hidden rounded-md border border-fuchsia-400/15 bg-fuchsia-400/[0.035]"><div className="flex h-full w-[72px] shrink-0 items-center gap-1.5 border-r border-fuchsia-400/10 bg-[#21152b] px-2 text-[9px] font-semibold text-fuchsia-100"><Type className="h-3 w-3" />Text</div><div className="flex h-full min-w-0 flex-1 items-center px-2">{textLayers.length ? <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">{textLayers.map(layer => <button key={layer.id} type="button" onClick={() => { setSelectedTextId(layer.id); setActivePanel('text') }} className={'h-[20px] max-w-[180px] min-w-[70px] truncate rounded px-2 text-left text-[9px] font-semibold text-white ' + (selectedTextId === layer.id ? 'bg-fuchsia-500 ring-1 ring-fuchsia-300' : 'bg-gradient-to-r from-violet-600/80 to-fuchsia-600/80')}>{layer.text || 'Untitled text'}</button>)}</div> : <button type="button" onClick={() => setActivePanel('text')} className="text-[9px] text-fuchsia-100/60 hover:text-fuchsia-100">+ Add text</button>}</div></div>
              <div className="flex h-[30px] min-h-[30px] items-center overflow-hidden rounded-md border border-sky-400/15 bg-sky-400/[0.035]"><div className="flex h-full w-[72px] shrink-0 items-center gap-1.5 border-r border-sky-400/10 bg-[#10212b] px-2 text-[9px] font-semibold text-sky-100"><ImagePlus className="h-3 w-3" />Image</div><div className="flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1">{clips.filter(item => item.kind === 'image').length ? clips.filter(item => item.kind === 'image').map((item,index) => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} title={item.name} className={'h-[22px] min-w-[84px] max-w-[180px] flex-1 truncate rounded px-2 text-left text-[8px] ' + (selected?.id === item.id ? 'bg-sky-400/25 text-sky-100 ring-1 ring-sky-300/40' : 'bg-sky-400/10 text-sky-100/75')}>{item.name}</button>) : <button type="button" onClick={() => imageInput.current?.click()} className="text-[9px] text-sky-100/55">+ Add photo</button>}</div></div>
              <div className="flex h-[30px] min-h-[30px] items-center overflow-hidden rounded-md border border-violet-400/15 bg-violet-400/[0.035]"><div className="flex h-full w-[72px] shrink-0 items-center gap-1.5 border-r border-violet-400/10 bg-[#1b1830] px-2 text-[9px] font-semibold text-violet-100"><Video className="h-3 w-3" />Video</div><div className="flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1">{clips.filter(item => item.kind === 'video').length ? clips.filter(item => item.kind === 'video').map((item,index) => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} title={item.name} className={'h-[22px] min-w-[84px] max-w-[180px] flex-1 truncate rounded px-2 text-left text-[8px] ' + (selected?.id === item.id ? 'bg-violet-400/25 text-violet-100 ring-1 ring-violet-300/40' : 'bg-violet-400/10 text-violet-100/75')}>{index+1}. {item.name}</button>) : <button type="button" onClick={() => videoInput.current?.click()} className="text-[9px] text-violet-100/55">+ Add video</button>}</div></div>
              <div className="flex h-[30px] min-h-[30px] items-center overflow-hidden rounded-md border border-emerald-400/15 bg-emerald-400/[0.035]"><div className="flex h-full w-[72px] shrink-0 items-center gap-1.5 border-r border-emerald-400/10 bg-[#10271f] px-2 text-[9px] font-semibold text-emerald-100"><Music2 className="h-3 w-3" />Audio</div><div className="flex h-full min-w-0 flex-1 items-center gap-2 overflow-hidden px-2">{audio ? <><span className="min-w-0 flex-1 truncate text-[9px] font-semibold text-emerald-100">{audio.name}</span><span className="shrink-0 text-[8px] text-emerald-100/55">{formatTime(audio.duration)}</span><button type="button" onClick={() => setActivePanel('audio')} className="shrink-0 text-[8px] text-emerald-200 hover:text-white">Edit</button></> : <button type="button" onClick={() => audioInput.current?.click()} className="text-[9px] text-emerald-100/55">+ Add audio</button>}</div></div>
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
