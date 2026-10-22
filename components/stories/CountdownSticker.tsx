'use client'

import { useEffect, useState } from 'react'
import { Timer } from 'lucide-react'

export type StoryCountdownOverlay = { id: string; title: string; targetAt: string; x: number; y: number; scale: number; rotation: number; color?: string }
export function getCountdownParts(targetAt: string, now: number) {
  const remaining = Math.max(0, new Date(targetAt).getTime() - now)
  const total = Math.floor(remaining / 1000)
  return { ended: remaining <= 0, days: Math.floor(total / 86400), hours: Math.floor((total % 86400) / 3600), minutes: Math.floor((total % 3600) / 60), seconds: total % 60 }
}
export function CountdownSticker({ title, targetAt, x, y, scale, rotation, color = '#7c3aed', preview = false }: { title: string; targetAt: string; x: number; y: number; scale: number; rotation: number; color?: string; preview?: boolean }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id) }, [targetAt])
  const p = getCountdownParts(targetAt, now)
  return <div className={`inline-flex max-w-[90%] flex-col items-center rounded-2xl border border-white/70 px-3 py-2 text-white shadow-lg ${preview ? 'mx-auto' : ''}`} style={{ backgroundColor: color, left: preview ? undefined : `${x}%`, top: preview ? undefined : `${y}%`, transform: preview ? undefined : `translate(-50%, -50%) rotate(${rotation}deg) scale(${scale})` }}>
    <span className="max-w-full truncate text-xs font-semibold">{title}</span>
    {p.ended ? <span className="mt-1 text-sm font-bold">Countdown Ended</span> : <span className="mt-1 flex items-center gap-1.5 font-mono text-xs font-bold tabular-nums"><Timer className="h-3.5 w-3.5"/>{p.days > 0 && <span>{p.days}d</span>}<span>{String(p.hours).padStart(2,'0')}h</span><span>{String(p.minutes).padStart(2,'0')}m</span><span>{String(p.seconds).padStart(2,'0')}s</span></span>}
  </div>
}
