'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Loader2, ZoomIn, RotateCw, ArrowUp, ArrowDown, Check } from 'lucide-react'
import { compressImageIfNeeded } from '@/lib/utils/imageCompression'

interface WallpaperModalProps {
  onDone: (file: File, position: { x: number; y: number }) => void
  onClose: () => void
  saving?: boolean
  initialImageUrl?: string
  initialPosition?: { x: number; y: number }
  saveLabel?: string
}

/**
 * Two-step flow:
 *  1. Opens the device's native file picker immediately (no extra UI needed
 *     for this step - the OS popup itself is the "select a photo" screen).
 *  2. Once a photo is picked, shows a full-screen adjust screen where the
 *     person can drag the image to reposition it, then Cancel or Done.
 *
 * If the person dismisses the OS picker without choosing anything, we
 * detect that via the window regaining focus with no file selected, and
 * just close the modal - nothing changes.
 */

function drawWallpaper(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
  position: { x: number; y: number },
  zoom: number,
  rotation: number,
) {
  context.clearRect(0, 0, width, height)
  context.save()
  context.beginPath()
  context.rect(0, 0, width, height)
  context.clip()

  const radians = rotation * Math.PI / 180
  const cos = Math.abs(Math.cos(radians))
  const sin = Math.abs(Math.sin(radians))
  const rotatedWidth = image.naturalWidth * cos + image.naturalHeight * sin
  const rotatedHeight = image.naturalWidth * sin + image.naturalHeight * cos
  const scale = Math.max(width / rotatedWidth, height / rotatedHeight) * zoom / 100
  const renderedWidth = rotatedWidth * scale
  const renderedHeight = rotatedHeight * scale
  const maxX = Math.max(0, (renderedWidth - width) / 2)
  const maxY = Math.max(0, (renderedHeight - height) / 2)
  const offsetX = ((50 - position.x) / 50) * maxX
  const offsetY = ((50 - position.y) / 50) * maxY

  context.translate(width / 2 + offsetX, height / 2 + offsetY)
  context.rotate(radians)
  context.scale(scale, scale)
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2)
  context.restore()
}

