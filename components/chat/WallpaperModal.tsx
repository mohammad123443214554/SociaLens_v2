'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Loader2, ZoomIn, RotateCw, ArrowUp, ArrowDown, ImagePlus, Check } from 'lucide-react'
import { compressImageIfNeeded } from '@/lib/utils/imageCompression'

interface WallpaperModalProps {
  onDone: (file: File, position: { x: number; y: number }) => void
  onClose: () => void
  saving?: boolean
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
export function WallpaperModal({ onDone, onClose, saving }: WallpaperModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [position, setPosition] = useState({ x: 50, y: 50 })
  const [zoom, setZoom] = useState(100)
  const [rotation, setRotation] = useState(0)

  // Kick the OS file picker open as soon as this modal mounts.
  useEffect(() => {
    fileInputRef.current?.click()

    const handleWindowFocus = () => {
      // Give the browser a moment to actually populate input.files after
      // the picker closes before we check it.
      setTimeout(() => {
        if (!fileInputRef.current?.files?.length && !file) {
          onClose()
        }
      }, 300)
    }
    window.addEventListener('focus', handleWindowFocus)
    return () => window.removeEventListener('focus', handleWindowFocus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0]
    if (!picked) return
    setFile(picked)
    setPreviewUrl(URL.createObjectURL(picked))
    setPosition({ x: 50, y: 50 })
    setZoom(100)
    setRotation(0)
  }

  const handleCancel = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(null)
    setPreviewUrl(null)
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
      const area = document.querySelector('[data-wallpaper-preview]')
      const rect = area?.getBoundingClientRect()
      const ratio = rect && rect.width > 0 && rect.height > 0 ? rect.width / rect.height : 1
      const width = 1400
      const height = Math.max(900, Math.round(width / ratio))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Photo editor is unavailable.')
      const rotated = Math.abs(rotation % 180) === 90
      const imageWidth = rotated ? image.naturalHeight : image.naturalWidth
      const imageHeight = rotated ? image.naturalWidth : image.naturalHeight
      const scale = Math.max(width / imageWidth, height / imageHeight) * zoom / 100
      context.save()
      context.beginPath()
      context.rect(0, 0, width, height)
      context.clip()
      context.translate(width / 2, height / 2 + ((50 - position.y) / 100) * height * 0.7)
      context.rotate(rotation * Math.PI / 180)
      context.scale(scale, scale)
      context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2)
      context.restore()
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not prepare wallpaper.')), 'image/jpeg', 0.94))
      const cropped = new File([blob], 'chat-wallpaper.jpg', { type: 'image/jpeg' })
      const compressed = await compressImageIfNeeded(cropped)
      onDone(compressed, { x: 50, y: 50 })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not prepare wallpaper.')
    }
  }

  return (
    <div className="fixed inset-0 z-[140] flex flex-col bg-background text-foreground">
      {/* Hidden native file input - this is what opens the device's photo picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {!previewUrl ? (
        // Waiting on the OS picker - nothing to show, it's a native popup.
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between px-4 py-3">
            <button onClick={handleCancel} className="text-muted-foreground hover:text-foreground p-1">
              <X className="h-6 w-6" />
            </button>
            <p className="text-foreground text-sm font-medium">Set wallpaper</p>
            <div className="w-8" />
          </div>

          <div data-wallpaper-preview className="relative flex-1 min-h-[260px] overflow-hidden touch-pan-y bg-slate-950 sm:min-h-[320px]">
            <div
              className="absolute inset-0 bg-no-repeat transition-[background-size,background-position,transform] duration-150"
              style={{
                backgroundImage: `url(${previewUrl})`,
                backgroundSize: `${zoom}% auto`,
                backgroundPosition: `${position.x}% ${position.y}%`,
                transform: `rotate(${rotation}deg) scale(${zoom / 100})`,
              }}
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/20 via-transparent to-slate-950/35" />
            <div className="pointer-events-none absolute left-3 top-4 max-w-[78%] rounded-2xl rounded-tl-md border border-white/15 bg-slate-950/60 px-3 py-2 text-xs text-white shadow-lg backdrop-blur-md">Incoming message preview</div>
            <div className="pointer-events-none absolute right-3 top-[32%] max-w-[78%] rounded-2xl rounded-tr-md bg-gradient-to-br from-pink-500 to-violet-600 px-3 py-2 text-xs text-white shadow-lg">Sent message preview</div>
          </div>
          <div className="grid grid-cols-2 gap-3 border-t border-border bg-background p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
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
              {saving ? 'Saving...' : 'Apply wallpaper'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
