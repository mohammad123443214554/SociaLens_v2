'use client'

import { useState } from 'react'
import { ExternalLink, Link2, X } from 'lucide-react'

interface StoryLinkModalProps {
  onClose: () => void
  onAdd: (url: string, label: string) => void
}

export function StoryLinkModal({ onClose, onAdd }: StoryLinkModalProps) {
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('Visit Site')
  const [error, setError] = useState('')

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    let normalized = url.trim()
    if (!normalized) { setError('Enter a website URL.'); return }
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)) normalized = 'https://' + normalized
    try {
      const parsed = new URL(normalized)
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) throw new Error('invalid')
      onAdd(parsed.href, label.trim().slice(0, 40) || 'Visit Site')
    } catch {
      setError('Enter a valid website link starting with https:// or http://.')
    }
  }

  return (
    <div className="fixed inset-0 z-[190] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="story-link-title" onClick={onClose}>
      <section className="w-full max-w-md overflow-hidden rounded-t-2xl border border-border bg-card text-foreground shadow-2xl sm:rounded-2xl" onClick={event => event.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-border px-4 py-3"><div className="flex items-center gap-2"><Link2 className="h-5 w-5 text-blue-500"/><h2 id="story-link-title" className="font-semibold">Add link sticker</h2></div><button type="button" onClick={onClose} aria-label="Close link popup" className="rounded-full p-2 hover:bg-muted"><X className="h-5 w-5"/></button></header>
        <form onSubmit={submit} className="space-y-4 p-4">
          <div><label htmlFor="story-link-url" className="mb-1.5 block text-sm font-medium">Website URL</label><input id="story-link-url" autoFocus type="url" inputMode="url" value={url} onChange={event => {setUrl(event.target.value);setError('')}} placeholder="https://example.com" className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/40"/><p className="mt-1 text-xs text-muted-foreground">A website address is required. Links open in a new tab.</p></div>
          <div><label htmlFor="story-link-label" className="mb-1.5 block text-sm font-medium">Sticker text</label><input id="story-link-label" value={label} onChange={event => setLabel(event.target.value)} maxLength={40} placeholder="Visit Site" className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/40"/></div>
          <div className="flex items-center gap-2 rounded-xl bg-muted/60 p-3"><ExternalLink className="h-4 w-4 shrink-0 text-blue-500"/><span className="truncate rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">{label.trim() || 'Visit Site'}</span><span className="text-xs text-muted-foreground">Sticker preview</span></div>
          {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-2"><button type="button" onClick={onClose} className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button><button type="submit" className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Add sticker</button></div>
        </form>
      </section>
    </div>
  )
}
