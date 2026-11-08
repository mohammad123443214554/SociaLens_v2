'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createStudioAssetUrl, loadStudioProject, saveStudioProject, uploadStudioAsset } from '@/lib/studio/persistence'
import { ArrowLeft, Check, ChevronDown, Expand, ImagePlus, RotateCcw, RotateCw, Upload, X, ZoomIn, ZoomOut, Type, Square, Circle, Trash2, Eye, EyeOff, ArrowUp, ArrowDown, Undo2, Redo2 } from 'lucide-react'

type CanvasFormat = 'post' | 'portrait' | 'story' | 'custom'
type FitMode = 'cover' | 'contain'
type Layer = { id: string; kind: 'text' | 'rect' | 'circle'; text: string; color: string; x: number; y: number; size: number; visible: boolean; locked: boolean }

const FORMATS: Record<Exclude<CanvasFormat, 'custom'>, { label: string; width: number; height: number; ratio: string }> = {
  post: { label: 'Square Post', width: 1080, height: 1080, ratio: '1:1' },
  portrait: { label: 'Portrait Post', width: 1080, height: 1350, ratio: '4:5' },
  story: { label: 'Story', width: 1080, height: 1920, ratio: '9:16' },
}
const BACKGROUNDS = ['#ffffff', '#0f172a', '#111827', '#fce7f3', '#ede9fe', '#dbeafe', '#dcfce7', '#fef3c7', '#000000']
const TEMPLATE_STYLES: Record<string, { from: string; to: string; accent: string; eyebrow: string }> = {
  'aurora-launch': { from: '#21113f', to: '#c026d3', accent: '#f9a8d4', eyebrow: 'NEW COLLECTION' },
  'daily-inspiration': { from: '#102c43', to: '#0ea5e9', accent: '#a5f3fc', eyebrow: 'A LITTLE INSPIRATION' },
  'midnight-story': { from: '#111827', to: '#7c3aed', accent: '#f0abfc', eyebrow: 'YOUR STORY' },
  'weekend-sale': { from: '#431407', to: '#f97316', accent: '#fde68a', eyebrow: 'LIMITED OFFER' },
  'event-invite': { from: '#172554', to: '#6366f1', accent: '#c4b5fd', eyebrow: 'YOU ARE INVITED' },
  'creator-cover': { from: '#3b0764', to: '#d946ef', accent: '#f5d0fe', eyebrow: 'CREATOR EDITION' },
  'soft-brand-kit': { from: '#134e4a', to: '#14b8a6', accent: '#99f6e4', eyebrow: 'MEET THE BRAND' },
  'travel-diary': { from: '#422006', to: '#d97706', accent: '#fde68a', eyebrow: 'TRAVEL DIARY' },
}
const MAX_IMAGE_BYTES = 20 * 1024 * 1024

