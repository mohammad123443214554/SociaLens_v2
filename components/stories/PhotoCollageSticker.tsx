'use client'

import { useEffect, useState } from 'react'
import { MoreVertical, RotateCw } from 'lucide-react'
import type { StoryCollageOverlay, StoryCollagePhoto } from '@/lib/types/database.types'

export function PhotoCollageSticker({ collage, editable=false, selected=false, preview=false, onSelect, onMove, onResize, onRotate, onEdit, onDelete }: {
 collage: StoryCollageOverlay; editable?: boolean; selected?: boolean; preview?: boolean
 onSelect?:()=>void; onMove?:(x:number,y:number)=>void; onResize?:(scale:number)=>void; onRotate?:(rotation:number)=>void; onEdit?:()=>void; onDelete?:()=>void
}) {
 const [localUrls,setLocalUrls]=useState<Record<string,string>>({})
 useEffect(()=>{
  const created:Record<string,string>={}
  collage.photos.forEach((p:StoryCollagePhoto)=>{if(p.file)created[p.id]=URL.createObjectURL(p.file)})
  setLocalUrls(created)
  return ()=>Object.values(created).forEach(url=>URL.revokeObjectURL(url))
 },[collage.photos])
 const [drag,setDrag]=useState<{x:number;y:number;originX:number;originY:number}|null>(null)
 const [resize,setResize]=useState<{x:number;scale:number}|null>(null)
 const [rotate,setRotate]=useState<{angle:number;rotation:number;cx:number;cy:number}|null>(null)
 return <div className={`absolute z-[58] touch-none select-none ${editable?'cursor-move':'pointer-events-none'} ${selected?'outline outline-1 outline-white outline-offset-2':''}`} style={{left:`${collage.x}%`,top:`${collage.y}%`,width:`${Math.min(78,48*collage.scale)}%`,aspectRatio:'3 / 4',transform:`translate(-50%,-50%) rotate(${collage.rotation}deg)`}} onPointerDown={e=>{if(!editable)return;e.preventDefault();e.stopPropagation();onSelect?.();setDrag({x:e.clientX,y:e.clientY,originX:collage.x,originY:collage.y});e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(!drag||!editable||!e.currentTarget.hasPointerCapture(e.pointerId))return;const rect=e.currentTarget.parentElement?.getBoundingClientRect();if(rect)onMove?.(Math.max(8,Math.min(92,drag.originX+(e.clientX-drag.x)/rect.width*100)),Math.max(8,Math.min(92,drag.originY+(e.clientY-drag.y)/rect.height*100)))}} onPointerUp={e=>{setDrag(null);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}} onPointerCancel={()=>setDrag(null)} onClick={e=>{e.stopPropagation();onSelect?.()}} aria-label="Photo collage sticker">
  <div className="absolute inset-0" style={{transform:collage.layout==='scrapbook'?'rotate(-2deg)':''}}>
   {collage.photos.map((photo,i)=><div key={photo.id} className={`absolute overflow-hidden ${collage.layout==='scrapbook'?'border-[3px] border-white bg-white p-1 shadow-xl':'border border-white/70'}`} style={{left:`${photo.x}%`,top:`${photo.y}%`,width:`${photo.width}%`,height:`${photo.height}%`,transform:`rotate(${photo.rotation}deg)`,zIndex:collage.layout==='scrapbook'?i+1:1,boxSizing:'border-box'}}>
    {/* eslint-disable-next-line @next/next/no-img-element */}<img src={photo.url||localUrls[photo.id]||''} alt={`Collage photo ${i+1}`} draggable={false} className="h-full w-full object-cover"/>
   </div>)}
  </div>
  {editable&&selected&&<><button type="button" aria-label="Photo Collage options" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onEdit?.()}} className="absolute -right-3 -top-3 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-white bg-black/85 text-white shadow"><MoreVertical className="h-4 w-4"/></button><button type="button" aria-label="Resize collage" onPointerDown={e=>{e.preventDefault();e.stopPropagation();setResize({x:e.clientX,scale:collage.scale});e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(resize&&e.currentTarget.hasPointerCapture(e.pointerId))onResize?.(Math.max(.55,Math.min(1.6,resize.scale+(e.clientX-resize.x)/180)))}} onPointerUp={()=>setResize(null)} className="absolute -bottom-2 -right-2 z-20 h-4 w-4 rounded-full border-2 border-white bg-pink-500"/><button type="button" aria-label="Rotate collage" onPointerDown={e=>{e.preventDefault();e.stopPropagation();const r=e.currentTarget.parentElement?.getBoundingClientRect();if(r)setRotate({angle:Math.atan2(e.clientY-r.top-r.height/2,e.clientX-r.left-r.width/2),rotation:collage.rotation,cx:r.left+r.width/2,cy:r.top+r.height/2});e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(rotate&&e.currentTarget.hasPointerCapture(e.pointerId))onRotate?.(rotate.rotation+(Math.atan2(e.clientY-rotate.cy,e.clientX-rotate.cx)-rotate.angle)*180/Math.PI)}} onPointerUp={()=>setRotate(null)} className="absolute -bottom-2 -left-2 z-20 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-blue-500"><RotateCw className="h-2.5 w-2.5 text-white"/></button><button type="button" aria-label="Delete collage" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onDelete?.()}} className="absolute -top-3 -left-3 z-20 h-7 w-7 rounded-full border border-white bg-red-600 text-sm text-white">×</button></>}
 </div>
}
