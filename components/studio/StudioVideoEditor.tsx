'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
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
}
type AudioTrack = { id: string; name: string; url: string; duration: number; fileSize: number }

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

export function StudioVideoEditor({ projectName, templateId }: { projectName: string; templateId: string }) {
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
  const selected = clips.find(item => item.id === selectedId) || clips[0] || null
  const totalDuration = useMemo(() => clips.reduce((sum, item) => sum + Math.max(0.1, item.trimEnd - item.trimStart), 0), [clips])
  const currentDuration = selected ? Math.max(0, selected.trimEnd - selected.trimStart) : 0
  const backUrl = '/studio?step=templates&mode=video&created=1&name=' + encodeURIComponent(projectName) + (templateId ? '&template=' + encodeURIComponent(templateId) : '')

  useEffect(() => () => {
    objectUrls.current.forEach(url => URL.revokeObjectURL(url))
    objectUrls.current.clear()
  }, [])

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
        <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10px] text-slate-400 sm:flex"><Check className="h-3.5 w-3.5 text-emerald-400" /> Editing workspace</div>
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
              {(['9:16', '16:9', '1:1'] as const).map(item => <button key={item} type="button" onClick={() => setAspect(item)} className={'rounded-lg border py-2 text-[10px] font-semibold ' + (aspect === item ? 'border-pink-400/50 bg-pink-500/10 text-pink-200' : 'border-white/10 text-slate-400')}>{item}</button>)}
            </div>
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
      {(error || notice) && <div className="fixed bottom-[calc(22vh+120px)] left-1/2 z-[100] w-[min(92vw,520px)] -translate-x-1/2 rounded-xl border border-white/10 bg-[#171b2d] px-4 py-3 text-xs shadow-2xl" role={error ? 'alert' : 'status'}><div className="flex items-start gap-2"><span className={error ? 'text-red-300' : 'text-emerald-300'}>{error || notice}</span><button type="button" onClick={() => { setError(''); setNotice('') }} className="ml-auto text-slate-400" aria-label="Dismiss message"><X className="h-4 w-4" /></button></div></div>}
      <div className="sr-only"><Scissors /> Video editing tools</div>
    </main>
  )
}
