'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ImagePlus, LayoutGrid, Trash2, X, ArrowDown, ArrowUp } from 'lucide-react'
import type { StoryCollageOverlay, StoryCollagePhoto } from '@/lib/types/database.types'
import { getPhotoCollagePositions, isValidPhotoCollageCount } from '@/lib/utils/photoCollage'

type Layout = StoryCollageOverlay['layout']
const layouts: { id: Layout; label: string; description: string }[] = [
  { id: 'grid', label: 'Grid', description: 'Balanced photo tiles' },
  { id: 'horizontal', label: 'Side by side', description: 'Horizontal split' },
  { id: 'vertical', label: 'Stacked', description: 'Vertical split' },
  { id: 'editorial', label: 'Editorial', description: 'One photo in focus' },
  { id: 'scrapbook', label: 'Scrapbook', description: 'Layered Polaroid cards' },
  { id: 'vintage', label: 'Vintage Frames', description: 'Elegant editorial collage' },
  { id: 'birthday', label: 'Celebration', description: 'Hero photo with a photo grid' },
  { id: 'torn-paper', label: 'Torn Paper', description: 'Casual cutout-style collage' },
  { id: 'memory-wall', label: 'Memory Wall', description: 'Balanced two-column gallery' },
  { id: 'film-strip', label: 'Film Strip', description: 'Compact cinematic tiles' },
  { id: 'polaroid-wall', label: 'Polaroid Wall', description: 'Clean framed photo cards' },
  { id: 'mosaic', label: 'Mosaic', description: 'Asymmetric magazine-style composition' },
]
const makeId = () => globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 12)
export function PhotoCollageModal({ initialCollage, onClose, onSave }: { initialCollage?: StoryCollageOverlay | null; onClose: () => void; onSave: (collage: StoryCollageOverlay) => void }) {
  const [photos, setPhotos] = useState<StoryCollagePhoto[]>(initialCollage?.photos?.map(p => ({...p})) || [])
  const [layout, setLayout] = useState<Layout>(initialCollage?.layout || 'grid')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const stageRef = useRef<HTMLDivElement>(null)
  const [previews, setPreviews] = useState<Record<string,string>>({})
  const fileSignature = photos.map(p => p.file ? `${p.id}:${p.file.name}:${p.file.lastModified}:${p.file.size}` : `${p.id}:url`).join('|')
  useEffect(() => {
    const created: Record<string,string> = {}
    photos.forEach(p => { if (p.file) created[p.id] = URL.createObjectURL(p.file) })
    setPreviews(created)
    return () => Object.values(created).forEach(URL.revokeObjectURL)
  // Recreate object URLs only when selected files change, not on every drag.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileSignature])
  const canSave = isValidPhotoCollageCount(photos.length)
  const addFiles = (list: FileList | null) => {
    if (!list) return
    const incoming = Array.from(list)
    const valid: StoryCollagePhoto[] = []
    for (const file of incoming) {
      if (!file.type.startsWith('image/')) { setError('Please select image files only.'); continue }
      if (file.size > 15 * 1024 * 1024) { setError('Each photo must be 15 MB or smaller.'); continue }
      valid.push({id:makeId(),file,x:0,y:0,width:100,height:100,rotation:0})
    }
    setPhotos(current => {
      const next = [...current, ...valid]
      const pos = getPhotoCollagePositions(next.length, layout)
      return next.map((p,i) => ({...p,...pos[i]}))
    })
    if (photos.length + valid.length >= 2) setError('')
  }
  const applyLayout = (nextLayout: Layout) => {
    setLayout(nextLayout)
    setPhotos(current => current.map((p,i) => ({...p,...getPhotoCollagePositions(current.length,nextLayout)[i],rotation:nextLayout==='scrapbook'?(i%2?5:-4):0})))
  }
  const updatePhoto = (id: string, patch: Partial<StoryCollagePhoto>) => setPhotos(current => current.map(p => p.id === id ? {...p,...patch} : p))
  const removePhoto = (id: string) => setPhotos(current => { const next=current.filter(p=>p.id!==id); return next.map((p,i)=>({...p,...getPhotoCollagePositions(next.length,layout)[i]})) })
  const replacePhoto = (id: string, file: File) => {
    if (!file.type.startsWith('image/') || file.size > 15*1024*1024) { setError('Choose a supported image up to 15 MB.'); return }
    updatePhoto(id,{file,url:undefined})
  }
  const collage: StoryCollageOverlay = { id: initialCollage?.id || makeId(), layout, mode: 'layout', x: initialCollage?.x ?? 50, y: initialCollage?.y ?? 50, scale: initialCollage?.scale ?? 1, rotation: initialCollage?.rotation ?? 0, frameColor: initialCollage?.frameColor || '#ffffff', photos }
  return <div className="fixed inset-0 z-[225] flex items-center justify-center bg-black/70 p-3 sm:p-5" role="dialog" aria-modal="true" aria-label="Photo Collage editor" onClick={onClose}>
    <div className="flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-2xl" onClick={e=>e.stopPropagation()}>
      <header className="flex items-center justify-between border-b border-border p-4"><div><h2 className="text-lg font-bold">Photo Collage</h2><p className="text-xs text-muted-foreground">{photos.length} photos selected · choose 2 or more</p></div><button type="button" onClick={onClose} aria-label="Close collage editor" className="rounded-full p-2 hover:bg-muted"><X className="h-5 w-5"/></button></header>
      <div className="grid min-h-0 flex-1 touch-pan-y gap-4 overflow-y-auto overscroll-contain p-3 sm:p-4 md:grid-cols-[minmax(0,1fr)_240px]">
        <div className="order-2 flex h-[30dvh] min-h-[170px] items-center justify-center rounded-xl bg-neutral-950 p-2 md:order-1 md:h-auto md:min-h-[300px] md:p-3">
          <div ref={stageRef} className="relative aspect-[9/14] h-full w-auto max-w-full overflow-hidden rounded-lg bg-neutral-900 md:h-auto md:w-full md:max-w-[320px]">
            {photos.map(p=><div key={p.id} onClick={()=>setSelectedId(p.id)} className={`absolute overflow-hidden rounded-md border-2 bg-neutral-800 ${selectedId===p.id?'border-violet-400 ring-2 ring-violet-300':'border-white/70'}`} style={{left:`${p.x}%`,top:`${p.y}%`,width:`${p.width}%`,height:`${p.height}%`,transform:`rotate(${p.rotation}deg)`,zIndex:layout==='scrapbook'?photos.indexOf(p)+1:1}}>
              {/* eslint-disable-next-line @next/next/no-img-element */}<img src={p.file?previews[p.id]||'':p.url||''} alt={`Collage photo ${photos.indexOf(p)+1}`} className="h-full w-full object-cover" />
            </div>)}
            {photos.length===0&&<div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-white/70"><ImagePlus className="h-8 w-8"/><span>Select 2 or more photos</span></div>}
          </div>
        </div>
        <aside className="order-1 min-w-0 space-y-4 md:order-2">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border p-3 text-sm font-semibold hover:bg-muted"><ImagePlus className="h-4 w-4"/>Add photos<input type="file" accept="image/*" multiple className="sr-only" onChange={e=>{addFiles(e.target.files);e.currentTarget.value=''}}/></label>
          <div><h3 className="mb-2 text-sm font-semibold">Layout</h3><div className="grid grid-cols-2 gap-2">{layouts.map(item=><button key={item.id} type="button" onClick={()=>applyLayout(item.id)} aria-pressed={layout===item.id} className={`rounded-xl border p-2 text-left ${layout===item.id?'border-violet-500 bg-violet-500/10':'border-border hover:bg-muted'}`}><LayoutGrid className="mb-1 h-4 w-4"/><span className="block text-xs font-semibold">{item.label}</span><span className="mt-0.5 block text-[10px] text-muted-foreground">{item.description}</span></button>)}</div></div>
          <p className="text-[11px] text-muted-foreground">Choose a layout, then add, replace, or remove photos. Each template arranges photos automatically.</p>
          <div className="space-y-2">{photos.map((p,i)=><div key={p.id} className={`flex items-center gap-2 rounded-lg border p-2 ${selectedId===p.id?'border-violet-500':'border-border'}`}><button type="button" onClick={()=>setSelectedId(p.id)} className="min-w-0 flex-1 truncate text-left text-xs font-medium">Photo {i+1}</button>{false&&layout==='scrapbook'&&<><button type="button" title="Send backward" aria-label={`Send photo ${i+1} backward`} disabled={i===0} onClick={()=>setPhotos(current=>{const index=current.findIndex(item=>item.id===p.id);if(index<=0)return current;const next=[...current];[next[index-1],next[index]]=[next[index],next[index-1]];return next})} className="rounded p-1.5 hover:bg-muted disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5"/></button><button type="button" title="Bring forward" aria-label={`Bring photo ${i+1} forward`} disabled={i===photos.length-1} onClick={()=>setPhotos(current=>{const index=current.findIndex(item=>item.id===p.id);if(index<0||index>=current.length-1)return current;const next=[...current];[next[index],next[index+1]]=[next[index+1],next[index]];return next})} className="rounded p-1.5 hover:bg-muted disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5"/></button></>}<label className="cursor-pointer rounded p-1.5 hover:bg-muted" title="Replace photo"><ImagePlus className="h-4 w-4"/><input type="file" accept="image/*" className="sr-only" onChange={e=>{const f=e.target.files?.[0];if(f)replacePhoto(p.id,f);e.currentTarget.value=''}}/></label><button type="button" disabled={photos.length<=2} onClick={()=>removePhoto(p.id)} aria-label={`Remove photo ${i+1}`} className="rounded p-1.5 text-red-500 hover:bg-red-500/10 disabled:opacity-30"><Trash2 className="h-4 w-4"/></button></div>)}</div>
          {error&&<p role="alert" className="text-xs text-red-500">{error}</p>}
        </aside>
      </div>
      <footer className="flex shrink-0 gap-2 border-t border-border bg-card p-3 sm:p-4"><button type="button" onClick={onClose} className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold">Cancel</button><button type="button" disabled={!canSave} onClick={()=>onSave(collage)} className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"><Check className="mr-2 inline h-4 w-4"/>Add collage</button></footer>
    </div>
  </div>
}
