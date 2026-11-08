'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createStudioAssetUrl, loadStudioProject, saveStudioProject, uploadStudioAsset } from '@/lib/studio/persistence'
import {
  ArrowLeft, ArrowDown, ArrowUp, AudioLines, Check, ChevronLeft, ChevronRight,
  Clapperboard, Film, ImagePlus, Music2, Pause, Play, Plus, Scissors, Trash2,
  Upload, Video, Volume2, VolumeX, X
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
  const [showTitle, setShowTitle] = useState(false)
  const [exportWidth, setExportWidth] = useState(1080)
  const [exportHeight, setExportHeight] = useState(1920)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [saveStatus, setSaveStatus] = useState('Loading project…')
  const [hydrated, setHydrated] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveSequence = useRef(0)
  const selected = clips.find(item => item.id === selectedId) || clips[0] || null
  const totalDuration = useMemo(() => clips.reduce((sum, item) => sum + Math.max(0.1, item.trimEnd - item.trimStart), 0), [clips])
  const currentDuration = selected ? Math.max(0, selected.trimEnd - selected.trimStart) : 0
  const backUrl = '/studio?step=templates&mode=video&created=1&name=' + encodeURIComponent(projectName) + '&projectId=' + encodeURIComponent(projectId) + (templateId ? '&template=' + encodeURIComponent(templateId) : '')

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
          if (typeof data.showTitle === 'boolean') setShowTitle(data.showTitle)
          if (typeof data.exportWidth === 'number') setExportWidth(data.exportWidth)
          if (typeof data.exportHeight === 'number') setExportHeight(data.exportHeight)
          setSaveStatus('Draft restored')
        } else setSaveStatus('New draft')
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
            audioVolume, aspect, titleText, showTitle, exportWidth, exportHeight,
          },
        })
        if (sequence === saveSequence.current) setSaveStatus('All changes saved')
      } catch (cause) {
        if (sequence === saveSequence.current) setSaveStatus(cause instanceof Error ? cause.message : 'Save failed')
      }
    }, 1000)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [hydrated, projectId, projectName, templateId, clips, audio, selectedId, muted, volume, audioVolume, aspect, titleText, showTitle, exportWidth, exportHeight])


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
      const duration = kind === 'image' ? 5 : await readMediaDuration(file, url, kind)
      if (kind === 'video' && duration <= 0) {
        URL.revokeObjectURL(url)
        objectUrls.current.delete(url)
        setError('Could not read ' + file.name + '. Try another MP4, WebM or MOV file.')
        continue
      }
      additions.push({ id: makeId(), kind, name: file.name, url, duration, trimStart: 0, trimEnd: duration, fileSize: file.size })
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
    const duration = await new Promise<number>(resolve => {
      const el = document.createElement('audio')
      el.onloadedmetadata = () => resolve(Number.isFinite(el.duration) ? el.duration : 0)
      el.onerror = () => resolve(0)
      el.src = url
    })
    if (!duration) { URL.revokeObjectURL(url); objectUrls.current.delete(url); setError('Could not read this audio file.'); return }
    setAudio(current => { if (current) { URL.revokeObjectURL(current.url); objectUrls.current.delete(current.url) }; return { id: makeId(), name: file.name, url, duration, fileSize: file.size } })
    setNotice('Music track added. Adjust its volume in the Audio panel.')
  }

  const updateClip = (id: string, patch: Partial<Clip>) => setClips(items => items.map(item => item.id === id ? { ...item, ...patch } : item))
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
          await musicElement.play()
        }
        for (const clip of clips.filter(item => item.kind === 'video')) {
          const videoElement = document.createElement('video')
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
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: canvas.width >= 1080 ? 5_000_000 : 2_500_000 })
      const stopped = new Promise<Blob>((resolve, reject) => {
        recorder!.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
        recorder!.onstop = () => resolve(new Blob(chunks, { type: recorder!.mimeType || mimeType }))
        recorder!.onerror = () => reject(new Error('The browser stopped recording unexpectedly.'))
      })
      const drawTitle = () => {
        if (!showTitle || !titleText) return
        ctx.save()
        ctx.fillStyle = 'rgba(0,0,0,.42)'
        ctx.fillRect(canvas.width * 0.06, canvas.height * 0.09, canvas.width * 0.88, canvas.height * 0.16)
        ctx.fillStyle = '#ffffff'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.font = '900 ' + Math.round(canvas.width * 0.055) + 'px Arial'
        ctx.fillText(titleText, canvas.width / 2, canvas.height * 0.17, canvas.width * 0.82)
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
      const startedAt = performance.now()
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
      void startedAt
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
    <main className="fixed inset-0 z-[70] flex min-h-dvh flex-col overflow-hidden bg-[#080a13] text-white">
      <header className="z-20 flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#0d1020] px-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={backUrl} aria-label="Back to templates" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 text-slate-300 hover:bg-white/10"><ArrowLeft className="h-4 w-4" /></Link>
          <div className="min-w-0"><p className="truncate text-sm font-bold">Video Editor</p><p className="max-w-[38vw] truncate text-[11px] text-slate-500">{projectName || 'Untitled video project'}</p></div>
        </div>
        <div className="flex items-center gap-2"><span className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10px] text-slate-400 sm:flex"><Check className="h-3.5 w-3.5 text-emerald-400" /> Editing workspace</span><button type="button" disabled={exporting || !clips.length} onClick={() => void exportVideo()} className="inline-flex h-9 items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-pink-600 px-3 text-[10px] font-bold text-white disabled:opacity-40">{exporting ? 'Rendering ' + exportProgress + '%' : 'Export video'}</button></div>
        <Link href="/studio" className="rounded-lg px-3 py-2 text-xs font-medium text-slate-400 hover:bg-white/5 hover:text-white">Exit</Link>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <aside className="order-2 flex max-h-[38vh] shrink-0 flex-col gap-4 overflow-y-auto border-t border-white/10 bg-[#0d1020] p-3 sm:p-4 lg:order-1 lg:max-h-none lg:w-[280px] lg:border-r lg:border-t-0 lg:p-5">
          <section>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-300">Import media</h2>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => videoInput.current?.click()} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 to-violet-600 text-[11px] font-bold"><Video className="h-4 w-4" /> Add video</button>
              <button type="button" onClick={() => imageInput.current?.click()} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-[11px] font-semibold"><ImagePlus className="h-4 w-4" /> Add photo</button>
            </div>
            <input ref={videoInput} type="file" accept="video/*" multiple className="hidden" onChange={event => { void addMedia(event.target.files, 'video'); event.currentTarget.value = '' }} />
            <input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" multiple className="hidden" onChange={event => { void addMedia(event.target.files, 'image'); event.currentTarget.value = '' }} />
            <p className="mt-2 text-[10px] leading-4 text-slate-500">Up to 20 video/photo clips. Videos up to 250 MB; photos up to 20 MB.</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {(['9:16', '16:9', '1:1'] as const).map(item => <button key={item} type="button" onClick={() => { setAspect(item); setExportWidth(item === '9:16' ? 1080 : item === '16:9' ? 1920 : 1080); setExportHeight(item === '9:16' ? 1920 : item === '16:9' ? 1080 : 1080) }} className={'rounded-lg border py-2 text-[10px] font-semibold ' + (aspect === item ? 'border-pink-400/50 bg-pink-500/10 text-pink-200' : 'border-white/10 text-slate-400')}>{item}</button>)}
            </div>
            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.025] p-3"><p className="mb-2 text-[10px] font-semibold text-slate-300">Export resolution</p><div className="grid grid-cols-2 gap-2"><label className="text-[10px] text-slate-500">Width<input type="number" min="240" max="1920" value={exportWidth} onChange={event => setExportWidth(Math.min(1920, Math.max(240, Number(event.target.value) || 240)))} className="mt-1 h-8 w-full rounded-lg border border-white/10 bg-black/20 px-2 text-xs text-white" /></label><label className="text-[10px] text-slate-500">Height<input type="number" min="240" max="1920" value={exportHeight} onChange={event => setExportHeight(Math.min(1920, Math.max(240, Number(event.target.value) || 240)))} className="mt-1 h-8 w-full rounded-lg border border-white/10 bg-black/20 px-2 text-xs text-white" /></label></div><p className="mt-2 text-[9px] text-slate-500">240–1920 px. Export records at 30 FPS in browser-supported WebM or MP4.</p></div>
          </section>
          <div className="h-px bg-white/[0.08]" />
          <section>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-300">Selected clip</h2>
            {selected ? <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-400/10 text-violet-200">{selected.kind === 'video' ? <Film className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" />}</span><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-semibold">{selected.name}</p><p className="text-[10px] text-slate-500">{formatTime(selected.duration)} · {(selected.fileSize / (1024 * 1024)).toFixed(1)} MB</p></div></div>
              <div><div className="mb-1 flex justify-between text-[10px] text-slate-400"><label htmlFor="trim-start">Trim start</label><span>{formatTime(selected.trimStart)}</span></div><input id="trim-start" type="range" min="0" max={Math.max(0, selected.trimEnd - 0.25)} step="0.1" value={selected.trimStart} onChange={event => updateClip(selected.id, { trimStart: Math.min(Number(event.target.value), selected.trimEnd - 0.1) })} className="w-full accent-pink-500" /></div>
              <div><div className="mb-1 flex justify-between text-[10px] text-slate-400"><label htmlFor="trim-end">Trim end</label><span>{formatTime(selected.trimEnd)}</span></div><input id="trim-end" type="range" min={Math.min(selected.duration, selected.trimStart + 0.1)} max={selected.duration} step="0.1" value={selected.trimEnd} onChange={event => updateClip(selected.id, { trimEnd: Math.max(Number(event.target.value), selected.trimStart + 0.1) })} className="w-full accent-pink-500" /></div>
              <p className="text-[10px] text-slate-500">Clip length: {formatTime(currentDuration)}</p>
              <button type="button" onClick={() => removeClip(selected.id)} className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-red-400/20 text-[10px] font-semibold text-red-200 hover:bg-red-400/10"><Trash2 className="h-3.5 w-3.5" /> Remove clip</button>
            </div> : <p className="rounded-xl border border-dashed border-white/10 p-4 text-[10px] leading-4 text-slate-500">Import a video or photo to begin building your sequence.</p>}
          </section>
          <div className="h-px bg-white/[0.08]" />
          <section>
            <div className="mb-3 flex items-center justify-between"><h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">Audio track</h2><Music2 className="h-4 w-4 text-pink-300" /></div>
            <button type="button" onClick={() => audioInput.current?.click()} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-[11px] font-semibold hover:bg-white/[0.08]"><Upload className="h-4 w-4" /> {audio ? 'Replace music' : 'Add music'}</button>
            <input ref={audioInput} type="file" accept="audio/*" className="hidden" onChange={event => { void addAudio(event.target.files?.[0]); event.currentTarget.value = '' }} />
            {audio && <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"><p className="truncate text-[10px] font-semibold">{audio.name}</p><p className="mt-1 text-[10px] text-slate-500">{formatTime(audio.duration)} · {(audio.fileSize / (1024 * 1024)).toFixed(1)} MB</p><label className="mt-3 block text-[10px] text-slate-400">Music volume · {audioVolume}%<input type="range" min="0" max="100" value={audioVolume} onChange={event => setAudioVolume(Number(event.target.value))} className="mt-2 w-full accent-pink-500" /></label><button type="button" onClick={() => { URL.revokeObjectURL(audio.url); objectUrls.current.delete(audio.url); setAudio(null) }} className="mt-2 flex items-center gap-1 text-[10px] text-red-300"><X className="h-3 w-3" /> Remove music</button></div>}
          </section>
          <div className="h-px bg-white/[0.08]" />
          <section>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-300">Text overlay</h2>
            <label className="block text-[10px] text-slate-400">Title text<input value={titleText} maxLength={100} onChange={event => setTitleText(event.target.value)} placeholder="Add a title to your video" className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-black/20 px-2 text-xs text-white placeholder:text-slate-600" /></label>
            <label className="mt-2 flex items-center gap-2 text-[10px] text-slate-400"><input type="checkbox" checked={showTitle} onChange={event => setShowTitle(event.target.checked)} className="accent-pink-500" /> Show title on preview</label>
          </section>
        </aside>

        <section className="order-1 flex min-h-0 min-w-0 flex-1 flex-col lg:order-2">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] px-3 py-3 sm:px-5">
            <div><p className="text-xs font-semibold text-slate-200">Preview monitor</p><p className="mt-0.5 text-[10px] text-slate-500">{aspect} · {selected ? selected.kind.toUpperCase() : 'No media selected'}</p></div>
            <div className="flex items-center gap-2"><button type="button" onClick={() => jumpClip(-1)} disabled={!selected || clips.findIndex(item => item.id === selected.id) <= 0} aria-label="Previous clip" className="rounded-lg border border-white/10 p-2 text-slate-300 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button><button type="button" onClick={() => void togglePlayback()} disabled={!selected || selected.kind !== 'video'} aria-label={playing ? 'Pause preview' : 'Play preview'} className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-r from-pink-500 to-violet-600 disabled:opacity-40">{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button><button type="button" onClick={() => jumpClip(1)} disabled={!selected || clips.findIndex(item => item.id === selected.id) >= clips.length - 1} aria-label="Next clip" className="rounded-lg border border-white/10 p-2 text-slate-300 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button></div>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[radial-gradient(ellipse_at_50%_45%,rgba(65,55,105,0.18),transparent_55%),#080a13] p-4 sm:p-6">
            <div className={'relative flex max-h-full max-w-full items-center justify-center overflow-hidden rounded-xl bg-black shadow-[0_24px_80px_rgba(0,0,0,0.55)] ring-1 ring-white/15 ' + (aspect === '9:16' ? 'h-full aspect-[9/16]' : aspect === '16:9' ? 'w-full max-w-4xl aspect-video' : 'h-full aspect-square')} style={{ maxHeight: 'min(100%, 680px)' }}>
              {selected?.kind === 'video' ? <video key={selected.id} ref={previewRef} src={selected.url} playsInline preload="metadata" className="h-full w-full object-contain" onEnded={() => { audioRef.current?.pause(); setPlaying(false) }} /> : selected?.kind === 'image' ? <img src={selected.url} alt={selected.name} className="h-full w-full object-contain" /> : <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center"><Clapperboard className="h-10 w-10 text-slate-600" /><p className="text-sm font-semibold text-slate-300">Your video preview</p><p className="max-w-xs text-[10px] leading-4 text-slate-500">Add videos and photos to build your sequence. Select a clip in the timeline to preview it here.</p><button type="button" onClick={() => videoInput.current?.click()} className="rounded-lg bg-gradient-to-r from-pink-500 to-violet-600 px-4 py-2 text-[10px] font-bold"><Plus className="mr-1 inline h-3 w-3" /> Import first video</button></div>}
              {audio && <audio ref={audioRef} src={audio.url} preload="metadata" />}
              {showTitle && titleText && <div className="pointer-events-none absolute inset-x-3 top-[12%] rounded-lg bg-black/40 px-3 py-2 text-center text-xl font-black text-white drop-shadow-lg sm:text-3xl">{titleText}</div>}
              {selected?.kind === 'video' && <div className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-1 text-[9px] tabular-nums text-white">{formatTime(playhead)} / {formatTime(selected.duration)}</div>}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] px-3 py-2 sm:px-5">
            <div className="flex items-center gap-2 text-[10px] text-slate-400"><Volume2 className="h-3.5 w-3.5" /><span>Preview volume</span><input aria-label="Preview volume" type="range" min="0" max="100" value={volume} onChange={event => setVolume(Number(event.target.value))} className="w-20 accent-pink-500" /><button type="button" onClick={() => setMuted(value => !value)} aria-label={muted ? 'Unmute preview' : 'Mute preview'} className="rounded p-1 hover:bg-white/10">{muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}</button></div>
            <span className="text-[10px] text-slate-500">{clips.length} clips · {formatTime(totalDuration)} total</span>
          </div>
        </section>
      </div>

      <section className="shrink-0 border-t border-white/10 bg-[#0d1020]">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-5"><div className="flex items-center gap-2"><AudioLines className="h-4 w-4 text-pink-300" /><h2 className="text-xs font-bold">Timeline</h2><span className="text-[10px] text-slate-500">Arrange and trim your sequence</span></div><span className="text-[10px] tabular-nums text-slate-500">{formatTime(totalDuration)}</span></div>
        <div className="max-h-[22vh] min-h-[112px] space-y-2 overflow-auto px-3 pb-3 sm:px-5">
          <div className="flex min-w-max items-stretch gap-2">
            <div className="sticky left-0 z-10 flex w-20 shrink-0 items-center rounded-lg border border-white/10 bg-[#12172a] px-2 text-[10px] font-semibold text-slate-400">Video</div>
            {clips.length ? clips.map((item, index) => <div key={item.id} className={'flex w-36 shrink-0 flex-col justify-between rounded-lg border p-2 transition ' + (selectedId === item.id ? 'border-pink-400/60 bg-pink-500/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]')}><button type="button" onClick={() => setSelectedId(item.id)} className="flex min-w-0 items-center justify-between gap-1 text-left"><span className="truncate text-[10px] font-semibold">{index + 1}. {item.name}</span>{item.kind === 'video' ? <Video className="h-3 w-3 shrink-0 text-violet-300" /> : <ImagePlus className="h-3 w-3 shrink-0 text-cyan-300" />}</button><span className="text-[10px] text-slate-400">{formatTime(item.trimEnd - item.trimStart)}</span><span className="flex gap-1"><button type="button" onClick={() => moveClip(item.id, -1)} disabled={index === 0} className="rounded bg-white/10 p-1 text-slate-300 disabled:opacity-30" aria-label="Move clip left"><ArrowUp className="h-3 w-3" /></button><button type="button" onClick={() => moveClip(item.id, 1)} disabled={index === clips.length - 1} className="rounded bg-white/10 p-1 text-slate-300 disabled:opacity-30" aria-label="Move clip right"><ArrowDown className="h-3 w-3" /></button></span></div>) : <div className="flex min-w-[240px] flex-1 items-center rounded-lg border border-dashed border-white/10 px-4 text-[10px] text-slate-500">Your clips will appear here in sequence.</div>}
            <button type="button" onClick={() => videoInput.current?.click()} className="flex w-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-white/15 text-slate-400 hover:bg-white/5" aria-label="Add another clip"><Plus className="h-4 w-4" /></button>
          </div>
          <div className="flex min-w-max items-center gap-2"><div className="sticky left-0 z-10 flex w-20 shrink-0 items-center rounded-lg border border-white/10 bg-[#12172a] px-2 text-[10px] font-semibold text-slate-400">Audio</div>{audio ? <div className="flex min-w-[260px] flex-1 items-center gap-2 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.07] px-3 py-2"><Music2 className="h-4 w-4 shrink-0 text-cyan-200" /><span className="truncate text-[10px] font-semibold text-cyan-100">{audio.name}</span><span className="text-[10px] text-cyan-200/70">{formatTime(audio.duration)}</span></div> : <button type="button" onClick={() => audioInput.current?.click()} className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-dashed border-white/10 px-3 py-2 text-left text-[10px] text-slate-500"><Plus className="h-3 w-3" /> Add background music</button>}</div>
          <div className="flex min-w-max items-center gap-2"><div className="sticky left-0 z-10 flex w-20 shrink-0 items-center rounded-lg border border-white/10 bg-[#12172a] px-2 text-[10px] font-semibold text-slate-400">Text</div><div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.025] px-3 py-2 text-[10px] text-slate-500">{showTitle && titleText ? titleText : 'Add a title overlay from the Text panel'}</div></div>
        </div>
      </section>
      {exporting && <div className="fixed bottom-3 left-1/2 z-[100] w-[min(92vw,520px)] -translate-x-1/2 rounded-xl border border-violet-300/20 bg-[#171b2d] p-3 shadow-2xl"><div className="mb-2 flex justify-between text-[10px] text-slate-300"><span>Rendering your video</span><span>{exportProgress}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-pink-500 transition-[width]" style={{ width: exportProgress + '%' }} /></div><p className="mt-2 text-[9px] text-slate-500">Keep this tab open until the export finishes.</p></div>}
      {(error || notice) && <div className="fixed bottom-[calc(22vh+120px)] left-1/2 z-[100] w-[min(92vw,520px)] -translate-x-1/2 rounded-xl border border-white/10 bg-[#171b2d] px-4 py-3 text-xs shadow-2xl" role={error ? 'alert' : 'status'}><div className="flex items-start gap-2"><span className={error ? 'text-red-300' : 'text-emerald-300'}>{error || notice}</span><button type="button" onClick={() => { setError(''); setNotice('') }} className="ml-auto text-slate-400" aria-label="Dismiss message"><X className="h-4 w-4" /></button></div></div>}
      <div className="sr-only"><Scissors /> Video editing tools</div>
    </main>
  )
}
