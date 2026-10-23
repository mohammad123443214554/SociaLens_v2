'use client'

import { useEffect, useState } from 'react'

export type StoryCountdownOverlay = { id: string; title: string; targetAt: string; x: number; y: number; scale: number; rotation: number; color?: string }

export function getCountdownParts(targetAt: string, now: number) {
  const remaining = Math.max(0, new Date(targetAt).getTime() - now)
  const total = Math.floor(remaining / 1000)
  return { ended: remaining <= 0, days: Math.floor(total / 86400), hours: Math.floor((total % 86400) / 3600), minutes: Math.floor((total % 3600) / 60), seconds: total % 60 }
}

export function CountdownSticker({ title, targetAt, x, y, scale, rotation, color = '#7c3aed', preview = false, embedded = false }: { title: string; targetAt: string; x: number; y: number; scale: number; rotation: number; color?: string; preview?: boolean; embedded?: boolean }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id) }, [targetAt])
  const p = getCountdownParts(targetAt, now)
  const timeParts = [
    { value: String(Math.min(23, p.hours + p.days * 24)).padStart(2, '0'), label: 'hours' },
    { value: String(p.minutes).padStart(2, '0'), label: 'minutes' },
    { value: String(p.seconds).padStart(2, '0'), label: 'seconds' },
  ]
  const useGradient = color.toLowerCase() === '#7c3aed'
  return <div className={`relative inline-flex max-w-[90%] min-w-[188px] flex-col rounded-md px-3 py-2.5 text-white shadow-lg ${preview ? 'mx-auto' : ''}`} style={{ background: useGradient ? 'linear-gradient(115deg, #d946ef 0%, #8b5cf6 52%, #38bdf8 100%)' : color, left: preview || embedded ? undefined : `${x}%`, top: preview || embedded ? undefined : `${y}%`, transform: preview || embedded ? undefined : `translate(-50%, -50%) rotate(${rotation}deg) scale(${scale})` }}>
    <span className="mb-2 block max-w-full truncate text-[10px] font-bold uppercase tracking-[0.12em] text-white/80">{title || 'COUNTDOWN NAME'}</span>
    {p.ended ? <span className="rounded-sm bg-white/90 px-2 py-2 text-center text-sm font-bold text-violet-700">Countdown Ended</span> : <div className="flex items-center gap-1" aria-label={`${timeParts[0].value} hours ${timeParts[1].value} minutes ${timeParts[2].value} seconds remaining`}>
      {timeParts.map((part, index) => <div key={part.label} className="flex min-w-0 flex-1 items-center gap-1">
        <span className="flex h-10 min-w-0 flex-1 items-center justify-center rounded-[3px] bg-white/90 px-1 font-mono text-xl font-bold leading-none tabular-nums text-violet-700 shadow-sm">{part.value}</span>
        {index < 2 && <span className="text-sm font-bold text-white/90">:</span>}
      </div>)}
    </div>}
    <span className="mt-1.5 text-[9px] font-semibold text-white/85">{p.ended ? 'Countdown finished' : 'Set end date and time'}</span>
  </div>
}
