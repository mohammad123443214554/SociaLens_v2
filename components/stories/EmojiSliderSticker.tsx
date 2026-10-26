'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MoreVertical, RotateCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { StoryEmojiSliderOverlay } from '@/lib/types/database.types'
import { validateEmojiSliderScore } from '@/lib/utils/emojiSlider'

type Results = { response_count: number; average_score: number | null; bucket_0_20: number; bucket_21_40: number; bucket_41_60: number; bucket_61_80: number; bucket_81_100: number }

export function EmojiSliderSticker({ slider, selected = false, editable = false, preview = false, storyId, storyExpiresAt, userId, isOwner = false, onSelect, onMove, onResize, onRotate, onMenu, onInteractionChange }: {
  slider: StoryEmojiSliderOverlay; selected?: boolean; editable?: boolean; preview?: boolean; storyId?: string; storyExpiresAt?: string; userId?: string; isOwner?: boolean
  onSelect?: () => void; onMove?: (x:number,y:number) => void; onResize?: (scale:number) => void; onRotate?: (rotation:number) => void; onMenu?: () => void; onInteractionChange?: (active: boolean) => void
}) {
  const supabase = createClient()
  const router = useRouter()
  const storyExpired = !!storyExpiresAt && Number.isFinite(Date.parse(storyExpiresAt)) && Date.parse(storyExpiresAt) <= Date.now()
  const [value, setValue] = useState(50)
  const [savedValue, setSavedValue] = useState<number | null>(null)
  const [loading, setLoading] = useState(!editable && !preview)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [results, setResults] = useState<Results | null>(null)
  const [resultsLoading, setResultsLoading] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{x:number;y:number;originX:number;originY:number}|null>(null)
  const resize = useRef<{x:number;scale:number}|null>(null)
  const rotate = useRef<{angle:number;rotation:number;cx:number;cy:number}|null>(null)

  useEffect(() => {
    if (editable || preview || !storyId || !userId) { setLoading(false); return }
    if (storyExpiresAt && Date.parse(storyExpiresAt) <= Date.now()) { setError('This story has expired.'); setLoading(false); return }
    let alive = true
    ;(async () => {
      const { data: ownResponse, error: ownError } = await (supabase as any).from('story_emoji_slider_responses').select('score').eq('sticker_id', slider.id).maybeSingle()
      if (!alive) return
      if (ownError) { setError('Your previous response could not be loaded.'); setLoading(false); return }
      if (ownResponse && Number.isInteger(ownResponse.score)) { setSavedValue(ownResponse.score); setValue(ownResponse.score) }
      setLoading(false)
    })()
    return () => { alive = false }
  }, [editable, preview, slider.id, storyId, storyExpiresAt, userId])

  const scoreFromPointer = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return
    setValue(Math.max(0, Math.min(100, Math.round(((clientX - rect.left) / rect.width) * 100))))
  }
  const submit = async () => {
    if (storyExpired) { setError('This story has expired.'); return }
    if (!storyId || !userId || saving || loading || savedValue !== null || preview || editable) return
    setSaving(true); setError(''); setNotice('')
    const score = validateEmojiSliderScore(value)
    if (score === null) { setError('Choose a score between 0 and 100.'); setSaving(false); return }
    const { error: saveError } = await (supabase as any).from('story_emoji_slider_responses').insert({ sticker_id: slider.id, story_id: storyId, user_id: userId, score })
    if (saveError) {
      if (saveError.code === '23505') {
        const { data } = await (supabase as any).from('story_emoji_slider_responses').select('score').eq('sticker_id', slider.id).maybeSingle()
        if (data && Number.isInteger(data.score)) { setSavedValue(data.score); setValue(data.score); setNotice('Your response is saved.') }
        else setError('You may have already responded to this slider.')
      } else setError(saveError.message?.toLowerCase().includes('expired') ? 'This story has expired.' : 'Your response could not be saved. Please try again.')
    } else { setSavedValue(score); setNotice('Response saved. Thanks!') }
    setSaving(false)
  }
  const loadResults = async () => {
    if (!storyId || !isOwner || resultsLoading) return
    if (storyExpired) { setError('This story has expired.'); return }
    setShowResults(true)
    setResultsLoading(true)
    setError('')
    const { data, error: resultError } = await (supabase as any).rpc('get_story_emoji_slider_results', { p_sticker_id: slider.id })
    if (resultError || !data?.[0]) setError('Results are unavailable.')
    else setResults(data[0] as Results)
    setResultsLoading(false)
  }
  const moveStart = (event: React.PointerEvent<HTMLDivElement>) => { if(!editable)return;event.preventDefault();event.stopPropagation();onSelect?.();drag.current={x:event.clientX,y:event.clientY,originX:slider.x,originY:slider.y};event.currentTarget.setPointerCapture(event.pointerId) }
  const interactive = !editable && !preview && !!userId && savedValue === null && !loading && !storyExpired

  return <div className={`absolute z-[62] select-none rounded-2xl border border-white/30 bg-zinc-900/90 p-3.5 text-white shadow-xl backdrop-blur-sm ${editable?'touch-none cursor-move': 'pointer-events-auto'} ${selected?'outline outline-1 outline-white outline-offset-2':''}`}
    style={{position:'absolute',display:'block',visibility:'visible',opacity:1,zIndex:62,left:`${Number.isFinite(slider.x)?slider.x:50}%`,top:`${Number.isFinite(slider.y)?slider.y:50}%`,backgroundColor:slider.color || '#7c3aed',width:`${Math.min(70,40*(Number.isFinite(slider.scale)&&slider.scale>0?slider.scale:1))}%`,transform:`translate(-50%,-50%) rotate(${Number.isFinite(slider.rotation)?slider.rotation:0}deg)`}}
    onPointerDown={moveStart}
    onPointerMove={event=>{const d=drag.current;if(!editable||!d||!event.currentTarget.hasPointerCapture(event.pointerId))return;const rect=event.currentTarget.parentElement?.getBoundingClientRect();if(!rect)return;onMove?.(Math.max(12,Math.min(88,d.originX+(event.clientX-d.x)/rect.width*100)),Math.max(10,Math.min(90,d.originY+(event.clientY-d.y)/rect.height*100)))}}
    onPointerUp={event=>{drag.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId)}} onPointerCancel={()=>{drag.current=null}} onClick={event=>{event.stopPropagation();onSelect?.()}} aria-label={`Emoji slider: ${slider.question}`}>
    {editable&&selected&&<><button type="button" aria-label="Emoji slider options" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onMenu?.()}} className="absolute -right-3 -top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-white bg-black/85 text-white shadow"><MoreVertical className="h-4 w-4"/></button>
    <button type="button" aria-label="Resize emoji slider" onPointerDown={e=>{e.preventDefault();e.stopPropagation();resize.current={x:e.clientX,scale:slider.scale};e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{const d=resize.current;if(!d||!e.currentTarget.hasPointerCapture(e.pointerId))return;onResize?.(Math.max(.55,Math.min(2.5,d.scale+(e.clientX-d.x)/140)))} } onPointerUp={()=>{resize.current=null}} className="absolute -bottom-2 -right-2 h-4 w-4 touch-none rounded-full border-2 border-white bg-violet-500 shadow"/>
    <button type="button" aria-label="Rotate emoji slider" onPointerDown={e=>{e.preventDefault();e.stopPropagation();const r=e.currentTarget.parentElement?.getBoundingClientRect();if(!r)return;rotate.current={angle:Math.atan2(e.clientY-(r.top+r.height/2),e.clientX-(r.left+r.width/2)),rotation:slider.rotation,cx:r.left+r.width/2,cy:r.top+r.height/2};e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{const d=rotate.current;if(!d||!e.currentTarget.hasPointerCapture(e.pointerId))return;const a=Math.atan2(e.clientY-d.cy,e.clientX-d.cx);onRotate?.(d.rotation+(a-d.angle)*180/Math.PI)}} onPointerUp={()=>{rotate.current=null}} className="absolute -bottom-2 -left-2 flex h-4 w-4 touch-none items-center justify-center rounded-full border-2 border-white bg-blue-500 text-white shadow"><RotateCw className="h-2.5 w-2.5"/></button></>}
    <p className="mb-3 break-words text-center text-sm font-bold leading-snug">{slider.question}</p>
    <div className="flex items-center gap-2.5"><span className="text-[10px] text-white/80">0</span><div ref={trackRef} role="slider" tabIndex={interactive?0:-1} aria-label={slider.question} aria-valuemin={0} aria-valuemax={100} aria-valuenow={savedValue ?? value} aria-disabled={!interactive} onKeyDown={event=>{if(!interactive)return;let next=value;if(event.key==='ArrowRight'||event.key==='ArrowUp')next=Math.min(100,value+1);else if(event.key==='ArrowLeft'||event.key==='ArrowDown')next=Math.max(0,value-1);else if(event.key==='Home')next=0;else if(event.key==='End')next=100;else return;event.preventDefault();event.stopPropagation();setValue(next)}} onFocus={()=>onInteractionChange?.(true)} onBlur={()=>onInteractionChange?.(false)} onPointerDown={event=>{if(!interactive)return;event.preventDefault();event.stopPropagation();onInteractionChange?.(true);event.currentTarget.setPointerCapture(event.pointerId);scoreFromPointer(event.clientX)}} onPointerMove={event=>{if(interactive&&event.currentTarget.hasPointerCapture(event.pointerId)){event.stopPropagation();scoreFromPointer(event.clientX)}}} onPointerUp={event=>{event.stopPropagation();onInteractionChange?.(false);if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId)}} onPointerCancel={()=>onInteractionChange?.(false)} className={`relative h-2.5 min-w-0 flex-1 rounded-full bg-white/25 ${interactive?'cursor-pointer touch-none':'cursor-default'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white`}><div className="absolute inset-y-0 left-0 rounded-full bg-white/80" style={{width:`${savedValue ?? value}%`}}/><span className="absolute top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-white text-2xl shadow-lg" style={{left:`${savedValue ?? value}%`}}>{slider.emoji}</span></div><span className="text-[10px] text-white/80">100</span></div>
    <div className="mt-3 flex items-center justify-between gap-2 text-[10px] text-white/70"><span>Not much</span><span className="font-semibold text-white">{savedValue ?? value}/100</span><span>A lot</span></div>
    {!editable&&!preview&&<div className="mt-3">
      {isOwner
        ? storyExpired
          ? <p className="text-center text-xs text-white/70">This story has expired.</p>
          : <button type="button" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();void loadResults()}} className="w-full rounded-lg bg-white/15 px-3 py-2 text-xs font-semibold hover:bg-white/25">View results</button>
        : savedValue!==null
          ? <p className="text-center text-xs font-medium text-emerald-200">{notice||'Your response is saved.'}</p>
          : storyExpired
            ? <p className="text-center text-xs text-white/70">This story has expired.</p>
            : <button type="button" disabled={loading||saving} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();if(!userId){router.push('/login');return}void submit()}} className="w-full rounded-lg bg-white px-3 py-2 text-xs font-bold text-zinc-900 disabled:opacity-60">{loading?'Loading…':saving?'Submitting…':!userId?'Sign in to respond':'Submit response'}</button>}
    </div>}
    {error&&<p role="alert" className="mt-2 text-center text-[11px] text-red-200">{error}</p>}
    {showResults&&<div className="mt-3 rounded-xl bg-black/30 p-3" role="dialog" aria-label="Emoji slider results"><div className="flex items-center justify-between"><strong className="text-xs">Results</strong><button type="button" onClick={e=>{e.stopPropagation();setShowResults(false)}} aria-label="Close results" className="text-xs underline">Close</button></div>{resultsLoading?<p className="mt-2 text-xs">Loading results…</p>:results?<><p className="mt-2 text-xs">{results.response_count} responses · Average {results.average_score===null?'—':Math.round(results.average_score)}/100</p><div className="mt-3 space-y-2">{[['0–20',results.bucket_0_20],['21–40',results.bucket_21_40],['41–60',results.bucket_41_60],['61–80',results.bucket_61_80],['81–100',results.bucket_81_100]].map(([label,count])=><div key={String(label)} className="flex items-center gap-2 text-[10px]"><span className="w-12">{label}</span><div className="h-1.5 flex-1 rounded-full bg-white/15"><div className="h-1.5 rounded-full bg-white/80" style={{width:`${results.response_count?Number(count)/results.response_count*100:0}%`}}/></div><span>{count}</span></div>)}</div></>:<p className="mt-2 text-xs">Loading results…</p>}</div>}
  </div>
}
