'use client'

import { useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import type { StoryEmojiSliderOverlay } from '@/lib/types/database.types'
import { EMOJI_SLIDER_CHOICES, isValidEmojiSliderEmoji, normalizeEmojiSliderQuestion } from '@/lib/utils/emojiSlider'

export function EmojiSliderModal({ initialSlider, onClose, onSave }: {
  initialSlider?: StoryEmojiSliderOverlay | null
  onClose: () => void
  onSave: (slider: StoryEmojiSliderOverlay) => void
}) {
  const [question, setQuestion] = useState(initialSlider?.question || '')
  const [emoji, setEmoji] = useState(initialSlider?.emoji || '🔥')
  const [error, setError] = useState('')
  const normalized = question.trim()
  const validQuestion = normalizeEmojiSliderQuestion(question)
  const previewValue = 50

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = () => {
    if (!validQuestion) { setError(!normalized ? 'Enter a question to continue.' : 'Your question must be 100 characters or fewer.'); return }
    if (!isValidEmojiSliderEmoji(emoji)) { setError('Choose a supported emoji.'); return }
    onSave({
      id: initialSlider?.id || Math.random().toString(36).slice(2, 12),
      question: validQuestion,
      emoji,
      x: initialSlider?.x ?? 50,
      y: initialSlider?.y ?? 50,
      scale: initialSlider?.scale ?? 1,
      rotation: initialSlider?.rotation ?? 0,
    })
  }

  return <div className="fixed inset-0 z-[210] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-labelledby="emoji-slider-modal-title" className="w-full max-w-md rounded-t-2xl border border-border bg-card p-5 text-foreground shadow-2xl sm:rounded-2xl" onClick={event => event.stopPropagation()}>
      <header className="flex items-center justify-between gap-3">
        <div><h2 id="emoji-slider-modal-title" className="text-lg font-bold">{initialSlider ? 'Edit Emoji Slider' : 'Emoji Slider'}</h2><p className="mt-1 text-sm text-muted-foreground">Ask a question and choose a reaction emoji.</p></div>
        <button type="button" onClick={onClose} aria-label="Close emoji slider editor" className="rounded-full p-2 hover:bg-muted"><X className="h-5 w-5" /></button>
      </header>
      <label className="mt-5 block text-sm font-semibold" htmlFor="emoji-slider-question">Question</label>
      <input id="emoji-slider-question" autoFocus value={question} maxLength={100} onChange={event => { setQuestion(event.target.value); setError('') }} placeholder="How much are you enjoying this?" className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary" />
      <div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>{error || 'Keep it short and fun.'}</span><span>{question.length}/100</span></div>
      <p className="mt-4 text-sm font-semibold">Choose your emoji</p>
      <div className="mt-2 grid grid-cols-5 gap-2">{EMOJI_SLIDER_CHOICES.map(item => <button key={item} type="button" aria-label={`Select ${item}`} aria-pressed={emoji===item} onClick={() => setEmoji(item)} className={`flex h-11 items-center justify-center rounded-xl border text-2xl transition ${emoji===item?'border-primary bg-primary/10 ring-2 ring-primary/30':'border-border bg-background hover:bg-muted'}`}>{item}</button>)}</div>
      <div className="mt-5 rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-950 p-4 text-white shadow-inner">
        <p className="break-words text-center text-sm font-bold">{normalized || 'Your question will appear here'}</p>
        <div className="mt-5 flex items-center gap-3"><span className="text-xs text-white/75">0</span><div className="relative h-2 flex-1 rounded-full bg-white/25"><div className="absolute inset-y-0 left-0 w-1/2 rounded-full bg-white/80" /><span className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-white text-2xl shadow-lg">{emoji}</span></div><span className="text-xs text-white/75">100</span></div>
        <div className="mt-5 flex items-center justify-between text-[11px] text-white/70"><span>Not much</span><span>A lot</span></div>
      </div>
      <div className="mt-5 flex gap-3"><button type="button" onClick={onClose} className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button><button type="button" onClick={save} className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"><Check className="mr-1.5 inline h-4 w-4" />{initialSlider?'Save changes':'Add Sticker'}</button></div>
      {error && <p role="alert" className="mt-3 text-sm text-red-500">{error}</p>}
    </section>
  </div>
}
