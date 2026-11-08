'use client'

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import emojiCatalog from '@/lib/data/emoji-catalog.json'

interface EmojiRecord {
  emoji: string
  name: string
  category: string
  skinTone: boolean
}

interface FullEmojiPickerProps {
  onSelect: (emoji: string) => void
  onClose: () => void
  style?: React.CSSProperties
}

const EMOJIS = emojiCatalog.emojis as EmojiRecord[]
const CATEGORIES = ['Popular', 'All', ...Array.from(new Set(EMOJIS.map(item => item.category)))]

export function FullEmojiPicker({ onSelect, onClose, style }: FullEmojiPickerProps) {
  const [activeCategory, setActiveCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [visibleCount, setVisibleCount] = useState(180)
  const filteredEmojis = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    if (query) {
      return EMOJIS.filter(item => item.name.toLocaleLowerCase().includes(query) || item.emoji.includes(query))
    }
    if (activeCategory === 'Popular') {
      const popular = new Set(emojiCatalog.popular)
      return EMOJIS.filter(item => popular.has(item.emoji))
    }
    if (activeCategory === 'All') return EMOJIS
    return EMOJIS.filter(item => item.category === activeCategory)
  }, [activeCategory, search])

  const visibleEmojis = filteredEmojis.slice(0, visibleCount)

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      role="dialog"
      aria-label="Emoji picker"
      className="fixed z-[100] flex h-[min(440px,calc(100dvh-16px))] w-[min(360px,calc(100vw-16px))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      style={{ top: style?.top, left: style?.left }}
      onMouseDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
    >
      <div className="shrink-0 border-b border-border p-3">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Choose an emoji</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close emoji picker" className="rounded-full px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">Close</button>
        </div>
        <input
          type="search"
          value={search}
          onChange={event => { setSearch(event.target.value); setVisibleCount(180) }}
          placeholder="Search emojis"
          aria-label="Search emojis"
          className="h-9 w-full rounded-xl border border-border bg-muted/50 px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-pink-500"
        />
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {CATEGORIES.map(category => (
            <button
              key={category}
              type="button"
              onClick={() => { setActiveCategory(category); setSearch(''); setVisibleCount(180) }}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${activeCategory === category && !search ? 'bg-pink-500 text-white' : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'}`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2.5">
        {filteredEmojis.length ? (
          <div className="grid grid-cols-9 gap-1">
            {visibleEmojis.map(item => (
              <button
                key={item.emoji}
                type="button"
                title={item.name}
                aria-label={item.name}
                onClick={() => onSelect(item.emoji)}
                className="flex aspect-square items-center justify-center rounded-lg text-[23px] leading-none transition-colors hover:bg-accent active:scale-95"
              >
                {item.emoji}
              </button>
            ))}
          </div>
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground">No emojis found.</p>
        )}
      </div>
      {visibleCount < filteredEmojis.length && (
        <button type="button" onClick={() => setVisibleCount(count => count + 180)} className="shrink-0 border-t border-border px-3 py-2 text-xs font-medium text-pink-500 hover:bg-muted">Show more emojis</button>
      )}
    </div>,
    document.body
  )
}
