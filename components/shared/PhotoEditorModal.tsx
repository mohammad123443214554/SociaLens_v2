'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Move } from 'lucide-react'
import { PHOTO_FILTERS } from '@/lib/utils/photoFilters'
import { compressImageIfNeeded } from '@/lib/utils/imageCompression'

interface PhotoEditorModalProps {
  /** 'avatar' shows a round crop frame, 'cover' shows a wide banner frame. */
  variant: 'avatar' | 'cover'
  onDone: (file: File) => void
  onClose: () => void
  saving?: boolean
}

/**
 * Same two-step flow as the chat wallpaper picker (open the OS file picker
 * immediately, then show a full-screen adjust screen), plus a filter strip
 * along the bottom. The chosen position + filter get baked into the actual
 * image pixels via canvas before upload, so the result looks the same
 * everywhere it's shown afterward - not just a live CSS preview here.
 */
export function PhotoEditorModal({ variant, onDone, onClose, saving }: PhotoEditorModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragAreaRef = useRef<HTMLDivElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [position, setPosition] = useState({ x: 50, y: 50 })
  const [filterId, setFilterId] = useState('none')
  const [zoom, setZoom] = useState(1)
  const [baking, setBaking] = useState(false)
  const draggingRef = useRef(false)

  const activeFilter = PHOTO_FILTERS.find(f => f.id === filterId) ?? PHOTO_FILTERS[0]

  useEffect(() => {
    fileInputRef.current?.click()
    const handleWindowFocus = () => {
      setTimeout(() => {
        if (!fileInputRef.current?.files?.length && !file) onClose()
      }, 300)
    }
    window.addEventListener('focus', handleWindowFocus)
    return () => window.removeEventListener('focus', handleWindowFocus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }
  }, [previewUrl])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0]
    if (!picked) return
    setFile(picked)
    setPreviewUrl(URL.createObjectURL(picked))
    setPosition({ x: 50, y: 50 })
    setZoom(1)
    setFilterId('none')
  }

  const clampPercent = (n: number) => Math.max(0, Math.min(100, n))
  const updatePositionFromEvent = (clientX: number, clientY: number) => {
    const el = dragAreaRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = clampPercent(((clientX - rect.left) / rect.width) * 100)
    const y = clampPercent(((clientY - rect.top) / rect.height) * 100)
    setPosition({ x, y })
  }
  const handlePointerDown = (e: React.PointerEvent) => { draggingRef.current = true; updatePositionFromEvent(e.clientX, e.clientY) }
  const handlePointerMove = (e: React.PointerEvent) => { if (draggingRef.current) updatePositionFromEvent(e.clientX, e.clientY) }
  const stopDragging = () => { draggingRef.current = false }

  const handleCancel = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(null)
    setPreviewUrl(null)
    onClose()
  }

  // Renders the chosen crop/position/zoom/filter onto a canvas so the
  // saved file actually contains the edit, not just a CSS preview that
  // would disappear the moment this modal closes.
  const bakeImage = async (): Promise<File> => {
    if (!file || !previewUrl) throw new Error('No file')
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = previewUrl
    })

    const outW = variant === 'avatar' ? 600 : 1500
    const outH = variant === 'avatar' ? 600 : 500
    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d')!
    ctx.filter = activeFilter.css === 'none' ? 'none' : activeFilter.css

    // Cover-fit the image into the output frame at the chosen zoom, then
    // shift it so the dragged position is centered - same math as the
    // wallpaper picker uses for its background-position drag.
    const frameRatio = outW / outH
    const imgRatio = img.width / img.height
    let drawW: number, drawH: number
    if (imgRatio > frameRatio) {
      drawH = outH * zoom
      drawW = drawH * imgRatio
    } else {
      drawW = outW * zoom
      drawH = drawW / imgRatio
    }
    const maxOffsetX = Math.max(0, drawW - outW)
    const maxOffsetY = Math.max(0, drawH - outH)
    const offsetX = -(position.x / 100) * maxOffsetX
    const offsetY = -(position.y / 100) * maxOffsetY

    ctx.drawImage(img, offsetX, offsetY, drawW, drawH)

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
    if (!blob) throw new Error('Failed to render image')
    const baked = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
    return compressImageIfNeeded(baked)
  }

  const handleDone = async () => {
    if (!file) return
    setBaking(true)
    try {
      const finalFile = await bakeImage()
      onDone(finalFile)
    } finally {
      setBaking(false)
    }
  }

  const busy = saving || baking

  return (
    <div className="fixed inset-0 bg-black z-[140] flex flex-col">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

      {!file ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 text-white animate-spin" />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between px-4 py-3 shrink-0">
            <button onClick={handleCancel} className="text-white text-sm font-medium">Cancel</button>
            <p className="text-white text-sm font-semibold">{variant === 'avatar' ? 'Edit profile photo' : 'Edit cover photo'}</p>
            <button onClick={handleDone} disabled={busy} className="text-pink-400 text-sm font-semibold disabled:opacity-50">
              {busy ? 'Saving...' : 'Done'}
            </button>
          </div>

          <div
            ref={dragAreaRef}
            className={`relative overflow-hidden touch-none select-none mx-auto w-full ${variant === 'avatar' ? 'max-w-sm aspect-square' : 'aspect-[3/1]'}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stopDragging}
            onPointerLeave={stopDragging}
          >
            {previewUrl && (
              <img
                src={previewUrl}
                alt=""
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                style={{
                  objectPosition: `${position.x}% ${position.y}%`,
                  transform: `scale(${zoom})`,
                  filter: activeFilter.css === 'none' ? undefined : activeFilter.css,
                }}
                draggable={false}
              />
            )}
            {variant === 'avatar' && (
              <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)', borderRadius: '9999px' }} />
            )}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/50 text-white text-[11px] px-2 py-1 rounded-full pointer-events-none">
              <Move className="h-3 w-3" /> Drag to reposition
            </div>
          </div>

          <div className="px-6 py-3 shrink-0">
            <input
              type="range" min={1} max={2.5} step={0.05} value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              className="w-full accent-pink-500"
            />
          </div>

          <div className="shrink-0 border-t border-white/10 py-3">
            <div className="flex gap-3 overflow-x-auto px-4 pb-1">
              {PHOTO_FILTERS.map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilterId(f.id)}
                  className="flex flex-col items-center gap-1 shrink-0"
                >
                  <div className={`h-14 w-14 rounded-lg overflow-hidden border-2 ${filterId === f.id ? 'border-pink-500' : 'border-transparent'}`}>
                    {previewUrl && (
                      <img
                        src={previewUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        style={{ filter: f.css === 'none' ? undefined : f.css }}
                      />
                    )}
                  </div>
                  <span className={`text-[10px] ${filterId === f.id ? 'text-pink-400 font-semibold' : 'text-white/70'}`}>{f.name}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
