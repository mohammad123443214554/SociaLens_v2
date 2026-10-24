'use client'

import { useEffect, useRef, useState } from 'react'
import { MoreVertical, RotateCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { StoryPollOverlay } from '@/lib/types/database.types'

export function PollSticker({ poll, selected = false, editable = false, preview = false, storyId, userId, isOwner = false, onSelect, onMove, onResize, onRotate, onMenu }: {
  poll: StoryPollOverlay
  selected?: boolean
  editable?: boolean
  preview?: boolean
  storyId?: string
  userId?: string
  isOwner?: boolean
  onSelect?: () => void
  onMove?: (x: number, y: number) => void
  onResize?: (scale: number) => void
  onRotate?: (rotation: number) => void
  onMenu?: () => void
}) {
  const supabase = createClient()
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({})
  const [myVote, setMyVote] = useState<string | null>(null)
  const [loading, setLoading] = useState(!editable)
  const [voting, setVoting] = useState(false)
  const [error, setError] = useState('')
  const drag = useRef<{x:number;y:number;originX:number;originY:number}|null>(null)
  const resize = useRef<{x:number;scale:number}|null>(null)
  const rotate = useRef<{angle:number;rotation:number;cx:number;cy:number}|null>(null)
  useEffect(() => {
    if (editable || !storyId || !userId) { setLoading(false); return }
    let alive = true
    ;(async () => {
      const { data: saved, error: pollError } = await supabase.from('story_polls').select('vote_counts').eq('id', poll.id).eq('story_id', storyId).maybeSingle()
      if (!alive) return
      if (pollError || !saved) { setError('Poll results are unavailable.'); setLoading(false); return }
      setVoteCounts((saved.vote_counts || {}) as Record<string,number>)
      const { data: vote } = await supabase.from('story_poll_votes').select('option_id').eq('poll_id', poll.id).eq('user_id', userId).maybeSingle()
      if (!alive) return
      setMyVote(vote?.option_id || null)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [editable, poll.id, storyId, userId])
  const vote = async (optionId: string) => {
    if (!storyId || !userId || isOwner || myVote || voting || loading) return
    setVoting(true); setError('')
    const { error: voteError } = await supabase.from('story_poll_votes').insert({ poll_id: poll.id, user_id: userId, option_id: optionId })
    if (voteError) {
      if (voteError.code === '23505') {
        const { data } = await supabase.from('story_poll_votes').select('option_id').eq('poll_id', poll.id).eq('user_id', userId).maybeSingle()
        setMyVote(data?.option_id || null)
      } else setError(voteError.message.includes('expired') ? 'This poll has expired.' : 'Your vote could not be saved. Please try again.')
    } else {
      setMyVote(optionId)
      setVoteCounts(counts => ({ ...counts, [optionId]: (counts[optionId] || 0) + 1 }))
    }
    setVoting(false)
  }
  const total = Object.values(voteCounts).reduce((sum, count) => sum + (Number(count)||0), 0)
  const moveStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!editable) return
    event.preventDefault(); event.stopPropagation(); onSelect?.()
    drag.current = {x:event.clientX,y:event.clientY,originX:poll.x,originY:poll.y}
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  return <div className={`absolute z-40 w-[min(240px,72vw)] select-none rounded-2xl p-3 shadow-xl ${editable ? 'touch-none cursor-move' : 'pointer-events-auto'} ${selected ? 'outline outline-1 outline-white outline-offset-2' : ''}`}
    style={{left:`${poll.x}%`,top:`${poll.y}%`,transform:`translate(-50%,-50%) rotate(${poll.rotation}deg) scale(${poll.scale})`,backgroundColor:poll.color||'#ec4899',color:'#fff'}}
    onPointerDown={moveStart}
    onPointerMove={event => { const d=drag.current; if(!editable||!d||!event.currentTarget.hasPointerCapture(event.pointerId))return; const rect=event.currentTarget.parentElement?.getBoundingClientRect(); if(!rect)return; const dx=(event.clientX-d.x)/rect.width*100; const dy=(event.clientY-d.y)/rect.height*100; onMove?.(Math.max(12,Math.min(88,d.originX+dx)),Math.max(10,Math.min(90,d.originY+dy))) }}
    onPointerUp={event=>{drag.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId)}}
    onPointerCancel={()=>{drag.current=null}}
    onClick={event=>{event.stopPropagation();onSelect?.()}}
    aria-label={`Poll sticker: ${poll.question}`}>
    {editable && selected && <><button type="button" aria-label="Poll options" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onMenu?.()}} className="absolute -right-3 -top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-white bg-black/85 text-white shadow"><MoreVertical className="h-4 w-4"/></button><button type="button" aria-label="Resize poll" onPointerDown={e=>{e.preventDefault();e.stopPropagation();resize.current={x:e.clientX,scale:poll.scale};e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{const d=resize.current;if(!d||!e.currentTarget.hasPointerCapture(e.pointerId))return;onResize?.(Math.max(.55,Math.min(1.8,d.scale+(e.clientX-d.x)/180)))} } onPointerUp={()=>{resize.current=null}} className="absolute -bottom-2 -right-2 h-4 w-4 rounded-full border-2 border-white bg-pink-500" /><button type="button" aria-label="Rotate poll" onPointerDown={e=>{e.preventDefault();e.stopPropagation();const r=e.currentTarget.parentElement?.getBoundingClientRect();if(!r)return;rotate.current={angle:Math.atan2(e.clientY-(r.top+r.height/2),e.clientX-(r.left+r.width/2))*180/Math.PI,rotation:poll.rotation,cx:r.left+r.width/2,cy:r.top+r.height/2};e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{const d=rotate.current;if(!d||!e.currentTarget.hasPointerCapture(e.pointerId))return;const angle=Math.atan2(e.clientY-d.cy,e.clientX-d.cx)*180/Math.PI;onRotate?.(Math.round(d.rotation+angle-d.angle))}} onPointerUp={()=>{rotate.current=null}} className="absolute -bottom-2 -left-2 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-blue-500"><RotateCw className="h-2.5 w-2.5"/></button></>}
    <p className="mb-2 break-words text-center text-sm font-bold leading-snug">{poll.question}</p>
    <div className="space-y-1.5">{poll.options.map(option => { const count=Number(voteCounts[option.id]||0); const pct=total?Math.round(count/total*100):0; return <button type="button" key={option.id} disabled={editable||preview||loading||voting||isOwner||!!myVote||!userId} onClick={event=>{event.stopPropagation();void vote(option.id)}} className={`relative w-full overflow-hidden rounded-lg border border-white/70 bg-black/15 px-2.5 py-2 text-left text-xs font-semibold text-white ${!editable&&!myVote&&!isOwner?'hover:bg-black/25':''} disabled:cursor-default`}><span className="absolute inset-y-0 left-0 bg-white/25" style={{width:`${pct}%`}}/><span className="relative flex items-center justify-between gap-2"><span className="break-words">{option.label}</span>{(!editable&&(myVote||isOwner))&&<span className="shrink-0 tabular-nums">{pct}%</span>}</span></button>})}</div>
    {!editable && <p className="mt-2 text-center text-[10px] font-medium text-white/90">{preview?'Preview':loading?'Loading poll…':isOwner?`${total} vote${total===1?'':'s'}`:myVote?`${total} vote${total===1?'':'s'} · Your vote saved`:'Tap an option to vote'}</p>}
    {!editable && error && <p role="alert" className="mt-1 text-center text-[10px] text-white">{error}</p>}
  </div>
}
