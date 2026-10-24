'use client'

import { useRef } from 'react'
import { MoreVertical, RotateCw } from 'lucide-react'
import type { StoryQuizOverlay } from '@/lib/types/database.types'

export function QuizSticker({ quiz, selected = false, editable = false, preview = false, onSelect, onMove, onResize, onRotate, onMenu }: {
  quiz: StoryQuizOverlay; selected?: boolean; editable?: boolean; preview?: boolean
  onSelect?: () => void; onMove?: (x:number,y:number) => void; onResize?: (scale:number) => void; onRotate?: (rotation:number) => void; onMenu?: () => void
}) {
  const drag = useRef<{x:number;y:number;originX:number;originY:number}|null>(null)
  const resize = useRef<{x:number;scale:number}|null>(null)
  const rotate = useRef<{angle:number;rotation:number;cx:number;cy:number}|null>(null)
  return <div className={`absolute z-40 w-[min(240px,72vw)] select-none rounded-2xl p-3 text-white shadow-xl ${editable ? 'touch-none cursor-move' : 'pointer-events-auto'} ${selected ? 'outline outline-1 outline-white outline-offset-2' : ''}`}
    style={{left:`${quiz.x}%`,top:`${quiz.y}%`,transform:`translate(-50%,-50%) rotate(${quiz.rotation}deg) scale(${quiz.scale})`,backgroundColor:quiz.color||'#7c3aed'}}
    onPointerDown={event=>{if(!editable){event.stopPropagation();return}event.preventDefault();event.stopPropagation();onSelect?.();drag.current={x:event.clientX,y:event.clientY,originX:quiz.x,originY:quiz.y};event.currentTarget.setPointerCapture(event.pointerId)}}
    onPointerMove={event=>{const d=drag.current;if(!editable||!d||!event.currentTarget.hasPointerCapture(event.pointerId))return;const rect=event.currentTarget.parentElement?.getBoundingClientRect();if(!rect)return;onMove?.(Math.max(12,Math.min(88,d.originX+(event.clientX-d.x)/rect.width*100)),Math.max(10,Math.min(90,d.originY+(event.clientY-d.y)/rect.height*100)))}}
    onPointerUp={event=>{drag.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId)}}
    onPointerCancel={()=>{drag.current=null}} onClick={event=>{event.stopPropagation();onSelect?.()}} aria-label={`Quiz sticker: ${quiz.question}`}>
    {editable&&selected&&<><button type="button" aria-label="Quiz options" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onMenu?.()}} className="absolute -right-3 -top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-white bg-black/85 text-white shadow"><MoreVertical className="h-4 w-4"/></button>
    <button type="button" aria-label="Resize quiz" onPointerDown={e=>{e.preventDefault();e.stopPropagation();resize.current={x:e.clientX,scale:quiz.scale};e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(!resize.current||!e.currentTarget.hasPointerCapture(e.pointerId))return;onResize?.(Math.max(.55,Math.min(2.5,resize.current.scale+(e.clientX-resize.current.x)/140)))} } onPointerUp={()=>{resize.current=null}} className="absolute -bottom-2 -right-2 h-4 w-4 touch-none rounded-full border-2 border-white bg-violet-500 shadow"/>
    <button type="button" aria-label="Rotate quiz" onPointerDown={e=>{e.preventDefault();e.stopPropagation();const r=e.currentTarget.parentElement?.getBoundingClientRect();if(!r)return;rotate.current={angle:Math.atan2(e.clientY-(r.top+r.height/2),e.clientX-(r.left+r.width/2)),rotation:quiz.rotation,cx:r.left+r.width/2,cy:r.top+r.height/2};e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(!rotate.current||!e.currentTarget.hasPointerCapture(e.pointerId))return;const a=Math.atan2(e.clientY-rotate.current.cy,e.clientX-rotate.current.cx);onRotate?.(rotate.current.rotation+(a-rotate.current.angle)*180/Math.PI)}} onPointerUp={()=>{rotate.current=null}} className="absolute -bottom-2 -left-2 flex h-4 w-4 touch-none items-center justify-center rounded-full border-2 border-white bg-blue-500 text-white shadow"><RotateCw className="h-2.5 w-2.5"/></button></>}
    <div className="mb-2 text-center text-xs font-extrabold uppercase tracking-widest opacity-90">Quiz</div>
    <p className="mb-3 whitespace-pre-wrap break-words text-center text-sm font-bold leading-snug">{quiz.question}</p>
    <div className="space-y-2">{quiz.options.map((option,index)=><div key={option.id} className="rounded-lg border border-white/70 bg-black/10 px-3 py-2 text-sm font-semibold">{option.label}</div>)}</div>
  </div>
}
