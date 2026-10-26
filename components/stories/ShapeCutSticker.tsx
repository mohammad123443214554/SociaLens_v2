'use client'

import { useEffect, useState } from 'react'
import { MoreVertical, RotateCw } from 'lucide-react'
import { getShapeCutPath } from '@/lib/utils/shapeCut'
import type { StoryShapeCutOverlay } from '@/lib/types/database.types'

export function ShapeCutSticker({ sticker, editable=false, selected=false, onSelect, onMove, onResize, onRotate, onMenu }: {
  sticker: StoryShapeCutOverlay; editable?: boolean; selected?: boolean
  onSelect?:()=>void; onMove?:(x:number,y:number)=>void; onResize?:(scale:number)=>void; onRotate?:(rotation:number)=>void; onMenu?:()=>void
}) {
  const [localUrl,setLocalUrl]=useState('')
  useEffect(()=>{if(!sticker.file){setLocalUrl(sticker.photoUrl||'');return}const url=URL.createObjectURL(sticker.file);setLocalUrl(url);return()=>URL.revokeObjectURL(url)},[sticker.file,sticker.photoUrl])
  const [drag,setDrag]=useState<{x:number;y:number;originX:number;originY:number}|null>(null)
  const [resize,setResize]=useState<{x:number;scale:number}|null>(null)
  const [rotate,setRotate]=useState<{angle:number;rotation:number;cx:number;cy:number}|null>(null)
  const path=getShapeCutPath(sticker.shapeId)
  const clipId=`shapecut-${sticker.id.replace(/[^a-zA-Z0-9_-]/g,'')}`
  return <div className={`absolute z-[58] touch-none select-none ${editable?'cursor-move':'pointer-events-none'} ${selected?'outline outline-1 outline-white outline-offset-2':''}`} style={{left:`${sticker.x}%`,top:`${sticker.y}%`,width:`${Math.min(100,55*sticker.scale)}%`,aspectRatio:'1 / 1',transform:`translate(-50%,-50%) rotate(${sticker.rotation}deg)`}} onPointerDown={e=>{if(!editable)return;e.preventDefault();e.stopPropagation();onSelect?.();setDrag({x:e.clientX,y:e.clientY,originX:sticker.x,originY:sticker.y});e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(!drag||!editable||!e.currentTarget.hasPointerCapture(e.pointerId))return;const rect=e.currentTarget.parentElement?.getBoundingClientRect();if(rect)onMove?.(Math.max(5,Math.min(95,drag.originX+(e.clientX-drag.x)/rect.width*100)),Math.max(5,Math.min(95,drag.originY+(e.clientY-drag.y)/rect.height*100)))}} onPointerUp={e=>{setDrag(null);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}} onPointerCancel={()=>setDrag(null)} onClick={e=>{e.stopPropagation();onSelect?.()}} aria-label="ShapeCut photo sticker">
    <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible" aria-hidden="true">
      <defs><clipPath id={clipId}><path d={path}/></clipPath></defs>
      {localUrl&&<image href={localUrl} x={-sticker.cropX} y={-sticker.cropY} width={100*sticker.zoom} height={100*sticker.zoom} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId})`}/>}
      <path d={path} fill="none" stroke={sticker.borderColor||'#ffffff'} strokeWidth={sticker.borderWidth||0} vectorEffect="non-scaling-stroke"/>
    </svg>
    {editable&&selected&&<><button type="button" aria-label="ShapeCut options" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onMenu?.()}} className="absolute -right-3 -top-3 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-white bg-black/85 text-white shadow"><MoreVertical className="h-4 w-4"/></button><button type="button" aria-label="Resize ShapeCut sticker" title="Drag to resize" onPointerDown={e=>{e.preventDefault();e.stopPropagation();setResize({x:e.clientX,scale:sticker.scale});e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(resize&&e.currentTarget.hasPointerCapture(e.pointerId))onResize?.(Math.max(.55,Math.min(1.6,resize.scale+(e.clientX-resize.x)/180)))} } onPointerUp={()=>setResize(null)} className="absolute -bottom-2 -right-2 z-20 h-4 w-4 rounded-full border-2 border-white bg-pink-500"/><button type="button" aria-label="Rotate ShapeCut sticker" title="Drag to rotate" onPointerDown={e=>{e.preventDefault();e.stopPropagation();const r=e.currentTarget.parentElement?.getBoundingClientRect();if(r)setRotate({angle:Math.atan2(e.clientY-r.top-r.height/2,e.clientX-r.left-r.width/2),rotation:sticker.rotation,cx:r.left+r.width/2,cy:r.top+r.height/2});e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(rotate&&e.currentTarget.hasPointerCapture(e.pointerId))onRotate?.(rotate.rotation+(Math.atan2(e.clientY-rotate.cy,e.clientX-rotate.cx)-rotate.angle)*180/Math.PI)}} onPointerUp={()=>setRotate(null)} className="absolute -bottom-2 -left-2 z-20 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-blue-500"><RotateCw className="h-2.5 w-2.5 text-white"/></button></>}
  </div>
}
