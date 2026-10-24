'use client'

import { useEffect, useRef, useState } from 'react'
import { MoreVertical, RotateCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { StoryQuizOverlay } from '@/lib/types/database.types'

export function QuizSticker({ quiz, selected = false, editable = false, preview = false, storyId, userId, isOwner = false, onSelect, onMove, onResize, onRotate, onMenu }: {
  quiz: StoryQuizOverlay; selected?: boolean; editable?: boolean; preview?: boolean; storyId?: string; userId?: string; isOwner?: boolean
  onSelect?: () => void; onMove?: (x:number,y:number) => void; onResize?: (scale:number) => void; onRotate?: (rotation:number) => void; onMenu?: () => void
}) {
  const supabase = createClient()
  const [correctOptionId, setCorrectOptionId] = useState<string | null>(editable ? quiz.correctOptionId : null)
  const [myAnswer, setMyAnswer] = useState<string | null>(null)
  const [loading, setLoading] = useState(!editable && !preview)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const drag = useRef<{x:number;y:number;originX:number;originY:number}|null>(null)
  const resize = useRef<{x:number;scale:number}|null>(null)
  const rotate = useRef<{angle:number;rotation:number;cx:number;cy:number}|null>(null)

  useEffect(() => {
    if (editable || preview || !storyId || !userId) { setLoading(false); return }
    let alive = true
    ;(async () => {
      const { data: quizRow, error: quizError } = await (supabase as any).from('story_quizzes').select('correct_option_id').eq('id', quiz.id).eq('story_id', storyId).maybeSingle()
      if (!alive) return
      if (quizError || !quizRow) { setError('Quiz is unavailable.'); setLoading(false); return }
      setCorrectOptionId(quizRow.correct_option_id)
      const { data: myAnswerRow, error: answerError } = await (supabase as any).from('story_quiz_answers').select('option_id').eq('quiz_id', quiz.id).eq('user_id', userId).maybeSingle()
      if (!alive) return
      if (answerError) { setError('Your previous answer could not be loaded.'); setLoading(false); return }
      setMyAnswer(myAnswerRow?.option_id ?? null)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [editable, preview, quiz.id, storyId, userId])

  const answer = async (optionId: string) => {
    if (!storyId || !userId || loading || saving || preview || editable) return
    setSaving(true); setError('')
    const { error: saveError } = await (supabase as any).from('story_quiz_answers').upsert({ quiz_id: quiz.id, user_id: userId, option_id: optionId }, { onConflict: 'quiz_id,user_id' })
    if (saveError) setError(saveError.message?.includes('expired') ? 'This story has expired.' : 'Your answer could not be saved. Please try again.')
    else {
      setMyAnswer(optionId)
    }
    setSaving(false)
  }
  const foreground = quiz.color || '#7c3aed'
  const moveStart = (event: React.PointerEvent<HTMLDivElement>) => { if(!editable)return;event.preventDefault();event.stopPropagation();onSelect?.();drag.current={x:event.clientX,y:event.clientY,originX:quiz.x,originY:quiz.y};event.currentTarget.setPointerCapture(event.pointerId) }

  return <div className={`absolute z-[60] w-[min(240px,72vw)] select-none rounded-2xl p-3 text-white shadow-xl ${editable?'touch-none cursor-move':'pointer-events-auto cursor-pointer'} ${selected?'outline outline-1 outline-white outline-offset-2':''}`}
    style={{left:`${quiz.x}%`,top:`${quiz.y}%`,transform:`translate(-50%,-50%) rotate(${quiz.rotation}deg) scale(${quiz.scale})`,backgroundColor:foreground}}
    onPointerDown={moveStart}
    onPointerMove={event=>{const d=drag.current;if(!editable||!d||!event.currentTarget.hasPointerCapture(event.pointerId))return;const rect=event.currentTarget.parentElement?.getBoundingClientRect();if(!rect)return;onMove?.(Math.max(12,Math.min(88,d.originX+(event.clientX-d.x)/rect.width*100)),Math.max(10,Math.min(90,d.originY+(event.clientY-d.y)/rect.height*100)))}}
    onPointerUp={event=>{drag.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId)}} onPointerCancel={()=>{drag.current=null}} onClick={event=>{event.stopPropagation();onSelect?.()}} aria-label={`Quiz sticker: ${quiz.question}`}>
    {editable&&selected&&<><button type="button" aria-label="Quiz options" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onMenu?.()}} className="absolute -right-3 -top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-white bg-black/85 text-white shadow"><MoreVertical className="h-4 w-4"/></button>
    <button type="button" aria-label="Resize quiz" onPointerDown={e=>{e.preventDefault();e.stopPropagation();resize.current={x:e.clientX,scale:quiz.scale};e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{const d=resize.current;if(!d||!e.currentTarget.hasPointerCapture(e.pointerId))return;onResize?.(Math.max(.55,Math.min(2.5,d.scale+(e.clientX-d.x)/140)))} } onPointerUp={()=>{resize.current=null}} className="absolute -bottom-2 -right-2 h-4 w-4 touch-none rounded-full border-2 border-white bg-violet-500 shadow"/>
    <button type="button" aria-label="Rotate quiz" onPointerDown={e=>{e.preventDefault();e.stopPropagation();const r=e.currentTarget.parentElement?.getBoundingClientRect();if(!r)return;rotate.current={angle:Math.atan2(e.clientY-(r.top+r.height/2),e.clientX-(r.left+r.width/2)),rotation:quiz.rotation,cx:r.left+r.width/2,cy:r.top+r.height/2};e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{const d=rotate.current;if(!d||!e.currentTarget.hasPointerCapture(e.pointerId))return;const a=Math.atan2(e.clientY-d.cy,e.clientX-d.cx);onRotate?.(d.rotation+(a-d.angle)*180/Math.PI)}} onPointerUp={()=>{rotate.current=null}} className="absolute -bottom-2 -left-2 flex h-4 w-4 touch-none items-center justify-center rounded-full border-2 border-white bg-blue-500 text-white shadow"><RotateCw className="h-2.5 w-2.5"/></button></>}
    <p className="mb-2 whitespace-pre-wrap break-words text-center text-sm font-bold leading-snug">{quiz.question}</p>
    <div className="space-y-1.5">{quiz.options.map(option=>{const answered=!!myAnswer;const correct=correctOptionId===option.id;const chosen=myAnswer===option.id;return <button type="button" key={option.id} disabled={editable||preview||loading||saving||!userId} onClick={event=>{event.stopPropagation();void answer(option.id)}} className={`w-full rounded-lg border px-2.5 py-2 text-left text-xs font-semibold transition-colors disabled:cursor-default ${answered && correct ? 'border-emerald-200 bg-green-600 text-white ring-2 ring-emerald-200' : answered && chosen && !correct ? 'border-red-200 bg-red-600 text-white ring-2 ring-red-200' : 'border-white/70 bg-black/15'}`}><span className="flex items-center justify-between gap-2"><span className="break-words">{option.label}</span>{answered&&(correct?'✓ Correct':chosen?'✕ Incorrect':null)&&<span className="shrink-0">{correct?'✓ Correct':chosen?'✕ Incorrect':''}</span>}</span></button>})}</div>
    {!editable&&!preview&&<p className="mt-2 text-center text-[11px] font-medium">{loading?'Loading quiz…':myAnswer?(myAnswer===correctOptionId?'Correct answer!':'Incorrect answer. The correct option is shown in green.'):'Choose an answer'}</p>}
    {error&&<p role="alert" className="mt-1 text-center text-[11px]">{error}</p>}
  </div>
}
