'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Timer, CalendarDays, Clock3, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CountdownSticker } from './CountdownSticker'

const MAX_MS = 24 * 60 * 60 * 1000
const pad = (n: number) => String(n).padStart(2, '0')
const localValue = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
const parseLocal = (value: string) => new Date(value).getTime()
const minTarget = (now: number) => Math.ceil((now + 60_000) / 60_000) * 60_000
const maxTarget = (now: number) => Math.floor((now + MAX_MS) / 60_000) * 60_000
const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`
const monthLabel = (date: Date) => date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
interface Props { onClose: () => void; onAdd: (title: string, targetAt: string) => void; initialTitle?: string; initialTargetAt?: string }
type Picker = 'date' | 'time' | null

export function CountdownModal({ onClose, onAdd, initialTitle = '', initialTargetAt }: Props) {
  const [now, setNow] = useState(() => Date.now())
  const [title, setTitle] = useState(initialTitle)
  const [targetAt, setTargetAt] = useState(() => {
    if (!initialTargetAt) return ''
    const t = new Date(initialTargetAt).getTime()
    return Number.isFinite(t) && t > Date.now() && t <= Date.now() + MAX_MS ? localValue(new Date(t)) : ''
  })
  const [activePicker, setActivePicker] = useState<Picker>(null)
  const [visibleMonth, setVisibleMonth] = useState(() => new Date())
  const [hour, setHour] = useState('')
  const [minute, setMinute] = useState('')
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id) }, [])

  const minDate = useMemo(() => dateKey(new Date(minTarget(now))), [now])
  const maxDate = useMemo(() => dateKey(new Date(maxTarget(now))), [now])
  const chosenDate = targetAt ? targetAt.slice(0, 10) : ''
  const chosenTime = targetAt ? targetAt.slice(11, 16) : ''
  const target = parseLocal(targetAt)
  const validTarget = !!targetAt && Number.isFinite(target) && target > now && target <= now + MAX_MS
  const minDay = new Date(`${minDate}T12:00:00`)
  const maxDay = new Date(`${maxDate}T12:00:00`)
  const firstWeekday = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1).getDay()
  const daysInMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate()
  const calendarCells = Array.from({ length: firstWeekday + daysInMonth }, (_, i) => i < firstWeekday ? null : i - firstWeekday + 1)
  const updateTarget = (date: string, time: string) => {
    if (!date || !time) { setTargetAt(''); return }
    const parsed = parseLocal(`${date}T${time}`)
    if (!Number.isFinite(parsed) || parsed <= Date.now() || parsed > Date.now() + MAX_MS) return
    setTargetAt(localValue(new Date(parsed)))
  }
  const selectDate = (day: number) => {
    const date = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day, 12)
    const key = dateKey(date)
    if (key < minDate || key > maxDate) return
    const currentTime = chosenTime || ''
    setTargetAt('')
    if (currentTime) {
      const parsed = parseLocal(`${key}T${currentTime}`)
      if (parsed > Date.now() && parsed <= Date.now() + MAX_MS) setTargetAt(localValue(new Date(parsed)))
      else { setHour(''); setMinute('') }
    } else { setHour(''); setMinute('') }
    setActivePicker(null)
  }
  const chooseTime = (h: string, m: string) => {
    setHour(h); setMinute(m)
    if (!chosenDate) return
    updateTarget(chosenDate, `${h}:${m}`)
  }
  const openTime = () => {
    if (chosenTime) { setHour(chosenTime.slice(0, 2)); setMinute(chosenTime.slice(3, 5)) }
    else { setHour(''); setMinute('') }
    setActivePicker(activePicker === 'time' ? null : 'time')
  }
  const canGoPrev = visibleMonth.getFullYear() > minDay.getFullYear() || (visibleMonth.getFullYear() === minDay.getFullYear() && visibleMonth.getMonth() > minDay.getMonth())
  const canGoNext = visibleMonth.getFullYear() < maxDay.getFullYear() || (visibleMonth.getFullYear() === maxDay.getFullYear() && visibleMonth.getMonth() < maxDay.getMonth())

  return <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Create countdown sticker" onClick={onClose}>
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-lg font-semibold"><Timer className="h-5 w-5"/> Countdown</h2><button type="button" onClick={onClose} aria-label="Close countdown" className="rounded-full p-1 hover:bg-muted"><X className="h-5 w-5"/></button></div>
      <label className="mt-4 block text-sm font-medium">Countdown title</label>
      <input value={title} onChange={e => setTitle(e.target.value.slice(0,60))} maxLength={60} placeholder="e.g. My birthday" className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"/>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="relative">
          <label className="block text-sm font-medium">Date</label>
          <button type="button" aria-label="Choose countdown date" aria-expanded={activePicker === 'date'} onClick={() => { setVisibleMonth(chosenDate ? new Date(`${chosenDate}T12:00:00`) : new Date()); setActivePicker(activePicker === 'date' ? null : 'date') }} className="mt-1.5 flex min-h-[47px] w-full items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-left text-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className={chosenDate ? '' : 'text-muted-foreground'}>{chosenDate ? new Date(`${chosenDate}T12:00:00`).toLocaleDateString() : 'Select date'}</span><CalendarDays className="h-4 w-4 shrink-0"/></button>
          {activePicker === 'date' && <div className="absolute left-0 top-full z-[230] mt-2 w-[min(310px,calc(100vw-3rem))] rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-xl">
            <div className="mb-3 flex items-center justify-between gap-2"><button type="button" disabled={!canGoPrev} aria-label="Previous month" onClick={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth()-1, 1))} className="rounded-lg p-2 hover:bg-muted disabled:opacity-30"><ChevronLeft className="h-4 w-4"/></button><span className="text-sm font-semibold">{monthLabel(visibleMonth)}</span><button type="button" disabled={!canGoNext} aria-label="Next month" onClick={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth()+1, 1))} className="rounded-lg p-2 hover:bg-muted disabled:opacity-30"><ChevronRight className="h-4 w-4"/></button></div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">{['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <span key={d} className="py-1">{d}</span>)}</div>
            <div className="grid grid-cols-7 gap-1">{calendarCells.map((day, i) => { if (day === null) return <span key={`empty-${i}`}/>; const date = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day, 12); const key = dateKey(date); const disabled = key < minDate || key > maxDate; const selected = key === chosenDate; return <button key={key} type="button" disabled={disabled} onClick={() => selectDate(day)} className={`flex aspect-square items-center justify-center rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? 'bg-primary text-primary-foreground' : disabled ? 'cursor-not-allowed text-muted-foreground/40' : 'hover:bg-muted'}`}>{day}</button> })}</div>
          </div>}
        </div>
        <div className="relative">
          <label className="block text-sm font-medium">Time</label>
          <button type="button" aria-label="Choose countdown time" aria-expanded={activePicker === 'time'} onClick={openTime} className="mt-1.5 flex min-h-[47px] w-full items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-left text-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className={chosenTime ? '' : 'text-muted-foreground'}>{chosenTime || 'Select time'}</span><Clock3 className="h-4 w-4 shrink-0"/></button>
          {activePicker === 'time' && <div className="absolute right-0 top-full z-[230] mt-2 w-[min(280px,calc(100vw-3rem))] rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-xl">
            <p className="mb-3 text-sm font-semibold">Choose time</p><div className="grid grid-cols-2 gap-3"><label className="text-xs text-muted-foreground">Hour<select value={hour} onChange={e => chooseTime(e.target.value, minute || '00')} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="">Hour</option>{Array.from({length:24},(_,h)=>pad(h)).map(h=><option key={h} value={h}>{h}</option>)}</select></label><label className="text-xs text-muted-foreground">Minute<select value={minute} onChange={e => chooseTime(hour || '00', e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="">Minute</option>{Array.from({length:60},(_,m)=>pad(m)).map(m=><option key={m} value={m}>{m}</option>)}</select></label></div>
            {!chosenDate && <p className="mt-3 text-xs text-muted-foreground">Choose a date first to set the time.</p>}
            <div className="mt-3 flex justify-end"><Button type="button" variant="outline" size="sm" onClick={() => setActivePicker(null)}>Done</Button></div>
          </div>}
        </div>
      </div>
      <div className="mt-5 rounded-2xl bg-black/90 px-4 py-5 text-center text-white"><p className="mb-3 text-sm font-semibold">{title.trim() || 'Countdown'}</p><CountdownSticker title={title.trim() || 'Countdown'} targetAt={new Date(validTarget ? target : now+3600000).toISOString()} x={50} y={50} scale={1} rotation={0} preview/></div>
      <div className="mt-5 flex gap-2"><Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button><Button type="button" className="flex-1" disabled={!title.trim() || !validTarget} onClick={() => onAdd(title.trim(), new Date(target).toISOString())}>Add to Story</Button></div>
    </div>
  </div>
}