export function WallpaperModal({ onDone, onClose, saving, initialImageUrl, initialPosition, saveLabel = 'Apply wallpaper' }: WallpaperModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [position, setPosition] = useState(initialPosition || { x: 50, y: 50 })
  const [zoom, setZoom] = useState(100)
  const [rotation, setRotation] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [targetRatio, setTargetRatio] = useState(9 / 16)
  const [draftDataUrl, setDraftDataUrl] = useState<string | null>(null)
  const [draftRestored, setDraftRestored] = useState(false)
  const [initialImageLoading, setInitialImageLoading] = useState(!!initialImageUrl)
  const draftKeyRef = useRef<string | null>(null)

  // Keep an in-progress wallpaper edit across refreshes of this exact chat
  // route. sessionStorage is tab-scoped; the image is restored as a File so
  // the same editor controls and export path continue to work.
  useEffect(() => {
    if (initialImageUrl) {
      let cancelled = false
      void (async () => {
        try {
          const response = await fetch(initialImageUrl)
          if (!response.ok) throw new Error('Could not load the current wallpaper.')
          const blob = await response.blob()
          const restoredFile = new File([blob], 'chat-wallpaper.jpg', { type: blob.type || 'image/jpeg' })
          if (cancelled) return
          setFile(restoredFile)
          setPreviewUrl(URL.createObjectURL(restoredFile))
          setPosition(initialPosition || { x: 50, y: 50 })
          setDraftRestored(true)
        } catch (cause) {
          if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load the current wallpaper.')
          if (!cancelled) setDraftRestored(true)
        } finally {
          if (!cancelled) setInitialImageLoading(false)
        }
      })()
      return () => { cancelled = true }
    }
    const key = `socia-lens-wallpaper-draft:${window.location.pathname}`
    draftKeyRef.current = key
    try {
      const raw = window.sessionStorage.getItem(key)
      if (raw) {
        const draft = JSON.parse(raw) as {
          dataUrl?: string
          name?: string
          type?: string
          position?: { x: number; y: number }
          zoom?: number
          rotation?: number
        }
        if (draft.dataUrl?.startsWith('data:')) {
          const [header, encoded] = draft.dataUrl.split(',')
          const mime = draft.type || header.match(/data:([^;]+)/)?.[1] || 'image/jpeg'
          const binary = window.atob(encoded || '')
          const bytes = new Uint8Array(binary.length)
          for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
          const restoredFile = new File([bytes], draft.name || 'chat-wallpaper.jpg', { type: mime })
          setFile(restoredFile)
          setPreviewUrl(URL.createObjectURL(restoredFile))
          setDraftDataUrl(draft.dataUrl)
          setPosition(draft.position || { x: 50, y: 50 })
          setZoom(typeof draft.zoom === 'number' ? draft.zoom : 100)
          setRotation(typeof draft.rotation === 'number' ? draft.rotation : 0)
        }
      }
    } catch (cause) {
      console.error('Could not restore wallpaper editor draft', cause)
      window.sessionStorage.removeItem(key)
    } finally {
      setDraftRestored(true)
    }
  }, [initialImageUrl, initialPosition])

  useEffect(() => {
    if (initialImageUrl || !draftRestored || !draftDataUrl || !file || !draftKeyRef.current) return
    try {
      window.sessionStorage.setItem(draftKeyRef.current, JSON.stringify({
        dataUrl: draftDataUrl,
        name: file.name,
        type: file.type,
        position,
        zoom,
        rotation,
      }))
    } catch (cause) {
      // Storage can be unavailable or full for unusually large images; the
      // editor remains usable in memory and still reports upload errors.
      console.warn('Wallpaper draft could not be persisted for refresh', cause)
    }
  }, [initialImageUrl, draftRestored, draftDataUrl, file, position, zoom, rotation])

  // Match the real chat wallpaper surface: the chat column's width divided
  // by its actual height. Recalculate on resize/orientation changes.
  useEffect(() => {
    const updateRatio = () => {
      const width = window.innerWidth >= 1024 ? Math.min(window.innerWidth, 576) : window.innerWidth
      const height = window.innerWidth >= 1024 ? Math.max(1, window.innerHeight - 56) : window.innerHeight
      setTargetRatio(width / height)
    }
    updateRatio()
    window.addEventListener('resize', updateRatio)
    return () => window.removeEventListener('resize', updateRatio)
  }, [])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  // The preview and saved image are rendered by the exact same canvas
  // renderer. This prevents CSS background-cover/transform differences from
  // making the applied wallpaper shift compared with what the user approved.
  useEffect(() => {
    if (!previewUrl || !previewCanvasRef.current) return
    let cancelled = false
    const canvas = previewCanvasRef.current
    const rect = canvas.getBoundingClientRect()
    const ratio = window.devicePixelRatio || 1
    const width = Math.max(1, Math.round(rect.width * ratio))
    const height = Math.max(1, Math.round(rect.height * ratio))
    canvas.width = width
    canvas.height = height
    const image = new Image()
    image.onload = () => {
      if (cancelled) return
      const context = canvas.getContext('2d')
      if (context) drawWallpaper(context, image, width, height, position, zoom, rotation)
    }
    image.src = previewUrl
    return () => { cancelled = true }
  }, [previewUrl, position, zoom, rotation, targetRatio])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0]
    // Reset the input so the same photo can be selected again.
    e.target.value = ''
    if (!picked) return
    // The editor exports at a fixed display resolution, so preparing a
    // lightweight working copy also keeps the refresh-safe session draft
    // comfortably within browser storage quotas for typical phone photos.
    const prepared = await compressImageIfNeeded(picked)
    setFile(prepared)
    setError(null)
    setPreviewUrl(URL.createObjectURL(prepared))
    setPosition({ x: 50, y: 50 })
    setZoom(100)
    setRotation(0)
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') setDraftDataUrl(reader.result)
    }
    reader.readAsDataURL(prepared)
  }

  const handleBuiltInWallpaperSelect = async (number: number) => {
    try {
      setError(null)
      const filename = `wallpaper-${String(number).padStart(2, '0')}.jpg`
      const response = await fetch(`/images/chat-wallpapers/${filename}`)
      if (!response.ok) throw new Error('This wallpaper could not be loaded. Please try another one.')
      const blob = await response.blob()
      const selectedFile = new File([blob], filename, { type: blob.type || 'image/jpeg' })
      setFile(selectedFile)
      setPreviewUrl(URL.createObjectURL(selectedFile))
      setPosition({ x: 50, y: 50 })
      setZoom(100)
      setRotation(0)
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') setDraftDataUrl(reader.result)
      }
      reader.readAsDataURL(selectedFile)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'This wallpaper could not be loaded.')
    }
  }

  const handleCancel = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(null)
    setPreviewUrl(null)
    setDraftDataUrl(null)
    if (draftKeyRef.current) window.sessionStorage.removeItem(draftKeyRef.current)
    onClose()
  }

  const handleDone = async () => {
    if (!file || !previewUrl) return
    try {
      const image = new Image()
      image.src = previewUrl
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('Could not read this photo.'))
      })
      // Export using the same renderer and crop geometry as the on-screen preview.
      const width = 1400
      const height = Math.max(1, Math.round(width / targetRatio))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Photo editor is unavailable.')
      drawWallpaper(context, image, width, height, position, zoom, rotation)
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not prepare wallpaper.')), 'image/jpeg', 0.94))
      const cropped = new File([blob], 'chat-wallpaper.jpg', { type: 'image/jpeg' })
      const compressed = await compressImageIfNeeded(cropped)
      onDone(compressed, { x: 50, y: 50 })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not prepare wallpaper.')
    }
  }

  return (
    <div className="relative flex min-h-[calc(100dvh-7rem)] w-full flex-col bg-transparent text-foreground">
      {/* Hidden native file input - this is what opens the device's photo picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {!previewUrl ? (
        <>
          <div className="flex flex-col items-center justify-center gap-4 px-6 py-10 text-center">
            <img src="/images/wallpaper/Glossy%20Neon%20Add%20Image%20Icon.png" alt="Add wallpaper photo" width="240" height="160" className="h-36 w-52 object-contain" />
            <div><p className="font-semibold">{initialImageLoading ? 'Loading current wallpaper…' : 'Choose a wallpaper photo'}</p><p className="mt-1 text-sm text-muted-foreground">Select a photo to open the wallpaper editor.</p></div>
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={initialImageLoading} className="rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 px-6 py-3 font-medium text-white disabled:opacity-50">Choose photo</button>
            <button type="button" onClick={onClose} className="rounded-xl px-6 py-2 text-sm text-muted-foreground hover:bg-muted">Cancel</button>
          </div>
          <section className="w-full border-t border-border px-4 py-6 sm:px-6">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Choose from wallpapers</h2>
                <p className="mt-1 text-sm text-muted-foreground">Pick a wallpaper to preview and edit before applying.</p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">309 wallpapers</span>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-5">
              {Array.from({ length: 310 }, (_, index) => index + 1).filter(number => number !== 188).map(number => {
                const filename = `wallpaper-${String(number).padStart(2, '0')}.jpg`
                return (
                  <button
                    key={number}
                    type="button"
                    onClick={() => void handleBuiltInWallpaperSelect(number)}
                    className="group relative aspect-[3/5] overflow-hidden rounded-xl border border-border bg-muted transition hover:border-pink-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                    aria-label={`Use wallpaper ${number}`}
                  >
                    <img
                      src={`/images/chat-wallpapers/${filename}`}
                      alt={`Wallpaper ${number}`}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                    />
                    <span className="absolute bottom-2 left-2 rounded-md bg-black/55 px-2 py-1 text-[11px] font-medium text-white backdrop-blur-sm">{String(number).padStart(3, '0')}</span>
                  </button>
                )
              })}
            </div>
          </section>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between px-4 py-3">
            <button onClick={handleCancel} className="text-muted-foreground hover:text-foreground p-1">
              <X className="h-6 w-6" />
            </button>
            <p className="text-foreground text-sm font-medium">{initialImageUrl ? 'Edit wallpaper' : 'Set wallpaper'}</p>
            <div className="w-8" />
          </div>

          <div className="flex flex-1 min-h-0 items-center justify-center overflow-hidden px-3 py-2 bg-muted/20">
            <div data-wallpaper-preview className="relative max-h-[54dvh] w-full max-w-xl overflow-hidden bg-slate-950" style={{ aspectRatio: targetRatio, maxWidth: `min(100%, ${Math.max(1, targetRatio * 54)}dvh)` }}>
              <canvas
                ref={previewCanvasRef}
                aria-label="Wallpaper preview"
                className="absolute inset-0 h-full w-full"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 border-t border-border bg-background p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            {error && <p role="alert" className="col-span-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600">{error}</p>}
            <label className="col-span-2 text-xs text-muted-foreground sm:col-span-1">
              <span className="mb-2 flex items-center justify-between"><span className="flex items-center gap-2"><ZoomIn className="h-4 w-4 text-pink-500" /> Zoom</span><span>{zoom}%</span></span>
              <input type="range" min="100" max="250" value={zoom} onChange={event => setZoom(Number(event.target.value))} className="w-full accent-pink-500" aria-label="Wallpaper zoom" />
            </label>
            <div className="col-span-2 grid grid-cols-3 gap-2 sm:col-span-1 sm:min-w-[300px]">
              <button type="button" onClick={() => setRotation(value => (value + 90) % 360)} className="flex min-h-10 items-center justify-center gap-1 rounded-xl border border-border px-2 text-xs hover:bg-muted"><RotateCw className="h-4 w-4 text-pink-500" /> Rotate</button>
              <button type="button" onClick={() => setPosition(value => ({ ...value, y: Math.max(0, value.y - 8) }))} className="flex min-h-10 items-center justify-center gap-1 rounded-xl border border-border px-2 text-xs hover:bg-muted"><ArrowUp className="h-4 w-4 text-pink-500" /> Move up</button>
              <button type="button" onClick={() => setPosition(value => ({ ...value, y: Math.min(100, value.y + 8) }))} className="flex min-h-10 items-center justify-center gap-1 rounded-xl border border-border px-2 text-xs hover:bg-muted"><ArrowDown className="h-4 w-4 text-pink-500" /> Move down</button>
            </div>
          </div>

          <div className="flex gap-3 p-4 pb-6">
            <button
              onClick={handleCancel}
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-muted text-foreground hover:bg-accent font-medium transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={handleDone}
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white font-medium disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {saving ? 'Saving...' : saveLabel}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