export function StudioPhotoEditor({ projectName, templateId, projectId }: { projectName: string; templateId: string; projectId: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [format, setFormat] = useState<CanvasFormat>('post')
  const [customWidth, setCustomWidth] = useState(1080)
  const [customHeight, setCustomHeight] = useState(1080)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [background, setBackground] = useState('#ffffff')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageName, setImageName] = useState('')
  const [imagePath, setImagePath] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState('Loading project…')
  const [hydrated, setHydrated] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveSequence = useRef(0)
  const [fit, setFit] = useState<FitMode>('cover')
  const [rotation, setRotation] = useState(0)
  const [zoom, setZoom] = useState(70)
  const [error, setError] = useState('')
  const [showBackgrounds, setShowBackgrounds] = useState(true)
  const template = TEMPLATE_STYLES[templateId]
  const dimensions = format === 'custom' ? { label: 'Custom canvas', width: customWidth, height: customHeight, ratio: (customWidth / customHeight).toFixed(2) + ':1' } : FORMATS[format]
  const canvasScale = useMemo(() => Math.min(zoom / 100, 1), [zoom])

  useEffect(() => () => { if (imageUrl?.startsWith('blob:')) URL.revokeObjectURL(imageUrl) }, [imageUrl])

  useEffect(() => {
    let active = true
    const restore = async () => {
      try {
        const row = await loadStudioProject(projectId, 'photo')
        if (!active) return
        if (row?.data) {
          const data = row.data as Record<string, unknown>
          if (['post', 'portrait', 'story', 'custom'].includes(String(data.format))) setFormat(data.format as CanvasFormat)
          if (typeof data.customWidth === 'number') setCustomWidth(data.customWidth)
          if (typeof data.customHeight === 'number') setCustomHeight(data.customHeight)
          if (typeof data.background === 'string') setBackground(data.background)
          if (typeof data.fit === 'string') setFit(data.fit as FitMode)
          if (typeof data.rotation === 'number') setRotation(data.rotation)
          if (typeof data.zoom === 'number') setZoom(data.zoom)
          if (Array.isArray(data.layers)) setLayers(data.layers as Layer[])
          if (typeof data.imageName === 'string') setImageName(data.imageName)
          if (typeof data.imagePath === 'string' && data.imagePath) {
            setImagePath(data.imagePath)
            setImageUrl(await createStudioAssetUrl(data.imagePath))
          }
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
          id: projectId,
          project_type: 'photo',
          name: projectName,
          template_id: templateId || null,
          data: { format, customWidth, customHeight, background, fit, rotation, zoom, imageName, imagePath, layers },
        })
        if (sequence === saveSequence.current) setSaveStatus('All changes saved')
      } catch (cause) {
        if (sequence === saveSequence.current) setSaveStatus(cause instanceof Error ? cause.message : 'Save failed')
      }
    }, 900)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [hydrated, projectId, projectName, templateId, format, customWidth, customHeight, background, fit, rotation, zoom, imageName, imagePath, layers])

  const importImage = async (file?: File) => {
    if (!file) return
    setError('')
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'].includes(file.type)) {
      setError('Please choose a JPG, PNG, WebP, AVIF or GIF image.')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('Image is larger than 20 MB. Choose a smaller image to keep the editor fast.')
      return
    }
    setSaveStatus('Uploading image…')
    let uploadedPath: string
    try { uploadedPath = await uploadStudioAsset(projectId, file) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Image upload failed.'); setSaveStatus('Upload failed'); return }
    const nextUrl = URL.createObjectURL(file)
    setImagePath(uploadedPath)
    setImageUrl(current => {
      if (current) URL.revokeObjectURL(current)
      return nextUrl
    })
    setImageName(file.name)
    setRotation(0)
  }

  const [layers, setLayers] = useState<Layer[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [history, setHistory] = useState<Layer[][]>([])
  const [redoStack, setRedoStack] = useState<Layer[][]>([])
  const selected = layers.find(item => item.id === selectedId) || null
  const commitLayers = (next: Layer[]) => { setHistory(items => [...items.slice(-39), layers]); setRedoStack([]); setLayers(next) }
  const addLayer = (kind: Layer['kind']) => { const item: Layer = { id: 'layer-' + Date.now(), kind, text: kind === 'text' ? 'Your text' : '', color: '#ffffff', x: 50, y: 50, size: kind === 'text' ? 32 : 24, visible: true, locked: false }; commitLayers([...layers, item]); setSelectedId(item.id) }
  const editLayer = (patch: Partial<Layer>) => { if (!selected || selected.locked) return; commitLayers(layers.map(item => item.id === selected.id ? { ...item, ...patch } : item)) }
  const undo = () => { if (!history.length) return; setRedoStack(items => [layers, ...items].slice(0, 40)); setLayers(history[history.length - 1]); setHistory(items => items.slice(0, -1)) }
  const redo = () => { if (!redoStack.length) return; setHistory(items => [...items.slice(-39), layers]); setLayers(redoStack[0]); setRedoStack(items => items.slice(1)) }
  const reorder = (direction: number) => { if (!selected || selected.locked) return; const index = layers.findIndex(item => item.id === selected.id); const target = index + direction; if (target < 0 || target >= layers.length) return; const next = [...layers]; [next[index], next[target]] = [next[target], next[index]]; commitLayers(next) }

  const exportImage = async (type: 'image/png' | 'image/jpeg') => {
    setExportError('')
    setExporting(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = dimensions.width
      canvas.height = dimensions.height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Your browser could not create the export canvas.')
      ctx.fillStyle = background
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      if (template && !imageUrl) {
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
        gradient.addColorStop(0, template.from)
        gradient.addColorStop(1, template.to)
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = template.accent
        ctx.font = '700 ' + Math.round(canvas.width * 0.018) + 'px Arial'
        ctx.fillText(template.eyebrow, canvas.width * 0.09, canvas.height * 0.13)
        ctx.fillRect(canvas.width * 0.09, canvas.height * 0.67, canvas.width * 0.18, Math.max(5, canvas.width * 0.004))
        ctx.fillStyle = '#ffffff'
        ctx.font = '900 ' + Math.round(canvas.width * 0.075) + 'px Arial'
        const title = projectName || 'Your creative idea'
        const words = title.split(' ')
        let line = ''
        let y = canvas.height * 0.76
        for (const word of words) {
          const candidate = line ? line + ' ' + word : word
          if (ctx.measureText(candidate).width > canvas.width * 0.82 && line) {
            ctx.fillText(line, canvas.width * 0.09, y)
            y += canvas.width * 0.085
            line = word
          } else line = candidate
        }
        if (line) ctx.fillText(line, canvas.width * 0.09, y)
        ctx.fillStyle = 'rgba(255,255,255,.72)'
        ctx.font = Math.round(canvas.width * 0.018) + 'px Arial'
        ctx.fillText('Make something worth sharing.', canvas.width * 0.09, canvas.height * 0.88)
        ctx.fillText('SOCIALENS STUDIO', canvas.width * 0.09, canvas.height * 0.95)
      }
      if (imageUrl) {
        const image = new Image()
        image.src = imageUrl
        await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('The selected image could not be loaded for export.')) })
        ctx.save()
        ctx.translate(canvas.width / 2, canvas.height / 2)
        ctx.rotate(rotation * Math.PI / 180)
        const rotatedWidth = rotation % 180 === 0 ? canvas.width : canvas.height
        const rotatedHeight = rotation % 180 === 0 ? canvas.height : canvas.width
        const scale = fit === 'cover' ? Math.max(rotatedWidth / image.width, rotatedHeight / image.height) : Math.min(rotatedWidth / image.width, rotatedHeight / image.height)
        ctx.drawImage(image, -image.width * scale / 2, -image.height * scale / 2, image.width * scale, image.height * scale)
        ctx.restore()
      }
      for (const layer of layers.filter(item => item.visible)) {
        const x = canvas.width * layer.x / 100
        const y = canvas.height * layer.y / 100
        const size = canvas.width * layer.size / 1080
        ctx.save()
        ctx.fillStyle = layer.color
        if (layer.kind === 'text') {
          ctx.font = '700 ' + size + 'px Arial'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          const maxWidth = canvas.width * 0.84
          const lines: string[] = []
          let line = ''
          for (const word of layer.text.split(' ')) {
            const candidate = line ? line + ' ' + word : word
            if (ctx.measureText(candidate).width > maxWidth && line) { lines.push(line); line = word } else line = candidate
          }
          if (line) lines.push(line)
          const lineHeight = size * 1.2
          lines.forEach((value, index) => ctx.fillText(value, x, y + (index - (lines.length - 1) / 2) * lineHeight, maxWidth))
        } else {
          const shapeSize = size * 3
          if (layer.kind === 'rect') ctx.fillRect(x - shapeSize / 2, y - shapeSize / 2, shapeSize, shapeSize)
          else { ctx.beginPath(); ctx.arc(x, y, shapeSize / 2, 0, Math.PI * 2); ctx.fill() }
        }
        ctx.restore()
      }
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Image encoding failed. Try PNG or a smaller canvas.')), type, type === 'image/jpeg' ? 0.92 : undefined))
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = (projectName || 'socialens-design').replace(/[^a-z0-9-_]+/gi, '-').slice(0, 60) + (type === 'image/png' ? '.png' : '.jpg')
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 30000)
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : 'Export failed. Please try again.')
    } finally { setExporting(false) }
  }

  const backUrl = '/studio?step=templates&mode=photo&created=1&name=' + encodeURIComponent(projectName) + (templateId ? '&template=' + encodeURIComponent(templateId) : '')

  return (
    <main className="fixed inset-0 z-[70] flex min-h-dvh flex-col overflow-hidden bg-[#080a13] text-white">
      <header className="z-20 flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#0d1020] px-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={backUrl} aria-label="Back to templates" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 text-slate-300 hover:bg-white/10"><ArrowLeft className="h-4 w-4" /></Link>
          <div className="min-w-0"><p className="truncate text-sm font-bold">Photo Editor</p><p className="max-w-[38vw] truncate text-[11px] text-slate-500">{projectName || 'Untitled photo project'}</p></div>
        </div>
        <div className="flex items-center gap-2"><span className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10px] text-slate-400 sm:flex"><Check className="h-3.5 w-3.5 text-emerald-400" /> {saveStatus}</span><button type="button" disabled={exporting} onClick={() => void exportImage('image/png')} className="inline-flex h-9 items-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 to-violet-600 px-3 text-[10px] font-bold text-white disabled:opacity-50">{exporting ? 'Exporting…' : 'Export PNG'}</button><button type="button" disabled={exporting} onClick={() => void exportImage('image/jpeg')} className="hidden h-9 items-center rounded-xl border border-white/10 px-3 text-[10px] font-semibold text-slate-200 hover:bg-white/5 sm:inline-flex">JPG</button></div>
        <Link href="/studio" className="rounded-lg px-3 py-2 text-xs font-medium text-slate-400 hover:bg-white/5 hover:text-white">Exit</Link>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="order-2 z-10 flex max-h-[42vh] shrink-0 flex-col gap-4 overflow-y-auto border-t border-white/10 bg-[#0d1020] p-4 lg:order-1 lg:max-h-none lg:w-[300px] lg:border-r lg:border-t-0 lg:p-5">
          <section>
            <div className="mb-3 flex items-center justify-between"><h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">Canvas size</h2><span className="text-[10px] text-slate-500">1080 px wide</span></div>
            <div className="grid grid-cols-3 gap-2">{(Object.keys(FORMATS) as Exclude<CanvasFormat, 'custom'>[]).map(key => <button key={key} type="button" onClick={() => setFormat(key)} className={'rounded-xl border p-2 text-left transition ' + (format === key ? 'border-pink-400/60 bg-pink-500/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]')}><div className="mb-2 flex h-12 items-center justify-center"><div className={'border-2 rounded-[3px] ' + (format === key ? 'border-pink-300' : 'border-slate-500')} style={{ width: key === 'post' ? 36 : 30, height: key === 'post' ? 36 : key === 'portrait' ? 43 : 52 }} /></div><p className="text-[10px] font-semibold text-white">{FORMATS[key].label}</p><p className="mt-0.5 text-[9px] text-slate-500">{FORMATS[key].ratio}</p></button>)}</div>
            <button type="button" onClick={() => setFormat('custom')} className={'mt-2 w-full rounded-xl border px-3 py-2 text-left text-[10px] font-semibold ' + (format === 'custom' ? 'border-pink-400/60 bg-pink-500/10 text-pink-200' : 'border-white/10 text-slate-300')}>Custom canvas size</button>
            {format === 'custom' && <div className="mt-2 grid grid-cols-2 gap-2"><label className="text-[10px] text-slate-400">Width (px)<input type="number" min="64" max="4096" value={customWidth} onChange={event => setCustomWidth(Math.min(4096, Math.max(64, Number(event.target.value) || 64)))} className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-black/20 px-2 text-xs text-white" /></label><label className="text-[10px] text-slate-400">Height (px)<input type="number" min="64" max="4096" value={customHeight} onChange={event => setCustomHeight(Math.min(4096, Math.max(64, Number(event.target.value) || 64)))} className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-black/20 px-2 text-xs text-white" /></label><p className="col-span-2 text-[9px] text-slate-500">64–4096 px per side. Export uses the exact dimensions.</p></div>}
            <p className="mt-2 text-[10px] text-slate-500">{dimensions.width} × {dimensions.height} px · {dimensions.label}</p>
          </section>

          <div className="h-px bg-white/[0.08]" />
          <section>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-300">Photo</h2>
            <button type="button" onClick={() => inputRef.current?.click()} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 to-violet-600 text-xs font-bold text-white transition hover:brightness-110"><ImagePlus className="h-4 w-4" /> {imageUrl ? 'Replace photo' : 'Upload photo'}</button>
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" className="hidden" onChange={event => { importImage(event.target.files?.[0]); event.currentTarget.value = '' }} />
            {imageUrl ? <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"><div className="flex items-center gap-2"><img src={imageUrl} alt="Selected upload thumbnail" className="h-12 w-12 rounded-lg object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-semibold text-slate-200">{imageName}</p><p className="text-[10px] text-emerald-300">Ready on canvas</p></div><button type="button" onClick={() => { setImageUrl(null); setImageName(''); setImagePath(null); setRotation(0) }} aria-label="Remove photo" className="rounded-lg p-2 text-slate-400 hover:bg-red-500/10 hover:text-red-300"><X className="h-4 w-4" /></button></div><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => setFit('cover')} className={'rounded-lg border py-2 text-[10px] font-semibold ' + (fit === 'cover' ? 'border-pink-400/50 bg-pink-500/10 text-pink-200' : 'border-white/10 text-slate-400')}>Fill canvas</button><button type="button" onClick={() => setFit('contain')} className={'rounded-lg border py-2 text-[10px] font-semibold ' + (fit === 'contain' ? 'border-pink-400/50 bg-pink-500/10 text-pink-200' : 'border-white/10 text-slate-400')}>Fit photo</button></div><div className="mt-3 flex gap-2"><button type="button" onClick={() => setRotation(value => (value - 90 + 360) % 360)} className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/10 py-2 text-[10px] text-slate-300 hover:bg-white/5"><RotateCcw className="h-3.5 w-3.5" /> Rotate left</button><button type="button" onClick={() => setRotation(value => (value + 90) % 360)} className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/10 py-2 text-[10px] text-slate-300 hover:bg-white/5"><RotateCw className="h-3.5 w-3.5" /> Rotate right</button></div></div> : <p className="mt-2 text-[10px] leading-4 text-slate-500">Add a photo from your device. JPG, PNG, WebP, AVIF and GIF up to 20 MB.</p>}
            {error && <p role="alert" className="mt-2 rounded-lg border border-red-400/20 bg-red-400/10 p-2 text-[10px] leading-4 text-red-200">{error}</p>}
          </section>

          <div className="h-px bg-white/[0.08]" />
          <div className="h-px bg-white/[0.08]" />
          <section><h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-300">Add elements</h2><div className="grid grid-cols-3 gap-2"><button type="button" onClick={() => addLayer('text')} className="flex flex-col items-center gap-1 rounded-xl border border-white/10 p-3 text-[10px] text-slate-300 hover:bg-pink-500/10"><Type className="h-5 w-5"/>Text</button><button type="button" onClick={() => addLayer('rect')} className="flex flex-col items-center gap-1 rounded-xl border border-white/10 p-3 text-[10px] text-slate-300 hover:bg-pink-500/10"><Square className="h-5 w-5"/>Rectangle</button><button type="button" onClick={() => addLayer('circle')} className="flex flex-col items-center gap-1 rounded-xl border border-white/10 p-3 text-[10px] text-slate-300 hover:bg-pink-500/10"><Circle className="h-5 w-5"/>Circle</button></div>
{selected && <div className="mt-3 space-y-3 rounded-xl border border-pink-400/20 bg-pink-500/[0.05] p-3"><div className="flex items-center justify-between"><span className="text-[10px] font-bold text-pink-200">Edit selected layer</span><button type="button" onClick={() => { commitLayers(layers.filter(item => item.id !== selected.id)); setSelectedId(null) }} className="p-1 text-red-300" aria-label="Delete layer"><Trash2 className="h-4 w-4"/></button></div>{selected.kind === 'text' && <label className="block text-[10px] text-slate-400">Text<input value={selected.text} maxLength={180} onChange={event => editLayer({ text: event.target.value })} className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-black/20 px-2 text-xs text-white"/></label>}<div className="grid grid-cols-2 gap-2"><label className="text-[10px] text-slate-400">Color<input type="color" value={selected.color} onChange={event => editLayer({ color: event.target.value })} className="mt-1 h-8 w-full"/></label><label className="text-[10px] text-slate-400">Size<input type="range" min="8" max="100" value={selected.size} onChange={event => editLayer({ size: Number(event.target.value) })} className="mt-2 w-full accent-pink-500"/></label></div><label className="block text-[10px] text-slate-400">Horizontal position<input type="range" min="5" max="95" value={selected.x} onChange={event => editLayer({ x: Number(event.target.value) })} className="mt-1 w-full accent-pink-500"/></label><label className="block text-[10px] text-slate-400">Vertical position<input type="range" min="5" max="95" value={selected.y} onChange={event => editLayer({ y: Number(event.target.value) })} className="mt-1 w-full accent-pink-500"/></label></div>}
<div className="mt-3"><div className="mb-2 flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Layers ({layers.length})</span><div className="flex gap-1"><button type="button" disabled={!history.length} onClick={undo} aria-label="Undo" className="rounded border border-white/10 p-1.5 disabled:opacity-30"><Undo2 className="h-3.5 w-3.5"/></button><button type="button" disabled={!redoStack.length} onClick={redo} aria-label="Redo" className="rounded border border-white/10 p-1.5 disabled:opacity-30"><Redo2 className="h-3.5 w-3.5"/></button></div></div>{layers.length ? [...layers].reverse().map(item => <div key={item.id} className={'mb-1 flex items-center gap-1 rounded-lg border p-1.5 ' + (selectedId === item.id ? 'border-pink-400/40 bg-pink-500/10' : 'border-white/[0.07]')}><button type="button" onClick={() => setSelectedId(item.id)} className="min-w-0 flex-1 truncate text-left text-[10px] text-slate-200">{item.kind === 'text' ? item.text || 'Text' : item.kind === 'rect' ? 'Rectangle' : 'Circle'}</button><button type="button" onClick={() => commitLayers(layers.map(layer => layer.id === item.id ? { ...layer, visible: !layer.visible } : layer))} aria-label="Toggle visibility" className="p-1 text-slate-400">{item.visible ? <Eye className="h-3.5 w-3.5"/> : <EyeOff className="h-3.5 w-3.5"/>}</button><button type="button" onClick={() => commitLayers(layers.map(layer => layer.id === item.id ? { ...layer, locked: !layer.locked } : layer))} className="px-1 text-[9px] text-slate-400">{item.locked ? 'Unlock' : 'Lock'}</button></div>) : <p className="text-[10px] text-slate-500">Add text or a shape to create your first layer.</p>}<div className="mt-2 flex gap-2"><button type="button" disabled={!selected || selected.locked} onClick={() => reorder(-1)} className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-white/10 py-2 text-[10px] text-slate-300 disabled:opacity-30"><ArrowDown className="h-3 w-3"/>Back</button><button type="button" disabled={!selected || selected.locked} onClick={() => reorder(1)} className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-white/10 py-2 text-[10px] text-slate-300 disabled:opacity-30"><ArrowUp className="h-3 w-3"/>Front</button></div></div></section>
          <section>
            <button type="button" onClick={() => setShowBackgrounds(value => !value)} className="flex w-full items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-300"><span>Background</span><ChevronDown className={'h-4 w-4 transition ' + (showBackgrounds ? 'rotate-180' : '')} /></button>
            {showBackgrounds && <><div className="mt-3 grid grid-cols-5 gap-2">{BACKGROUNDS.map(color => <button key={color} type="button" onClick={() => setBackground(color)} aria-label={'Set background ' + color} className={'h-8 rounded-lg border transition ' + (background === color ? 'border-pink-300 ring-2 ring-pink-400/30' : 'border-white/15')} style={{ backgroundColor: color }} />)}</div><label className="mt-3 flex items-center justify-between text-[10px] text-slate-400">Custom color<input type="color" value={background} onChange={event => setBackground(event.target.value)} className="h-8 w-12 cursor-pointer rounded border-0 bg-transparent" /></label></>}
          </section>
          {exportError && <p role="alert" className="rounded-lg border border-red-400/20 bg-red-400/10 p-2 text-[10px] leading-4 text-red-200">{exportError}</p>}
          <p className="mt-auto hidden text-[10px] leading-4 text-slate-600 lg:block">Export creates a full-resolution PNG or JPG locally in your browser. Cloud saving and drafts arrive in a later Studio stage.</p>
        </aside>

        <section className="order-1 flex min-h-0 min-w-0 flex-1 flex-col bg-[radial-gradient(ellipse_at_50%_45%,rgba(65,55,105,0.22),transparent_55%),#080a13] lg:order-2">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3 sm:px-6">
            <div><p className="text-xs font-semibold text-slate-200">Design canvas</p><p className="mt-0.5 text-[10px] text-slate-500">{dimensions.width} × {dimensions.height} px</p></div>
            <div className="flex items-center gap-2"><button type="button" disabled={!history.length} onClick={undo} aria-label="Undo" className="rounded-lg border border-white/10 p-2 text-slate-300 disabled:opacity-30"><Undo2 className="h-4 w-4"/></button><button type="button" disabled={!redoStack.length} onClick={redo} aria-label="Redo" className="rounded-lg border border-white/10 p-2 text-slate-300 disabled:opacity-30"><Redo2 className="h-4 w-4"/></button><button type="button" onClick={() => setZoom(value => Math.max(25, value - 10))} aria-label="Zoom out" className="rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/5"><ZoomOut className="h-4 w-4" /></button><span className="w-10 text-center text-[10px] tabular-nums text-slate-400">{zoom}%</span><button type="button" onClick={() => setZoom(value => Math.min(100, value + 10))} aria-label="Zoom in" className="rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/5"><ZoomIn className="h-4 w-4" /></button><button type="button" onClick={() => setZoom(70)} className="ml-1 rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/5" aria-label="Fit canvas"><Expand className="h-4 w-4" /></button></div>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4 sm:p-7">
            <div className="relative shrink-0 overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.55)] ring-1 ring-white/15 transition-[width,height] duration-200" style={{ width: Math.min(360, Math.max(180, 250 * dimensions.width / dimensions.height + 110)) * canvasScale, aspectRatio: dimensions.width + '/' + dimensions.height, backgroundColor: background }}>
              {template && !imageUrl && <div className="absolute inset-0 flex flex-col justify-between overflow-hidden p-[9%] text-white" style={{ background: 'linear-gradient(145deg,' + template.from + ',' + template.to + ')' }}><div className="absolute -right-[18%] -top-[8%] h-[55%] w-[75%] rounded-full border border-white/20" /><div className="relative text-[clamp(7px,1.1vw,11px)] font-bold tracking-[0.22em]" style={{ color: template.accent }}>{template.eyebrow}</div><div className="relative"><div className="mb-3 h-1 w-[18%] rounded-full" style={{ background: template.accent }} /><h2 className="max-w-[90%] text-[clamp(22px,4vw,48px)] font-black leading-[0.96] tracking-tight">{projectName || 'Your creative idea'}</h2><p className="mt-4 max-w-[75%] text-[clamp(8px,1.1vw,13px)] leading-relaxed text-white/70">Make something worth sharing.</p></div><div className="relative flex items-center justify-between text-[clamp(7px,1vw,10px)] font-semibold tracking-widest text-white/75"><span>SOCIALENS STUDIO</span><span>01 / 01</span></div></div>}
              {imageUrl && <img src={imageUrl} alt="Photo on the design canvas" draggable={false} className="absolute inset-0 h-full w-full select-none" style={{ objectFit: fit, transform: 'rotate(' + rotation + 'deg)' }} />}
              {layers.filter(item => item.visible).map(item => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className="absolute z-10 -translate-x-1/2 -translate-y-1/2 whitespace-pre-wrap text-center" style={{ left: item.x + '%', top: item.y + '%', color: item.color, fontSize: item.size * canvasScale, fontWeight: item.kind === 'text' ? 700 : 400, width: item.kind === 'text' ? '84%' : item.size * 3 * canvasScale, height: item.kind === 'text' ? 'auto' : item.size * 3 * canvasScale, background: item.kind === 'rect' ? item.color : 'transparent', borderRadius: item.kind === 'circle' ? '50%' : '2px', outline: selectedId === item.id ? '1px dashed #f472b6' : 'none' }}>{item.kind === 'text' ? item.text : ''}</button>)}
              {!template && !imageUrl && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center"><div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-400/20 bg-slate-400/10"><ImagePlus className="h-6 w-6 text-slate-400" /></div><p className="text-sm font-semibold" style={{ color: background === '#ffffff' || background.startsWith('#f') ? '#334155' : '#e2e8f0' }}>Your blank canvas</p><p className="text-[10px]" style={{ color: background === '#ffffff' || background.startsWith('#f') ? '#64748b' : '#94a3b8' }}>Upload a photo to start designing</p><button type="button" onClick={() => inputRef.current?.click()} className="rounded-lg bg-gradient-to-r from-pink-500 to-violet-600 px-4 py-2 text-[10px] font-bold text-white"><Upload className="mr-1 inline h-3 w-3" /> Add photo</button></div>}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] px-4 py-3 text-[10px] text-slate-500 sm:px-6"><span>{imageUrl ? '1 photo on canvas' : template ? 'Template starting point' : 'Blank canvas'} · {dimensions.ratio}</span><span>Photo Editor · {layers.length} editable layers</span></div>
        </section>
      </div>
    </main>
  )
}
