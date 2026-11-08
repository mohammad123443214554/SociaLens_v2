'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import emojiCatalog from '@/lib/data/emoji-catalog.json'

interface EmojiRecord {
  emoji: string
  name: string
  category: string
  skinTone: boolean
}

type RecentItem = { kind: 'sticker'; value: string; label: string } | { kind: 'gif'; value: string; label: string }
type GiphyItem = {
  id: string
  title?: string
  images?: {
    fixed_width?: { webp?: string; url?: string }
    fixed_width_small?: { webp?: string; url?: string }
    original?: { webp?: string; url?: string }
  }
}

interface StickerPickerProps {
  onSelect: (sticker: string) => void
  onClose: () => void
  style?: React.CSSProperties
}

const EMOJIS = emojiCatalog.emojis as EmojiRecord[]
const POPULAR = new Set(emojiCatalog.popular)
const EMOJI_CATEGORIES = ['Popular', 'All', ...Array.from(new Set(EMOJIS.map(item => item.category)))]
const RECENT_KEY = 'socialens-chat-recent-stickers-v1'
const PAGE_SIZE = 24
const BATCH_SIZE = 180

export function StickerPicker({ onSelect, onClose, style }: StickerPickerProps) {
  const [activeCategory, setActiveCategory] = useState('Recently')
  const [search, setSearch] = useState('')
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE)
  const [recent, setRecent] = useState<RecentItem[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]')
      return Array.isArray(saved) ? saved.slice(0, 36) : []
    } catch { return [] }
  })

  const [gifs, setGifs] = useState<GiphyItem[]>([])
  const [gifOffset, setGifOffset] = useState(0)
  const [gifLoading, setGifLoading] = useState(false)
  const [gifError, setGifError] = useState('')
  const [gifHasMore, setGifHasMore] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const requestRef = useRef(0)
  const apiKey = process.env.NEXT_PUBLIC_GIPHY_API_KEY

  const isEmojiCategory = activeCategory === 'Emojis' || activeCategory === 'Popular' || activeCategory === 'All' || EMOJI_CATEGORIES.includes(activeCategory)

  const filteredEmojis = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    if (query) return EMOJIS.filter(item => item.name.toLocaleLowerCase().includes(query) || item.emoji.includes(query))
    if (activeCategory === 'Popular') return EMOJIS.filter(item => POPULAR.has(item.emoji))
    if (activeCategory === 'All' || activeCategory === 'Emojis') return EMOJIS
    return EMOJIS.filter(item => item.category === activeCategory)
  }, [activeCategory, search])

  const visibleEmojis = filteredEmojis.slice(0, visibleCount)

  // Use the same GIPHY stickers API, API key, rating and pagination model as Story GIFPicker.
  useEffect(() => {
    if (activeCategory !== 'GIF Stickers') return
    const requestId = ++requestRef.current
    const timer = window.setTimeout(async () => {
      setGifLoading(true)
      setGifError('')
      setGifOffset(0)
      setGifHasMore(true)
      if (!apiKey) {
        setGifs([])
        setGifError('GIF search is not configured. Add NEXT_PUBLIC_GIPHY_API_KEY in Vercel Environment Variables.')
        setGifLoading(false)
        return
      }
      try {
        const query = search.trim()
        const endpoint = query ? 'search' : 'trending'
        const params = new URLSearchParams({ api_key: apiKey, limit: String(PAGE_SIZE), offset: '0', rating: 'g', ...(query ? { q: query } : {}) })
        const response = await fetch(`https://api.giphy.com/v1/stickers/${endpoint}?${params.toString()}`)
        if (!response.ok) throw new Error(response.status === 429 ? 'GIF search limit reached. Please try again shortly.' : 'Could not load GIFs. Please try again.')
        const data = await response.json()
        if (requestId !== requestRef.current) return
        const next = Array.isArray(data.data) ? data.data : []
        setGifs(next)
        setGifHasMore(next.length >= PAGE_SIZE)
      } catch (error) {
        if (requestId === requestRef.current) {
          setGifs([])
          setGifError(error instanceof Error ? error.message : 'Could not load GIFs.')
        }
      } finally {
        if (requestId === requestRef.current) setGifLoading(false)
      }
    }, search.trim() ? 300 : 0)
    return () => { window.clearTimeout(timer); requestRef.current += 1 }
  }, [activeCategory, search, apiKey])

  const loadMoreGifs = async () => {
    if (gifLoading || !gifHasMore || !apiKey) return
    const requestId = requestRef.current
    const nextOffset = gifOffset + PAGE_SIZE
    setGifLoading(true)
    try {
      const query = search.trim()
      const endpoint = query ? 'search' : 'trending'
      const params = new URLSearchParams({ api_key: apiKey, limit: String(PAGE_SIZE), offset: String(nextOffset), rating: 'g', ...(query ? { q: query } : {}) })
      const response = await fetch(`https://api.giphy.com/v1/stickers/${endpoint}?${params.toString()}`)
      if (!response.ok) throw new Error('Could not load more GIFs.')
      const data = await response.json()
      if (requestId !== requestRef.current) return
      const next = Array.isArray(data.data) ? data.data : []
      setGifs(current => [...current, ...next])
      setGifOffset(nextOffset)
      setGifHasMore(next.length >= PAGE_SIZE)
    } catch (error) {
      if (requestId === requestRef.current) setGifError(error instanceof Error ? error.message : 'Could not load more GIFs.')
    } finally {
      if (requestId === requestRef.current) setGifLoading(false)
    }
  }

  const choose = (item: RecentItem) => {
    const next = [item, ...recent.filter(entry => entry.value !== item.value)].slice(0, 36)
    setRecent(next)
    try { window.localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* storage can be disabled */ }
    onSelect(item.kind === 'gif' ? `gif:${item.value}` : item.value)
  }

  const chooseGif = (item: GiphyItem) => {
    const url = item.images?.fixed_width?.webp || item.images?.fixed_width?.url || item.images?.original?.webp || item.images?.original?.url
    if (!url) return
    choose({ kind: 'gif', value: url, label: item.title || 'GIF sticker' })
  }

  const changeCategory = (category: string) => {
    setActiveCategory(category)
    setSearch('')
    setVisibleCount(BATCH_SIZE)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }

  if (typeof document === 'undefined') return null

  const tabs = ['Recently', 'GIF Stickers', 'Emojis']

  return createPortal(
    <div
      role="dialog"
      aria-label="Sticker picker"
      className="fixed z-[100] flex h-[min(440px,calc(100dvh-16px))] w-[min(360px,calc(100vw-16px))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      style={{ top: style?.top, left: style?.left }}
      onMouseDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
    >
      <div className="shrink-0 border-b border-border p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Stickers & GIFs</p>
          <button type="button" onClick={onClose} aria-label="Close sticker picker" className="rounded-full px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">Close</button>
        </div>
        <input
          type="search"
          value={search}
          onChange={event => { setSearch(event.target.value); setVisibleCount(BATCH_SIZE) }}
          placeholder="Search stickers, emojis and GIFs"
          aria-label="Search stickers, emojis and GIFs"
          className="h-9 w-full rounded-xl border border-border bg-muted/50 px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-pink-500"
        />
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map(category => (
            <button key={category} type="button" onClick={() => changeCategory(category)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${activeCategory === category ? 'bg-pink-500 text-white' : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'}`}>
              {category}
            </button>
          ))}
        </div>
        {isEmojiCategory && activeCategory !== 'Recently' && (
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {EMOJI_CATEGORIES.map(category => (
              <button key={category} type="button" onClick={() => { setActiveCategory(category); setVisibleCount(BATCH_SIZE) }}
                className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] ${activeCategory === category ? 'bg-pink-500/15 text-pink-500' : 'bg-muted text-muted-foreground'}`}>
                {category}
              </button>
            ))}
          </div>
        )}
      </div>
      <div
        ref={scrollRef}
        onScroll={event => {
          const el = event.currentTarget
          if (el.scrollHeight - el.scrollTop - el.clientHeight < 180) {
            if (activeCategory === 'GIF Stickers') void loadMoreGifs()
            else if (isEmojiCategory && visibleCount < filteredEmojis.length) setVisibleCount(count => Math.min(count + BATCH_SIZE, filteredEmojis.length))
          }
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2.5"
      >
        {activeCategory === 'Recently' ? (
          recent.length ? (
            <div className="grid grid-cols-6 gap-1">
              {recent.map((item, index) => item.kind === 'gif' ? (
                <button key={item.value} type="button" title={item.label} aria-label={item.label} onClick={() => choose(item)} className="aspect-square overflow-hidden rounded-lg bg-muted hover:ring-2 hover:ring-pink-400">
                  <img src={item.value} alt={item.label} loading="lazy" className="h-full w-full object-cover" />
                </button>
              ) : (
                <button key={item.value + index} type="button" title={item.label} onClick={() => choose(item)} className="flex aspect-square items-center justify-center rounded-lg text-[29px] hover:bg-accent">{item.value}</button>
              ))}
            </div>
          ) : <p className="py-12 text-center text-sm text-muted-foreground">Your recently used stickers and GIFs will appear here.</p>
        ) : activeCategory === 'GIF Stickers' ? (
          <>
            {gifError && <p role="alert" className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{gifError}</p>}
            {!gifError && gifs.length === 0 && !gifLoading && <p className="py-10 text-center text-sm text-muted-foreground">No GIFs found. Try another search.</p>}
            <div className="grid grid-cols-2 gap-2">
              {gifs.map(item => {
                const url = item.images?.fixed_width?.webp || item.images?.fixed_width?.url || item.images?.original?.webp || item.images?.original?.url
                const preview = item.images?.fixed_width_small?.webp || item.images?.fixed_width_small?.url || url
                if (!url || !preview) return null
                return <button key={item.id} type="button" onClick={() => chooseGif(item)} aria-label={`Add ${item.title || 'GIF'} sticker`} className="overflow-hidden rounded-xl border border-border bg-muted/40 hover:border-pink-400">
                  <img src={preview} alt={item.title || 'GIF sticker'} loading="lazy" decoding="async" className="h-[92px] w-full object-cover" />
                </button>
              })}
            </div>
            {gifLoading && <p className="py-3 text-center text-xs text-muted-foreground">Loading GIFs…</p>}
            {gifHasMore && gifs.length > 0 && !gifLoading && <button type="button" onClick={() => void loadMoreGifs()} className="mt-2 w-full rounded-lg bg-muted px-3 py-2 text-xs font-medium hover:bg-accent">Load more GIFs</button>}
            <p className="pt-2 text-center text-[10px] text-muted-foreground">Powered by GIPHY</p>
          </>
        ) : isEmojiCategory ? (
          filteredEmojis.length ? (
            <div className="grid grid-cols-8 gap-1">
              {visibleEmojis.map(item => (
                <button key={item.emoji} type="button" title={item.name} aria-label={item.name} onClick={() => choose({ kind: 'sticker', value: item.emoji, label: item.name })}
                  className="flex aspect-square items-center justify-center rounded-lg text-[25px] leading-none transition-colors hover:bg-accent active:scale-95">
                  {item.emoji}
                </button>
              ))}
            </div>
          ) : <p className="py-12 text-center text-sm text-muted-foreground">No emojis found.</p>
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground">Select a category to browse.</p>
        )}
      </div>
    </div>,
    document.body
  )
}
