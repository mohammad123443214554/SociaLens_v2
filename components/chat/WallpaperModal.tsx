'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Loader2, Move } from 'lucide-react'
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
  const dragAreaRef = useRef<HTMLDivElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [position, setPosition] = useState({ x: 50, y: 50 })
  const draggingRef = useRef(false)

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

  const handlePointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true
    updatePositionFromEvent(e.clientX, e.clientY)
  }
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return
    updatePositionFromEvent(e.clientX, e.clientY)
  }
  const stopDragging = () => { draggingRef.current = false }

  const handleCancel = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(null)
    setPreviewUrl(null)
    onClose()
  }

  const handleDone = async () => {
    if (!file) return
    const compressed = await compressImageIfNeeded(file)
    onDone(compressed, position)
  }

  return (
    <div className="fixed inset-0 bg-black z-[140] flex flex-col">
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
          <Loader2 className="h-6 w-6 text-white/60 animate-spin" />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between px-4 py-3">
            <button onClick={handleCancel} className="text-white/80 hover:text-white p-1">
              <X className="h-6 w-6" />
            </button>
            <p className="text-white text-sm font-medium flex items-center gap-1.5">
              <Move className="h-3.5 w-3.5" /> Drag to adjust
            </p>
            <div className="w-8" />
          </div>

          <div
            ref={dragAreaRef}
            className="flex-1 relative overflow-hidden touch-none cursor-move select-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stopDragging}
            onPointerLeave={stopDragging}
          >
            <div
              className="absolute inset-0 bg-no-repeat"
              style={{
                backgroundImage: `url(${previewUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: `${position.x}% ${position.y}%`,
              }}
            />
          </div>

          <div className="flex gap-3 p-4 pb-6">
            <button
              onClick={handleCancel}
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-white/10 text-white font-medium disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={handleDone}
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white font-medium disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? 'Saving...' : 'Done'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
