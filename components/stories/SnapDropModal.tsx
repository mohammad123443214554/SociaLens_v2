'use client'

import { useState } from 'react'
import { Camera, X } from 'lucide-react'
import type { StorySnapDropOverlay } from '@/lib/types/database.types'

const makeId = () => globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 14)

export function SnapDropModal({ initialSnapDrop, onClose, onSave }: {
  initialSnapDrop?: StorySnapDropOverlay | null
  onClose: () => void
  onSave: (snapdrop: StorySnapDropOverlay) => void
}) {
  const [prompt, setPrompt] = useState(initialSnapDrop?.prompt || '')
  const [error, setError] = useState('')
  const save = () => {
    const clean = prompt.trim()
    if (!clean) { setError('Enter a prompt before adding SnapDrop.'); return }
    if (clean.length > 140) { setError('Keep the prompt within 140 characters.'); return }
    onSave({ id: initialSnapDrop?.id || makeId(), prompt: clean, x: initialSnapDrop?.x ?? 50, y: initialSnapDrop?.y ?? 62, scale: initialSnapDrop?.scale ?? 1, rotation: initialSnapDrop?.rotation ?? 0 })
  }
  return <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Create SnapDrop">
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl">
      <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Create SnapDrop</h2><button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-muted"><X className="h-5 w-5"/></button></div>
      <p className="mt-1 text-sm text-muted-foreground">Invite viewers to contribute one photo and an optional message.</p>
      <label className="mt-4 block text-sm font-medium" htmlFor="snapdrop-prompt">Prompt</label>
      <textarea id="snapdrop-prompt" value={prompt} maxLength={140} onChange={e=>{setPrompt(e.target.value);setError('')}} placeholder="What photo would you like people to share?" rows={3} className="mt-2 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"/>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>{error && <span role="alert" className="text-red-500">{error}</span>}</span><span>{prompt.length}/140</span></div>
      <div className="mt-4 flex justify-center"><div className="w-full max-w-[260px] rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 p-4 text-center text-white shadow-lg"><div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-white/20"><Camera className="h-5 w-5"/></div><div className="mt-2 text-xs font-bold tracking-widest">SNAPDROP</div><p className="mt-2 break-words text-sm font-semibold">{prompt.trim() || 'Your photo prompt'}</p><div className="mt-3 rounded-xl border border-white/50 bg-white/10 px-3 py-2 text-xs font-semibold">＋ Add Photo</div></div></div>
      <div className="mt-5 flex gap-2"><button type="button" onClick={onClose} className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button><button type="button" onClick={save} className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Add to Story</button></div>
    </div>
  </div>
}
