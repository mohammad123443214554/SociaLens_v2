'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, ImagePlus, Search, X } from 'lucide-react'
import { SHAPECUT_CATEGORIES, SHAPECUT_SHAPES, getShapeCutPath, searchShapeCutShapes } from '@/lib/utils/shapeCut'
import type { StoryShapeCutOverlay } from '@/lib/types/database.types'

export function ShapeCutModal({ initialShapeCut, onClose, onSave }: {
  initialShapeCut?: StoryShapeCutOverlay | null
  onClose: () => void
  onSave: (sticker: StoryShapeCutOverlay) => void
}) {
  const [file, setFile] = useState<File | null>(initialShapeCut?.file ?? null)
  const [photoUrl, setPhotoUrl] = useState(initialShapeCut?.photoUrl ?? '')
  const [shapeId, setShapeId] = useState(initialShapeCut?.shapeId ?? SHAPECUT_SHAPES[0].id)
  const [category, setCategory] = useState<(typeof SHAPECUT_CATEGORIES)[number]>(initialShapeCut?.category ?? 'Basic')
  const [search, setSearch] = useState('')
  const [zoom, setZoom] = useState(initialShapeCut?.zoom ?? 1)
  const [cropX, setCropX] = useState(initialShapeCut?.cropX ?? 0)
  const [cropY, setCropY] = useState(initialShapeCut?.cropY ?? 0)
  const [borderColor, setBorderColor] = useState(initialShapeCut?.borderColor ?? '#ffffff')
  const [borderWidth, setBorderWidth] = useState(initialShapeCut?.borderWidth ?? 2)
  const [error, setError] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  useEffect(() => {
    if (!file) { setPreviewUrl(photoUrl); return }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file, photoUrl])
  const visibleShapes = useMemo(() => search.trim() ? searchShapeCutShapes(search) : SHAPECUT_SHAPES.filter(s => s.category === category), [search, category])
  const shapePath = getShapeCutPath(shapeId)
  const chooseFile = (next: File | undefined) => {
    if (!next) return
    if (!next.type.startsWith('image/')) { setError('Choose an image file.'); return }
    if (next.size > 15 * 1024 * 1024) { setError('Photo must be 15 MB or smaller.'); return }
    setFile(next); setPhotoUrl(''); setError('')
  }
  const save = () => {
    if (!file && !photoUrl) { setError('Choose a photo to create your ShapeCut sticker.'); return }
    onSave({
      id: initialShapeCut?.id || globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2),
      shapeId, category, file: file || undefined, photoUrl: photoUrl || undefined,
      cropX, cropY, zoom, borderColor, borderWidth,
      x: initialShapeCut?.x ?? 50, y: initialShapeCut?.y ?? 50,
      scale: initialShapeCut?.scale ?? 1, rotation: initialShapeCut?.rotation ?? 0,
    })
  }
  return <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/75 p-3 sm:p-5" role="dialog" aria-modal="true" aria-label="ShapeCut editor" onClick={onClose}>
    <div className="flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-2xl" onClick={e => e.stopPropagation()}>
      <header className="flex items-center justify-between border-b border-border p-4"><div><h2 className="text-lg font-bold">ShapeCut</h2><p className="text-xs text-muted-foreground">Clip a photo into a creative shape</p></div><button type="button" onClick={onClose} aria-label="Close ShapeCut" className="rounded-full p-2 hover:bg-muted"><X className="h-5 w-5"/></button></header>
      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-3 md:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] md:p-4">
        <div className="flex min-h-[260px] items-center justify-center rounded-xl bg-neutral-950 p-4">
          <div className="relative aspect-square w-full max-w-[320px]">
            {previewUrl ? <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible" role="img" aria-label={`Photo clipped to ${SHAPECUT_SHAPES.find(s=>s.id===shapeId)?.name || 'selected shape'}`}>
              <defs><clipPath id="shapecut-preview-mask"><path d={shapePath}/></clipPath></defs>
              <image href={previewUrl} x={-cropX} y={-cropY} width={100*zoom} height={100*zoom} preserveAspectRatio="xMidYMid slice" clipPath="url(#shapecut-preview-mask)"/>
              <path d={shapePath} fill="none" stroke={borderColor} strokeWidth={borderWidth} vectorEffect="non-scaling-stroke"/>
            </svg> : <label className="flex h-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/30 text-white/80"><ImagePlus className="h-10 w-10"/><span className="text-sm font-semibold">Choose a photo</span><input type="file" accept="image/*" className="sr-only" onChange={e=>{chooseFile(e.target.files?.[0]);e.currentTarget.value=''}}/></label>}
          </div>
        </div>
        <div className="min-w-0 space-y-4">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border p-3 text-sm font-semibold hover:bg-muted"><ImagePlus className="h-4 w-4"/> {previewUrl ? 'Change photo' : 'Choose photo'}<input type="file" accept="image/*" className="sr-only" onChange={e=>{chooseFile(e.target.files?.[0]);e.currentTarget.value=''}}/></label>
          <label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2"><Search className="h-4 w-4 text-muted-foreground"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search 120 shapes" className="min-w-0 flex-1 bg-transparent text-sm outline-none"/></label>
          <div className="flex gap-1.5 overflow-x-auto pb-1">{SHAPECUT_CATEGORIES.map(item=><button key={item} type="button" onClick={()=>{setCategory(item);setSearch('')}} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${category===item&&!search?'border-primary bg-primary/10':'border-border hover:bg-muted'}`}>{item}</button>)}</div>
          <div className="grid max-h-[260px] grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-5">
            {visibleShapes.map(shape=><button key={shape.id} type="button" title={shape.name} aria-label={shape.name} aria-pressed={shapeId===shape.id} onClick={()=>{setShapeId(shape.id);setCategory(shape.category)}} className={`flex min-w-0 flex-col items-center gap-1 rounded-lg border p-2 ${shapeId===shape.id?'border-primary bg-primary/10 ring-1 ring-primary':'border-border hover:bg-muted'}`}><svg viewBox="0 0 100 100" className="h-9 w-9"><path d={getShapeCutPath(shape.id)} fill={shapeId===shape.id?'currentColor':'currentColor'} fillOpacity={shapeId===shape.id?0.9:0.55}/></svg><span className="w-full truncate text-[10px]">{shape.name}</span></button>)}
          </div>
          <div className="space-y-3 rounded-xl border border-border p-3">
            <label className="block text-xs font-medium">Photo zoom <span className="float-right tabular-nums">{zoom.toFixed(1)}×</span><input aria-label="Photo zoom" type="range" min="1" max="2.5" step="0.05" value={zoom} onChange={e=>setZoom(Number(e.target.value))} className="mt-2 w-full"/></label>
            <label className="block text-xs font-medium">Crop horizontal <input aria-label="Crop horizontal" type="range" min="-50" max="50" value={cropX} onChange={e=>setCropX(Number(e.target.value))} className="mt-2 w-full"/></label>
            <label className="block text-xs font-medium">Crop vertical <input aria-label="Crop vertical" type="range" min="-50" max="50" value={cropY} onChange={e=>setCropY(Number(e.target.value))} className="mt-2 w-full"/></label>
            <div className="flex items-center gap-3"><label className="flex-1 text-xs font-medium">Border color<input aria-label="Border color" type="color" value={borderColor} onChange={e=>setBorderColor(e.target.value)} className="mt-1 h-9 w-full cursor-pointer rounded border border-border bg-background p-1"/></label><label className="flex-1 text-xs font-medium">Border width <span className="float-right">{borderWidth}px</span><input aria-label="Border width" type="range" min="0" max="8" value={borderWidth} onChange={e=>setBorderWidth(Number(e.target.value))} className="mt-3 w-full"/></label></div>
            {error&&<p role="alert" className="text-xs text-red-500">{error}</p>}
          </div>
        </div>
      </div>
      <footer className="flex shrink-0 gap-2 border-t border-border p-3 sm:p-4"><button type="button" onClick={onClose} className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold">Cancel</button><button type="button" onClick={save} className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"><Check className="mr-2 inline h-4 w-4"/>Add ShapeCut</button></footer>
    </div>
  </div>
}
