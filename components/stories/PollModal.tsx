'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import type { StoryPollOverlay } from '@/lib/types/database.types'

const makeId = () => globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 14)

export function PollModal({ initialPoll, onClose, onSave }: {
  initialPoll?: StoryPollOverlay | null
  onClose: () => void
  onSave: (poll: StoryPollOverlay) => void
}) {
  const [question, setQuestion] = useState(initialPoll?.question || '')
  const [options, setOptions] = useState(() => initialPoll?.options?.map(option => ({ ...option })) || [{ id: makeId(), label: '' }, { id: makeId(), label: '' }])
  const [color, setColor] = useState(initialPoll?.color || '#ec4899')
  const [error, setError] = useState('')
  useEffect(() => { const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }; window.addEventListener('keydown', handleKey); return () => window.removeEventListener('keydown', handleKey) }, [onClose])
  const normalized = options.map(option => option.label.trim().toLocaleLowerCase())
  const duplicate = normalized.some((label, index) => label && normalized.indexOf(label) !== index)
  const canSave = !!question.trim() && question.trim().length <= 180 && options.length >= 2 && options.every(option => option.label.trim() && option.label.trim().length <= 80) && !duplicate
  const save = () => {
    if (!canSave) { setError(duplicate ? 'Each answer option must be unique.' : 'Enter a question and 2–4 non-empty options (question up to 180 characters, options up to 80).'); return }
    onSave({ id: initialPoll?.id || makeId(), question: question.trim(), options: options.map(option => ({ id: option.id || makeId(), label: option.label.trim() })), color, x: initialPoll?.x ?? 50, y: initialPoll?.y ?? 50, scale: initialPoll?.scale ?? 1, rotation: initialPoll?.rotation ?? 0 })
  }
  return <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/65 p-3 sm:p-5" role="dialog" aria-modal="true" aria-label="Create poll sticker" onClick={onClose}>
    <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-4 text-foreground shadow-2xl sm:p-5" onClick={event => event.stopPropagation()}>
      <div className="flex items-center justify-between"><h2 className="text-lg font-bold">{initialPoll ? 'Edit poll' : 'Create poll'}</h2><button onClick={onClose} className="rounded-full p-2 hover:bg-muted" aria-label="Close poll editor"><X className="h-5 w-5"/></button></div>
      <label className="mt-4 block text-sm font-semibold" htmlFor="story-poll-question">Question</label>
      <input id="story-poll-question" value={question} onChange={event => { setQuestion(event.target.value); setError('') }} maxLength={180} placeholder="Ask your audience…" className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-pink-500"/>
      <div className="mt-4 flex items-center justify-between"><h3 className="text-sm font-semibold">Answer options</h3><span className="text-xs text-muted-foreground">{options.length}/4</span></div>
      <div className="mt-2 space-y-2">{options.map((option, index) => <div key={option.id} className="flex items-center gap-2"><input value={option.label} maxLength={80} onChange={event => { setOptions(items => items.map(item => item.id === option.id ? { ...item, label: event.target.value } : item)); setError('') }} placeholder={`Option ${index + 1}`} aria-label={`Answer option ${index + 1}`} className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-pink-500"/>{index > 1 && <button aria-label={`Remove option ${index + 1}`} onClick={() => setOptions(items => items.filter(item => item.id !== option.id))} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-red-500"><Trash2 className="h-4 w-4"/></button>}</div>)}</div>
      {options.length < 4 && <button onClick={() => setOptions(items => [...items, { id: makeId(), label: '' }])} className="mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-pink-500 hover:bg-pink-500/10"><Plus className="h-4 w-4"/> Add option</button>}
      <div className="mt-4 flex items-center gap-3"><label htmlFor="story-poll-color" className="text-sm font-semibold">Sticker color</label><input id="story-poll-color" type="color" value={color} onChange={event => setColor(event.target.value)} className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent"/><span className="text-xs uppercase text-muted-foreground">{color}</span></div>
      <div className="mt-4 rounded-xl border border-border p-3" aria-label="Live poll preview"><p className="mb-3 break-words text-center text-base font-bold" style={{ color: '#fff' }}>{question.trim() || 'Your question appears here'}</p><div className="space-y-2">{options.map((option,index) => <div key={option.id} className="rounded-lg border border-white/50 px-3 py-2 text-center text-sm font-semibold text-white" style={{ backgroundColor: color }}>{option.label.trim() || `Option ${index+1}`}</div>)}</div></div>
      {error && <p role="alert" className="mt-3 text-sm text-red-500">{error}</p>}
      <div className="mt-5 flex gap-2"><button onClick={onClose} className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button><button disabled={!canSave} onClick={save} className="flex-1 rounded-xl bg-pink-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-pink-600 disabled:cursor-not-allowed disabled:opacity-50">{initialPoll ? 'Save changes' : 'Add to Story'}</button></div>
    </div>
  </div>
}
