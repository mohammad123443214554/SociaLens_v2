'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Timer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CountdownSticker } from './CountdownSticker'

const MAX_MS = 24 * 60 * 60 * 1000
const pad = (n: number) => String(n).padStart(2, '0')
const localValue = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
const parseLocal = (value: string) => new Date(value).getTime()
const minTarget = (now: number) => Math.ceil((now + 60_000) / 60_000) * 60_000
const maxTarget = (now: number) => Math.floor((now + MAX_MS) / 60_000) * 60_000
const clampTarget = (target: number, now: number) => Math.min(maxTarget(now), Math.max(minTarget(now), target))
interface Props { onClose: () => void; onAdd: (title: string, targetAt: string) => void; initialTitle?: string; initialTargetAt?: string }
export function CountdownModal({ onClose, onAdd, initialTitle = '', initialTargetAt }: Props) {
  const [now, setNow] = useState(() => Date.now())
  const [title, setTitle] = useState(initialTitle)
  const [targetAt, setTargetAt] = useState(() => {
    const t = initialTargetAt ? new Date(initialTargetAt).getTime() : Date.now() + 60 * 60 * 1000
    return localValue(new Date(clampTarget(t, Date.now())))
  })
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id) }, [])
  const minDate = useMemo(() => localValue(new Date(minTarget(now))).slice(0,10), [now])
  const maxDate = useMemo(() => localValue(new Date(maxTarget(now))).slice(0,10), [now])
  const target = parseLocal(targetAt)
  const validTarget = Number.isFinite(target) && target > now && target <= now + MAX_MS
  const updateTarget = (value: string) => {
    const parsed = parseLocal(value)
    if (!Number.isFinite(parsed)) return
    setTargetAt(localValue(new Date(clampTarget(parsed, Date.now()))))
  }
  return <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Create countdown sticker">
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl">
      <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-lg font-semibold"><Timer className="h-5 w-5"/> Countdown</h2><button type="button" onClick={onClose} aria-label="Close countdown" className="rounded-full p-1 hover:bg-muted"><X className="h-5 w-5"/></button></div>
      <label className="mt-4 block text-sm font-medium">Countdown title</label>
      <input value={title} onChange={e => setTitle(e.target.value.slice(0,60))} maxLength={60} placeholder="e.g. My birthday" className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"/>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div><label className="block text-sm font-medium">Date</label><input type="date" min={minDate} max={maxDate} value={targetAt.slice(0,10)} onChange={e => updateTarget(`${e.target.value}T${targetAt.slice(11,16)}`)} className="mt-1.5 w-full min-w-0 rounded-xl border border-border bg-background px-2 py-2.5 text-sm"/></div>
        <div><label className="block text-sm font-medium">Time</label><input type="time" value={targetAt.slice(11,16)} onChange={e => updateTarget(`${targetAt.slice(0,10)}T${e.target.value}`)} className="mt-1.5 w-full min-w-0 rounded-xl border border-border bg-background px-2 py-2.5 text-sm"/></div>
      </div>
      <div className="mt-5 rounded-2xl bg-black/90 px-4 py-5 text-center text-white"><p className="mb-3 text-sm font-semibold">{title.trim() || 'Countdown'}</p><CountdownSticker title={title.trim() || 'Countdown'} targetAt={new Date(clampTarget(Number.isFinite(target) ? target : now+3600000, now)).toISOString()} x={50} y={50} scale={1} rotation={0} preview/></div>
      <div className="mt-5 flex gap-2"><Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button><Button type="button" className="flex-1" disabled={!title.trim() || !validTarget} onClick={() => onAdd(title.trim(), new Date(target).toISOString())}>Add to Story</Button></div>
    </div>
  </div>
}
