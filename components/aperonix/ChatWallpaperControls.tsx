'use client'

import { useEffect, useRef, useState } from 'react'
import { ImagePlus, SlidersHorizontal, X, Trash2 } from 'lucide-react'

export type ChatWallpaper = {
  dataUrl: string
  originalDataUrl: string
  filterIndex: number
  zoom: number
  positionX: number
  positionY: number
}

const STORAGE_PREFIX = 'socialens:aperonix-wallpaper:'
const FILTERS = Array.from({ length: 120 }, (_, index) => {
  const hueValues = [0, 8, -8, 18, -18, 32, -32, 48, -48, 70, -70, 95]
  const saturationValues = [0.85, 1, 1.15, 1.3, 1.5]
  const brightnessValues = [0.82, 0.92, 1, 1.08, 1.16, 1.24]
  const contrastValues = [0.9, 1, 1.08, 1.16]
  const hue = hueValues[index % hueValues.length]
  const saturation = saturationValues[Math.floor(index / 12) % saturationValues.length]
  const brightness = brightnessValues[Math.floor(index / 60) % brightnessValues.length]
  const contrast = contrastValues[Math.floor(index / 20) % contrastValues.length]
  const sepia = index % 10 === 0 ? 0.18 : index % 7 === 0 ? 0.08 : 0
  const names = ['Aurora', 'Velvet', 'Dream', 'Neon', 'Dusk', 'Bloom', 'Arctic', 'Golden', 'Cinema', 'Lunar']
  return {
    name: names[index % names.length] + ' ' + String(index + 1).padStart(3, '0'),
    css: 'hue-rotate(' + hue + 'deg) saturate(' + saturation + ') brightness(' + brightness + ') contrast(' + contrast + ') sepia(' + sepia + ')',
  }
})

type Props = {
  conversationId: string | null
  wallpaper: ChatWallpaper | null
  onWallpaperChange: (wallpaper: ChatWallpaper | null) => void
}

