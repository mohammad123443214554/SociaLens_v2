'use client'

import { useRef } from 'react'
import { MoreVertical, RotateCw, Camera } from 'lucide-react'
import type { StorySnapDropOverlay } from '@/lib/types/database.types'

export function SnapDropCanvasSticker({
  snapdrop, selected = false, onSelect, onMove, onResize, onRotate, onMenu,
}: {
  snapdrop: StorySnapDropOverlay
  selected?: boolean
  onSelect?: () => void
  onMove?: (x: number, y: number) => void
  onResize?: (scale: number) => void
  onRotate?: (rotation: number) => void
  onMenu?: () => void
}) {
  const drag = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null)
  const resize = useRef<{ x: number; scale: number } | null>(null)
  const rotate = useRef<{ angle: number; rotation: number; cx: number; cy: number } | null>(null)

  return <div
    className={`absolute z-[60] w-[min(220px,70vw)] select-none rounded-2xl p-3 text-center text-white shadow-xl touch-none cursor-move ${selected ? 'outline outline-1 outline-white outline-offset-2' : ''}`}
    style={{ left: `${snapdrop.x}%`, top: `${snapdrop.y}%`, backgroundColor: snapdrop.color || '#7c3aed', transform: `translate(-50%,-50%) rotate(${snapdrop.rotation}deg) scale(${snapdrop.scale})` }}
    onPointerDown={event => {
      if ((event.target as HTMLElement).closest('button')) return
      event.preventDefault(); event.stopPropagation(); onSelect?.()
      drag.current = { x: event.clientX, y: event.clientY, originX: snapdrop.x, originY: snapdrop.y }
      event.currentTarget.setPointerCapture(event.pointerId)
    }}
    onPointerMove={event => {
      const d = drag.current
      if (!d || !event.currentTarget.hasPointerCapture(event.pointerId)) return
      const rect = event.currentTarget.parentElement?.getBoundingClientRect()
      if (!rect) return
      onMove?.(Math.max(12, Math.min(88, d.originX + (event.clientX - d.x) / rect.width * 100)), Math.max(10, Math.min(90, d.originY + (event.clientY - d.y) / rect.height * 100)))
    }}
    onPointerUp={event => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
    onPointerCancel={() => { drag.current = null }}
    onClick={event => { event.stopPropagation(); onSelect?.() }}
    aria-label="SnapDrop sticker; drag to move"
  >
    {selected && <>
      <button type="button" aria-label="SnapDrop options" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onMenu?.() }} className="absolute -right-3 -top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-white bg-black/85 text-white shadow"><MoreVertical className="h-4 w-4" /></button>
      <button type="button" aria-label="Resize SnapDrop" onPointerDown={e => { e.preventDefault(); e.stopPropagation(); resize.current = { x: e.clientX, scale: snapdrop.scale }; e.currentTarget.setPointerCapture(e.pointerId) }} onPointerMove={e => { const d = resize.current; if (!d || !e.currentTarget.hasPointerCapture(e.pointerId)) return; onResize?.(Math.max(.55, Math.min(2.5, d.scale + (e.clientX - d.x) / 140)) ) }} onPointerUp={() => { resize.current = null }} onPointerCancel={() => { resize.current = null }} className="absolute -bottom-2 -right-2 h-4 w-4 touch-none rounded-full border-2 border-white bg-violet-500 shadow" />
      <button type="button" aria-label="Rotate SnapDrop" onPointerDown={e => { e.preventDefault(); e.stopPropagation(); const r = e.currentTarget.parentElement?.getBoundingClientRect(); if (!r) return; rotate.current = { angle: Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)), rotation: snapdrop.rotation, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; e.currentTarget.setPointerCapture(e.pointerId) }} onPointerMove={e => { const d = rotate.current; if (!d || !e.currentTarget.hasPointerCapture(e.pointerId)) return; const a = Math.atan2(e.clientY - d.cy, e.clientX - d.cx); onRotate?.(d.rotation + (a - d.angle) * 180 / Math.PI) }} onPointerUp={() => { rotate.current = null }} onPointerCancel={() => { rotate.current = null }} className="absolute -bottom-2 -left-2 flex h-4 w-4 touch-none items-center justify-center rounded-full border-2 border-white bg-blue-500 text-white shadow"><RotateCw className="h-2.5 w-2.5" /></button>
    </>}
    <div className="flex items-center justify-center gap-1.5 text-[10px] font-extrabold tracking-[.18em]"><Camera className="h-3.5 w-3.5" /> SNAPDROP</div>
    <p className="mt-1.5 break-words text-center text-sm font-semibold">{snapdrop.prompt}</p>
    <div className="mt-2 rounded-xl border border-white/50 bg-white/15 px-3 py-2 text-xs font-bold">＋ Add Photo</div>
  </div>
}
