'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ImagePlus, SlidersHorizontal, X, Trash2, ZoomIn, MoveHorizontal, MoveVertical, UploadCloud } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export type ChatWallpaper = {
  dataUrl: string
  originalDataUrl: string
  originalStoragePath: string
  processedStoragePath: string
  filterIndex: number
  zoom: number
  positionX: number
  positionY: number
}

const BUCKET = 'aperonix-wallpapers'
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

type StoredWallpaper = {
  original_storage_path: string
  processed_storage_path: string
  filter_index: number
  zoom: number
  position_x: number
  position_y: number
}

type Props = {
  conversationId: string | null
  wallpaper: ChatWallpaper | null
  onWallpaperChange: (wallpaper: ChatWallpaper | null) => void
  isActive: boolean
}

export function ChatWallpaperControls({ conversationId, wallpaper, onWallpaperChange, isActive }: Props) {
  const [currentWallpaper, setCurrentWallpaper] = useState<ChatWallpaper | null>(wallpaper)
  const [open, setOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [draft, setDraft] = useState<ChatWallpaper | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setCurrentWallpaper(wallpaper)
  }, [wallpaper])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!conversationId) {
        setCurrentWallpaper(null)
        if (isActive) onWallpaperChange(null)
        return
      }
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Please sign in to load this wallpaper.')
        const { data, error: queryError } = await supabase
          .from('aperonix_chat_wallpapers')
          .select('original_storage_path,processed_storage_path,filter_index,zoom,position_x,position_y')
          .eq('conversation_id', conversationId)
          .eq('user_id', user.id)
          .maybeSingle()
        if (queryError) throw queryError
        if (!data) {
          if (!cancelled) {
            setCurrentWallpaper(null)
            if (isActive) onWallpaperChange(null)
          }
          return
        }
        const row = data as StoredWallpaper
        const [original, processed] = await Promise.all([
          supabase.storage.from(BUCKET).createSignedUrl(row.original_storage_path, 60 * 60),
          supabase.storage.from(BUCKET).createSignedUrl(row.processed_storage_path, 60 * 60),
        ])
        if (original.error || processed.error || !original.data?.signedUrl || !processed.data?.signedUrl) {
          throw new Error('Could not load the saved wallpaper. Please try again.')
        }
        const loaded: ChatWallpaper = {
          originalDataUrl: original.data.signedUrl,
          dataUrl: processed.data.signedUrl,
          originalStoragePath: row.original_storage_path,
          processedStoragePath: row.processed_storage_path,
          filterIndex: row.filter_index,
          zoom: row.zoom,
          positionX: row.position_x,
          positionY: row.position_y,
        }
        if (!cancelled) {
          setCurrentWallpaper(loaded)
          if (isActive) onWallpaperChange(loaded)
        }
      } catch (cause) {
        if (!cancelled) {
          setCurrentWallpaper(null)
          if (isActive) onWallpaperChange(null)
          setError(cause instanceof Error ? cause.message : 'Could not load the wallpaper.')
        }
      }
    }
    void load()
    return () => { cancelled = true }
  }, [conversationId, isActive, onWallpaperChange])

  const pickFile = (file?: File) => {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Please choose a JPG, PNG, or WebP image.')
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
      setDraft({
        dataUrl, originalDataUrl: dataUrl, originalStoragePath: '', processedStoragePath: '',
        filterIndex: 0, zoom: 100, positionX: 50, positionY: 50,
      })
      setError(null)
      setUploadOpen(false)
      setOpen(true)
    }
    reader.onerror = () => setError('Could not read this image. Please try another.')
    reader.readAsDataURL(file)
  }

  const save = async () => {
    if (!conversationId || !draft) {
      setError('Choose a photo first.')
      return
    }
    setSaving(true)
    setError(null)
    const supabase = createClient()
    let uploadedPaths: string[] = []
    let databaseSaved = false
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) throw new Error('Please sign in to save a wallpaper.')

      const image = new window.Image()
      image.crossOrigin = 'anonymous'
      image.src = draft.originalDataUrl
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('Could not process this photo. Please choose it again.'))
      })
      // Keep the source image at its native resolution. Downscaling wallpapers
      // to 1800px made high-resolution photos visibly soft on large displays.
      const width = image.naturalWidth
      const height = image.naturalHeight
      const baseCanvas = document.createElement('canvas')
      baseCanvas.width = width
      baseCanvas.height = height
      const baseContext = baseCanvas.getContext('2d')
      if (!baseContext) throw new Error('Image editor is unavailable in this browser.')
      baseContext.drawImage(image, 0, 0, width, height)
      const originalBlob = await new Promise<Blob>((resolve, reject) => baseCanvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not prepare this photo.')), 'image/jpeg', 0.98))

      const filteredCanvas = document.createElement('canvas')
      filteredCanvas.width = width
      filteredCanvas.height = height
      const filteredContext = filteredCanvas.getContext('2d')
      if (!filteredContext) throw new Error('Image editor is unavailable in this browser.')
      filteredContext.filter = FILTERS[draft.filterIndex]?.css || 'none'
      filteredContext.drawImage(baseCanvas, 0, 0)
      const processedBlob = await new Promise<Blob>((resolve, reject) => filteredCanvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not apply this filter.')), 'image/jpeg', 0.98))

      const folder = user.id + '/' + conversationId + '/'
      const nonce = crypto.randomUUID()
      const originalPath = folder + nonce + '-original.jpg'
      const processedPath = folder + nonce + '-wallpaper.jpg'
      const originalUpload = await supabase.storage.from(BUCKET).upload(originalPath, originalBlob, { contentType: 'image/jpeg', upsert: false, cacheControl: '3600' })
      if (originalUpload.error) throw new Error('Could not upload the original photo. Please try again.')
      uploadedPaths.push(originalPath)
      const processedUpload = await supabase.storage.from(BUCKET).upload(processedPath, processedBlob, { contentType: 'image/jpeg', upsert: false, cacheControl: '3600' })
      if (processedUpload.error) throw new Error('Could not upload the filtered wallpaper. Please try again.')
      uploadedPaths.push(processedPath)

      const { data: oldRow } = await supabase.from('aperonix_chat_wallpapers')
        .select('original_storage_path,processed_storage_path')
        .eq('conversation_id', conversationId)
        .eq('user_id', user.id)
        .maybeSingle()

      const { error: saveError } = await supabase.from('aperonix_chat_wallpapers').upsert({
        conversation_id: conversationId,
        user_id: user.id,
        original_storage_path: originalPath,
        processed_storage_path: processedPath,
        filter_index: draft.filterIndex,
        zoom: draft.zoom,
        position_x: draft.positionX,
        position_y: draft.positionY,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'conversation_id' })
      if (saveError) throw saveError
      databaseSaved = true

      const [originalUrl, processedUrl] = await Promise.all([
        supabase.storage.from(BUCKET).createSignedUrl(originalPath, 60 * 60),
        supabase.storage.from(BUCKET).createSignedUrl(processedPath, 60 * 60),
      ])
      if (originalUrl.error || processedUrl.error || !originalUrl.data?.signedUrl || !processedUrl.data?.signedUrl) {
        throw new Error('Wallpaper was saved, but its preview could not be opened. Reopen the chat to refresh it.')
      }
      const saved: ChatWallpaper = {
        originalDataUrl: originalUrl.data.signedUrl,
        dataUrl: processedUrl.data.signedUrl,
        originalStoragePath: originalPath,
        processedStoragePath: processedPath,
        filterIndex: draft.filterIndex,
        zoom: draft.zoom,
        positionX: draft.positionX,
        positionY: draft.positionY,
      }
      setCurrentWallpaper(saved)
      if (isActive) onWallpaperChange(saved)
      setOpen(false)
      setUploadOpen(false)
      if (oldRow) {
        const oldPaths = [oldRow.original_storage_path, oldRow.processed_storage_path].filter((path): path is string => typeof path === 'string')
        if (oldPaths.length) await supabase.storage.from(BUCKET).remove(oldPaths)
      }
    } catch (cause) {
      if (uploadedPaths.length && !databaseSaved) await supabase.storage.from(BUCKET).remove(uploadedPaths)
      setError(cause instanceof Error ? cause.message : 'Could not save this wallpaper. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!conversationId) return
    setError(null)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Please sign in to remove this wallpaper.')
      const { data: row, error: queryError } = await supabase.from('aperonix_chat_wallpapers')
        .select('original_storage_path,processed_storage_path')
        .eq('conversation_id', conversationId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (queryError) throw queryError
      const { error: deleteError } = await supabase.from('aperonix_chat_wallpapers')
        .delete().eq('conversation_id', conversationId).eq('user_id', user.id)
      if (deleteError) throw deleteError
      if (row) {
        const paths = [row.original_storage_path, row.processed_storage_path].filter((path): path is string => typeof path === 'string')
        if (paths.length) {
          const { error: storageError } = await supabase.storage.from(BUCKET).remove(paths)
          if (storageError) console.error('Could not clean up removed wallpaper objects', storageError)
        }
      }
      setCurrentWallpaper(null)
      if (isActive) onWallpaperChange(null)
      setDraft(null)
      setOpen(false)
      setUploadOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove this wallpaper.')
    }
  }

  const startEditing = () => {
    setDraft(currentWallpaper ? { ...currentWallpaper } : null)
    setError(null)
    setOpen(true)
  }

  return (
    <>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={event => { pickFile(event.target.files?.[0]); event.currentTarget.value = '' }} />
      <button
        type="button"
        onClick={() => {
          setError(null)
          if (currentWallpaper) startEditing()
          else { setDraft(null); setUploadOpen(true) }
        }}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted transition-colors"
      >
        {currentWallpaper ? <SlidersHorizontal className="h-3.5 w-3.5" /> : <ImagePlus className="h-3.5 w-3.5" />}
        {currentWallpaper ? 'Edit wallpaper' : 'Add wallpaper'}
      </button>
      {currentWallpaper && (
        <button type="button" onClick={() => void remove()} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-500 hover:bg-red-500/10 transition-colors">
          <Trash2 className="h-3.5 w-3.5" /> Remove wallpaper
        </button>
      )}

      {uploadOpen && typeof document !== 'undefined' && createPortal((
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/65 p-4" onClick={() => setUploadOpen(false)}>
          <section className="w-full max-w-md rounded-2xl border border-white/10 bg-card p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-purple-500 text-white"><ImagePlus className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1"><h2 className="font-semibold">Add chat wallpaper</h2><p className="text-xs text-muted-foreground">Choose a photo from your device</p></div>
              <button type="button" onClick={() => setUploadOpen(false)} aria-label="Close upload dialog" className="rounded-lg p-2 hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <button type="button" onClick={() => fileRef.current?.click()} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); pickFile(event.dataTransfer.files?.[0]) }} className="flex min-h-36 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-pink-500/40 bg-muted/40 p-5 text-center hover:bg-muted/70">
              <UploadCloud className="h-8 w-8 text-pink-500" /><span className="text-sm font-medium">Click to choose or drag a photo here</span><span className="text-xs text-muted-foreground">JPG, PNG or WebP · up to 15 MB</span>
            </button>
            {error && <p role="alert" className="mt-3 text-sm text-red-500">{error}</p>}
            <div className="mt-4 flex justify-end"><button type="button" onClick={() => setUploadOpen(false)} className="rounded-xl px-4 py-2 text-sm hover:bg-muted">Cancel</button></div>
          </section>
        </div>
      ), document.body)}

      {open && typeof document !== 'undefined' && createPortal((

        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 p-3 sm:p-6" onClick={() => !saving && setOpen(false)}>
          <section className="flex max-h-[calc(100dvh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-card shadow-2xl" onClick={event => event.stopPropagation()}>
            <header className="flex items-center gap-3 border-b border-border px-5 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500/20 to-purple-500/20 text-pink-500"><ImagePlus className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1"><h2 className="font-semibold">Chat wallpaper editor</h2><p className="text-xs text-muted-foreground">Set the crop and preview each filter on your photo</p></div>
              <button type="button" disabled={saving} onClick={() => setOpen(false)} aria-label="Close wallpaper editor" className="rounded-xl p-2 hover:bg-muted disabled:opacity-40"><X className="h-4 w-4" /></button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-3">
                <div className="flex items-center gap-2 text-sm font-medium"><SlidersHorizontal className="h-4 w-4 text-pink-500" /> Photo positioning</div>
                <button type="button" onClick={() => fileRef.current?.click()} className="rounded-full border border-pink-500/30 px-3 py-1.5 text-xs text-pink-500 hover:bg-pink-500/10">Change photo</button>
                {draft && (
                  <div className="grid w-full gap-3 sm:grid-cols-3">
                    <label className="text-xs text-muted-foreground"><span className="flex items-center gap-1"><ZoomIn className="h-3.5 w-3.5" /> Zoom <span className="ml-auto text-foreground">{draft.zoom}%</span></span><input type="range" min="80" max="160" value={draft.zoom} onChange={event => setDraft(previous => previous ? { ...previous, zoom: Number(event.target.value) } : previous)} className="mt-2 block w-full accent-pink-500" /></label>
                    <label className="text-xs text-muted-foreground"><span className="flex items-center gap-1"><MoveHorizontal className="h-3.5 w-3.5" /> Horizontal <span className="ml-auto text-foreground">{draft.positionX}%</span></span><input type="range" min="0" max="100" value={draft.positionX} onChange={event => setDraft(previous => previous ? { ...previous, positionX: Number(event.target.value) } : previous)} className="mt-2 block w-full accent-pink-500" /></label>
                    <label className="text-xs text-muted-foreground"><span className="flex items-center gap-1"><MoveVertical className="h-3.5 w-3.5" /> Vertical <span className="ml-auto text-foreground">{draft.positionY}%</span></span><input type="range" min="0" max="100" value={draft.positionY} onChange={event => setDraft(previous => previous ? { ...previous, positionY: Number(event.target.value) } : previous)} className="mt-2 block w-full accent-pink-500" /></label>
                  </div>
                )}
              </div>

              <div onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); pickFile(event.dataTransfer.files?.[0]) }} className="relative mb-5 aspect-video max-h-[300px] min-h-40 w-full overflow-hidden rounded-2xl border border-pink-500/30 bg-muted/50">
                {draft ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={draft.originalDataUrl} alt="Wallpaper preview" className="absolute inset-0 h-full w-full object-cover" style={{ filter: FILTERS[draft.filterIndex]?.css || 'none', objectPosition: draft.positionX + '% ' + draft.positionY + '%', transform: 'scale(' + draft.zoom / 100 + ')' }} />
                    <div className="absolute bottom-3 left-3 rounded-lg border border-white/20 bg-slate-950/55 px-3 py-2 text-xs text-white backdrop-blur-sm">Chat wallpaper preview</div>
                  </>
                ) : <button type="button" onClick={() => fileRef.current?.click()} className="flex h-full w-full flex-col items-center justify-center gap-2 p-6"><ImagePlus className="h-8 w-8 text-pink-500" /><span className="text-sm">Choose a photo to start</span></button>}
              </div>
              {error && <p role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>}
              <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Filters</h3><p className="text-xs text-muted-foreground">120 presets · previews use your selected photo</p></div><span className="rounded-full border border-pink-500/30 px-2.5 py-1 text-xs text-pink-500">{draft ? FILTERS[draft.filterIndex]?.name : 'Choose a photo'}</span></div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
                {FILTERS.map((filter, index) => (
                  <button key={filter.name} type="button" disabled={!draft} onClick={() => setDraft(previous => previous ? { ...previous, filterIndex: index } : previous)} className={'group overflow-hidden rounded-xl border text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ' + (draft?.filterIndex === index ? 'border-pink-500 ring-2 ring-pink-500/30' : 'border-border hover:border-pink-500/60')} title={filter.name}>
                    {draft ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={draft.originalDataUrl} alt="" className="block h-12 w-full object-cover" style={{ filter: filter.css, objectPosition: draft.positionX + '% ' + draft.positionY + '%', transform: 'scale(' + draft.zoom / 100 + ')' }} />
                    ) : <span className="block h-12 bg-muted" />}
                    <span className="block truncate px-2 py-1.5 text-[10px] sm:text-xs">{filter.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
              <p className="text-xs text-muted-foreground">Saved securely to your SociaLens account</p>
              <div className="flex items-center gap-2"><button type="button" disabled={saving} onClick={() => setOpen(false)} className="rounded-xl px-4 py-2 text-sm hover:bg-muted">Cancel</button><button type="button" onClick={() => void save()} disabled={!draft || saving} className="rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{saving ? 'Saving…' : 'Save wallpaper'}</button></div>
            </footer>
          </section>
        </div>
      ), document.body)}
    </>
  )
}
