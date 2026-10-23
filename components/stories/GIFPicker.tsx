'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Loader2, Search, X } from 'lucide-react'
import type { StoryGIFOverlay } from '@/lib/types/database.types'

const CATEGORIES = [
  { label: 'Trending', query: '' },
  { label: 'Funny', query: 'funny' },
  { label: 'Love', query: 'love' },
  { label: 'Reactions', query: 'reaction' },
  { label: 'Animals', query: 'animals' },
] as const

type GiphyItem = { id: string; title?: string; images?: { fixed_width?: { webp?: string; url?: string }; fixed_width_small?: { webp?: string; url?: string }; original?: { webp?: string; url?: string } } }

export function GIFPicker({ onClose, onSelect }: { onClose: () => void; onSelect: (gif: Omit<StoryGIFOverlay, 'id'|'x'|'y'|'scale'|'rotation'>) => void }) {
  const [category, setCategory] = useState<string>('Trending')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<GiphyItem[]>([])
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const key = process.env.NEXT_PUBLIC_GIPHY_API_KEY

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(async () => {
      setLoading(true); setError(''); setOffset(0); setHasMore(true)
      if (!key) { setItems([]); setError('GIF search is not configured yet. Add NEXT_PUBLIC_GIPHY_API_KEY in Vercel Environment Variables.'); setLoading(false); return }
      try {
        const search = query.trim() || CATEGORIES.find(c => c.label === category)?.query || ''
        const endpoint = search ? 'search' : 'trending'
        const params = new URLSearchParams({ api_key: key, limit: '24', offset: '0', rating: 'g', ...(search ? { q: search } : {}) })
        const response = await fetch(`https://api.giphy.com/v1/stickers/${endpoint}?${params.toString()}`)
        if (!response.ok) throw new Error(response.status === 429 ? 'GIF search limit reached. Please try again shortly.' : 'Could not load GIFs. Please try again.')
        const data = await response.json()
        if (cancelled) return
        setItems(Array.isArray(data.data) ? data.data : [])
        setHasMore((data.data?.length || 0) >= 24)
      } catch (e) { if (!cancelled) { setItems([]); setError(e instanceof Error ? e.message : 'Could not load GIFs.') } }
      finally { if (!cancelled) setLoading(false) }
    }, query.trim() ? 350 : 0)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [category, query, key])

  const loadMore = async () => {
    if (loading || !hasMore || !key) return
    setLoading(true)
    try {
      const search = query.trim() || CATEGORIES.find(c => c.label === category)?.query || ''
      const nextOffset = offset + 24
      const params = new URLSearchParams({ api_key: key, limit: '24', offset: String(nextOffset), rating: 'g', ...(search ? { q: search } : {}) })
      const response = await fetch(`https://api.giphy.com/v1/stickers/${search ? 'search' : 'trending'}?${params.toString()}`)
      if (!response.ok) throw new Error('Could not load more GIFs.')
      const data = await response.json()
      setItems(current => [...current, ...(Array.isArray(data.data) ? data.data : [])])
      setOffset(nextOffset); setHasMore((data.data?.length || 0) >= 24)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load more GIFs.') }
    finally { setLoading(false) }
  }

  return <div className="fixed inset-0 z-[190] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="GIF picker">
    <div className="flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-border bg-card text-foreground shadow-2xl sm:rounded-2xl">
      <header className="flex items-center justify-between border-b border-border px-4 py-3"><div className="flex items-center gap-2"><button type="button" onClick={onClose} aria-label="Close GIF picker" className="rounded-full p-1.5 hover:bg-muted"><ArrowLeft className="h-5 w-5" /></button><h2 className="text-lg font-bold">GIF</h2></div><button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-muted"><X className="h-5 w-5" /></button></header>
      <div className="p-3 pb-2"><label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3"><Search className="h-4 w-4 shrink-0 text-muted-foreground" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search GIFs" className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" aria-label="Search GIFs" />{query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><X className="h-4 w-4" /></button>}</label></div>
      <nav className="flex gap-2 overflow-x-auto px-3 pb-3" aria-label="GIF categories">{CATEGORIES.map(item => <button key={item.label} type="button" onClick={() => { setCategory(item.label); setQuery('') }} aria-pressed={category === item.label && !query} className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium ${category === item.label && !query ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-muted'}`}>{item.label}</button>)}</nav>
      <div ref={scrollRef} onScroll={e => { const el=e.currentTarget; if(el.scrollHeight-el.scrollTop-el.clientHeight<180) void loadMore() }} className="min-h-40 flex-1 overflow-y-auto px-3 pb-3">
        {error && <p role="alert" className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{error}</p>}
        {!error && items.length === 0 && !loading && <p className="p-8 text-center text-sm text-muted-foreground">No GIFs found. Try another search.</p>}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{items.map(item => {
          const url = item.images?.fixed_width?.webp || item.images?.fixed_width?.url || item.images?.original?.webp || item.images?.original?.url
          const previewUrl = item.images?.fixed_width_small?.webp || item.images?.fixed_width_small?.url || url
          if (!url) return null
          return <button key={item.id} type="button" onClick={() => onSelect({ providerId: item.id, url, previewUrl, title: item.title || 'GIF sticker' })} className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-muted p-1 transition hover:ring-2 hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`Add ${item.title || 'GIF'} sticker`}><img src={previewUrl} alt={item.title || 'GIF'} loading="lazy" className="max-h-full max-w-full object-contain" /></button>
        })}</div>
        {loading && <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin" /></div>}
        {!loading && hasMore && items.length > 0 && <button type="button" onClick={() => void loadMore()} className="mt-2 w-full rounded-lg border border-border p-2 text-sm hover:bg-muted">Load more</button>}
      </div>
      <footer className="flex items-center justify-between border-t border-border px-4 py-2"><span className="text-xs text-muted-foreground">Powered By GIPHY</span><span className="text-xs text-muted-foreground">GIF stickers</span></footer>
    </div>
  </div>
}
