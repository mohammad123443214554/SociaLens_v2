'use client'

import { useState } from 'react'
import { Check, Plus, Trash2, X } from 'lucide-react'
import type { StoryQuizOverlay } from '@/lib/types/database.types'

const makeId = () => globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 14)

export function QuizModal({ initialQuiz, onClose, onSave }: {
  initialQuiz?: StoryQuizOverlay | null
  onClose: () => void
  onSave: (quiz: StoryQuizOverlay) => void
}) {
  const [question, setQuestion] = useState(initialQuiz?.question || '')
  const [options, setOptions] = useState(() => initialQuiz?.options?.map(option => ({ ...option })) || [{ id: makeId(), label: '' }, { id: makeId(), label: '' }])
  const [correctOptionId, setCorrectOptionId] = useState(initialQuiz?.correctOptionId || '')
  const color = initialQuiz?.color || '#7c3aed'
  const [error, setError] = useState('')
  const clean = options.map(option => option.label.trim())
  const duplicate = clean.some((label, index) => label && clean.findIndex(other => other.toLocaleLowerCase() === label.toLocaleLowerCase()) !== index)
  const valid = !!question.trim() && question.trim().length <= 180 && options.length >= 2 && options.length <= 5 && clean.every(label => !!label && label.length <= 80) && !duplicate && options.some(option => option.id === correctOptionId)
  const save = () => {
    if (!valid) { setError(duplicate ? 'Each answer option must be unique.' : 'Enter a question, 2–5 unique answers, and select the correct answer.'); return }
    onSave({ id: initialQuiz?.id || makeId(), question: question.trim(), options: options.map(option => ({ ...option, label: option.label.trim() })), correctOptionId, color, x: initialQuiz?.x ?? 50, y: initialQuiz?.y ?? 50, scale: initialQuiz?.scale ?? 1, rotation: initialQuiz?.rotation ?? 0 })
  }
  return <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/65 p-3 sm:p-5" role="dialog" aria-modal="true" aria-label="Create quiz sticker" onClick={onClose}>
    <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-4 text-foreground shadow-2xl sm:p-5" onClick={event => event.stopPropagation()}>
      <div className="flex items-center justify-between"><h2 className="text-lg font-bold">{initialQuiz ? 'Edit quiz' : 'Create quiz'}</h2><button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-muted" aria-label="Close quiz editor"><X className="h-5 w-5"/></button></div>
      <label className="mt-4 block text-sm font-semibold" htmlFor="story-quiz-question">Question</label>
      <textarea id="story-quiz-question" value={question} onChange={event => { setQuestion(event.target.value); setError('') }} maxLength={180} rows={3} placeholder="Ask a question with one correct answer…" className="mt-1.5 min-h-[84px] w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-500"/>
      <div className="mt-4 flex items-center justify-between"><h3 className="text-sm font-semibold">Answer options</h3><span className="text-xs text-muted-foreground">{options.length}/5</span></div>
      <div className="mt-2 space-y-2">{options.map((option,index) => <div key={option.id} className="flex items-center gap-2">
        <button type="button" onClick={() => { setCorrectOptionId(option.id); setError('') }} aria-label={`Mark option ${index+1} as correct`} aria-pressed={correctOptionId === option.id} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${correctOptionId === option.id ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-border text-muted-foreground'}`}>{correctOptionId === option.id ? <Check className="h-4 w-4"/> : <span className="text-xs">{index+1}</span>}</button>
        <input value={option.label} maxLength={80} onChange={event => { setOptions(items => items.map(item => item.id === option.id ? { ...item, label: event.target.value } : item)); setError('') }} placeholder={`Option ${index+1}`} aria-label={`Answer option ${index+1}`} className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-500"/>
        {options.length > 2 && <button type="button" aria-label={`Remove option ${index+1}`} onClick={() => { setOptions(items => items.filter(item => item.id !== option.id)); if (correctOptionId === option.id) setCorrectOptionId('') }} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-red-500"><Trash2 className="h-4 w-4"/></button>}
      </div>)}</div>
      {options.length < 5 && <button type="button" onClick={() => setOptions(items => [...items, { id: makeId(), label: '' }])} className="mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-violet-500 hover:bg-violet-500/10"><Plus className="h-4 w-4"/> Add option</button>}
      <div className="mt-4 rounded-xl border border-border p-3" aria-label="Live quiz preview" style={{ backgroundColor: color, color: '#fff' }}>
        <p className="mb-3 break-words whitespace-pre-wrap text-center text-base font-bold">{question.trim() || 'Your quiz question appears here'}</p>
        <div className="space-y-2">{options.map((option,index) => <div key={option.id} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${correctOptionId === option.id ? 'border-emerald-300 bg-emerald-500/30' : 'border-white/60 bg-black/10'}`}>{option.label.trim() || `Option ${index+1}`}{correctOptionId === option.id && <span className="float-right text-xs">Correct</span>}</div>)}</div>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-500">{error}</p>}
      <p className="mt-2 text-xs text-muted-foreground">Tap the numbered circle beside an option to mark it as correct. The green check shows your selection; select another circle to change it.</p>
      <div className="mt-5 flex gap-2"><button type="button" onClick={onClose} className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button><button type="button" disabled={!valid} onClick={save} className="flex-1 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50">{initialQuiz ? 'Save changes' : 'Add to Story'}</button></div>
    </div>
  </div>
}
