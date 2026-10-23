'use client'

import { MoreVertical, RotateCw } from 'lucide-react'
import type { StoryGIFOverlay } from '@/lib/types/database.types'

export function GIFSticker({ sticker, selected, onSelect, onMove, onResize, onRotate, onMenu }: {
  sticker: StoryGIFOverlay
  selected: boolean
  onSelect: () => void
  onMove: (x: number, y: number) => void
  onResize: (scale: number) => void
  onRotate: (rotation: number) => void
  onMenu: () => void
}) {
  return <div
    onClick={event => { event.stopPropagation(); onSelect() }}
    onPointerDown={event => { event.preventDefault(); event.stopPropagation(); onSelect(); (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId); (event.currentTarget as HTMLDivElement).dataset.dragX = String(event.clientX); (event.currentTarget as HTMLDivElement).dataset.dragY = String(event.clientY); (event.currentTarget as HTMLDivElement).dataset.originX = String(sticker.x); (event.currentTarget as HTMLDivElement).dataset.originY = String(sticker.y) }}
    onPointerMove={event => {
      const el = event.currentTarget
      if (!el.hasPointerCapture(event.pointerId)) return
      const rect = el.parentElement?.getBoundingClientRect()
      if (!rect) return
      const dx = (event.clientX - Number(el.dataset.dragX || event.clientX)) / rect.width * 100
      const dy = (event.clientY - Number(el.dataset.dragY || event.clientY)) / rect.height * 100
      if (Math.abs(dx) + Math.abs(dy) > 0) {
        onMove(Math.max(4, Math.min(96, Number(el.dataset.originX || sticker.x) + dx)), Math.max(4, Math.min(96, Number(el.dataset.originY || sticker.y) + dy)))
        el.dataset.dragX = String(event.clientX); el.dataset.dragY = String(event.clientY)
        el.dataset.originX = String(Math.max(4, Math.min(96, Number(el.dataset.originX || sticker.x) + dx)))
        el.dataset.originY = String(Math.max(4, Math.min(96, Number(el.dataset.originY || sticker.y) + dy)))
      }
    }}
    onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
    onPointerCancel={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
    className={`absolute z-40 cursor-move select-none touch-none ${selected ? 'outline outline-1 outline-white outline-offset-2' : ''}`}
    style={{ left: `${sticker.x}%`, top: `${sticker.y}%`, transform: `translate(-50%, -50%) rotate(${sticker.rotation}deg) scale(${sticker.scale})` }}
    aria-label="GIF sticker; drag to move"
  >
    <img src={sticker.url} alt={sticker.title || 'GIF sticker'} draggable={false} className="pointer-events-none max-h-40 max-w-[min(55vw,220px)] object-contain" />
    {selected && <>
      <button type="button" aria-label="GIF options" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onMenu() }} className="absolute -right-3 -top-8 flex h-6 w-6 items-center justify-center rounded-full border border-white bg-black/80 text-white shadow"><MoreVertical className="h-4 w-4" /></button>
      <button type="button" aria-label="Rotate GIF" title="Drag to rotate" onPointerDown={e => { e.preventDefault(); e.stopPropagation(); const startX=e.clientX; const startY=e.clientY; const start=sticker.rotation; (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId); (e.currentTarget as HTMLButtonElement).dataset.startX=String(startX); (e.currentTarget as HTMLButtonElement).dataset.startY=String(startY); (e.currentTarget as HTMLButtonElement).dataset.rotation=String(start) }} onPointerMove={e => { const el=e.currentTarget; if (!el.hasPointerCapture(e.pointerId)) return; onRotate(Math.max(-180,Math.min(180,sticker.rotation+(e.clientX-Number(el.dataset.startX||e.clientX))*1.2))); el.dataset.startX=String(e.clientX); el.dataset.rotation=String(sticker.rotation) }} onPointerUp={e => { if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId) }} className="absolute -bottom-2 -left-2 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-blue-500 text-white shadow"><RotateCw className="h-2.5 w-2.5" /></button>
      <button type="button" aria-label="Resize GIF" title="Drag to resize" onPointerDown={e => { e.preventDefault(); e.stopPropagation(); (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId); (e.currentTarget as HTMLButtonElement).dataset.startX=String(e.clientX); (e.currentTarget as HTMLButtonElement).dataset.scale=String(sticker.scale) }} onPointerMove={e => { const el=e.currentTarget; if(!el.hasPointerCapture(e.pointerId))return; onResize(Math.max(.35,Math.min(2.8,Number(el.dataset.scale||sticker.scale)+(e.clientX-Number(el.dataset.startX||e.clientX))/100))) }} onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}} className="absolute -bottom-2 -right-2 h-4 w-4 touch-none rounded-full border-2 border-white bg-pink-500 shadow" />
    </>}
  </div>
}