export function ChatWallpaperControls({ conversationId, wallpaper, onWallpaperChange }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<ChatWallpaper | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setOpen(false)
    setDraft(null)
    setError(null)
  }, [conversationId])

  const pickFile = (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file (JPG, PNG, or WebP).')
      return
    }
    if (file.size > 15 * 1024 * 1024) {
      setError('Wallpaper image must be 15 MB or smaller.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : ''
      if (!dataUrl) {
        setError('Could not read this image. Please try another.')
        return
      }
      setDraft({ dataUrl, originalDataUrl: dataUrl, filterIndex: 0, zoom: 100, positionX: 50, positionY: 50 })
      setError(null)
    }
    reader.onerror = () => setError('Could not read this image. Please try another.')
    reader.readAsDataURL(file)
  }

  const save = async () => {
    if (!conversationId || !draft) {
      setError('Choose a photo first.')
      return
    }
    try {
      const image = new window.Image()
      image.src = draft.originalDataUrl
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('Could not process this image.'))
      })
      const scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Image editor is unavailable in this browser.')
      context.filter = FILTERS[draft.filterIndex]?.css || 'none'
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const saved = { ...draft, dataUrl: canvas.toDataURL('image/jpeg', 0.82) }
      localStorage.setItem(STORAGE_PREFIX + conversationId, JSON.stringify(saved))
      onWallpaperChange(saved)
      setOpen(false)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this wallpaper. Try a smaller image.')
    }
  }

  const remove = () => {
    if (!conversationId) return
    localStorage.removeItem(STORAGE_PREFIX + conversationId)
    onWallpaperChange(null)
    setDraft(null)
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setDraft(wallpaper ? { ...wallpaper } : null); setError(null); setOpen(true) }}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted transition-colors"
      >
        {wallpaper ? <SlidersHorizontal className="h-3.5 w-3.5" /> : <ImagePlus className="h-3.5 w-3.5" />}
        {wallpaper ? 'Edit wallpaper' : 'Add wallpaper'}
      </button>
      {wallpaper && (
        <button type="button" onClick={remove} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-500 hover:bg-red-500/10 transition-colors">
          <Trash2 className="h-3.5 w-3.5" /> Remove wallpaper
        </button>
      )}
      {open && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 p-3 sm:p-6" onClick={() => setOpen(false)}>
          <section className="flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-card shadow-2xl" onClick={event => event.stopPropagation()}>
            <header className="flex items-center gap-3 border-b border-border px-5 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500/20 to-purple-500/20 text-pink-500"><ImagePlus className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">Chat wallpaper</h2>
                <p className="text-xs text-muted-foreground">Personalize this conversation with your own photo and a filter</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close wallpaper editor" className="rounded-xl p-2 hover:bg-muted"><X className="h-4 w-4" /></button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              <div
                onDragOver={event => event.preventDefault()}
                onDrop={event => { event.preventDefault(); pickFile(event.dataTransfer.files?.[0]) }}
                className="relative mb-5 flex min-h-48 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-pink-500/40 bg-muted/50 sm:min-h-60"
              >
                {draft ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={draft.originalDataUrl} alt="Wallpaper preview" className="absolute inset-0 h-full w-full object-cover" style={{ filter: FILTERS[draft.filterIndex]?.css || 'none', objectPosition: draft.positionX + '% ' + draft.positionY + '%', transform: 'scale(' + draft.zoom / 100 + ')' }} />
                    <div className="pointer-events-none absolute inset-0 bg-slate-950/35" />
                    <div className="relative z-10 max-w-[85%] rounded-xl border border-white/20 bg-slate-950/50 px-4 py-3 text-center text-sm text-white backdrop-blur-sm">
                      <p className="font-semibold">Aperonix chat preview</p>
                      <p className="mt-1 text-xs text-white/80">Your messages stay readable over the wallpaper</p>
                    </div>
                    <button type="button" onClick={() => fileRef.current?.click()} className="absolute bottom-3 right-3 z-10 rounded-full border border-white/20 bg-slate-950/70 px-3 py-2 text-xs font-medium text-white backdrop-blur">Change photo</button>
                  </>
                ) : (
                  <button type="button" onClick={() => fileRef.current?.click()} className="flex flex-col items-center gap-3 p-8 text-center">
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500 to-purple-500 text-white"><ImagePlus className="h-7 w-7" /></span>
                    <span className="font-semibold">Drop a photo here</span>
                    <span className="text-sm text-muted-foreground">or click to browse · JPG, PNG, WebP · up to 15 MB</span>
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={event => { pickFile(event.target.files?.[0]); event.currentTarget.value = '' }} />
              {error && <p role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>}
              <div className="mb-3 flex items-center justify-between gap-3">
                <div><h3 className="text-sm font-semibold">Filters</h3><p className="text-xs text-muted-foreground">120 presets · tap any look to preview it</p></div>
                <span className="rounded-full border border-pink-500/30 px-2.5 py-1 text-xs text-pink-500">{draft ? FILTERS[draft.filterIndex]?.name : 'Choose a photo'}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
                {FILTERS.map((filter, index) => (
                  <button key={filter.name} type="button" disabled={!draft} onClick={() => setDraft(previous => previous ? { ...previous, filterIndex: index } : previous)} className={'group overflow-hidden rounded-xl border text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ' + (draft?.filterIndex === index ? 'border-pink-500 ring-2 ring-pink-500/30' : 'border-border hover:border-pink-500/60')} title={filter.name}>
                    <span className="block h-12 bg-gradient-to-br from-pink-500 via-purple-500 to-cyan-400" style={{ filter: filter.css }} />
                    <span className="block truncate px-2 py-1.5 text-[10px] sm:text-xs">{filter.name}</span>
                  </button>
                ))}
              </div>
              {draft && (
                <div className="mt-5 grid gap-4 rounded-2xl border border-border p-4 sm:grid-cols-3">
                  <label className="text-xs text-muted-foreground">Zoom <span className="float-right text-foreground">{draft.zoom}%</span><input type="range" min="80" max="160" value={draft.zoom} onChange={event => setDraft(previous => previous ? { ...previous, zoom: Number(event.target.value) } : previous)} className="mt-2 block w-full accent-pink-500" /></label>
                  <label className="text-xs text-muted-foreground">Horizontal position <span className="float-right text-foreground">{draft.positionX}%</span><input type="range" min="0" max="100" value={draft.positionX} onChange={event => setDraft(previous => previous ? { ...previous, positionX: Number(event.target.value) } : previous)} className="mt-2 block w-full accent-pink-500" /></label>
                  <label className="text-xs text-muted-foreground">Vertical position <span className="float-right text-foreground">{draft.positionY}%</span><input type="range" min="0" max="100" value={draft.positionY} onChange={event => setDraft(previous => previous ? { ...previous, positionY: Number(event.target.value) } : previous)} className="mt-2 block w-full accent-pink-500" /></label>
                </div>
              )}
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
              <p className="text-xs text-muted-foreground">Saved in this browser for this chat</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2 text-sm hover:bg-muted">Cancel</button>
                <button type="button" onClick={() => void save()} disabled={!draft} className="rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Save wallpaper</button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </>
  )
}
