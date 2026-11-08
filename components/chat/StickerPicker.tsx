'use client'

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

const STICKERS = [
  '😀','😁','😄','😆','🤣','😂','🙂','😊','😇','🥳','🎉','✨',
  '😍','🥰','😘','💕','💖','💘','❤️','💗','💝','😻','💋','💍',
  '🤪','😜','🤭','🙈','🤡','😹','🥴','🫠','🙃','😝','🤓','😎',
  '😢','😭','🥺','😞','💔','😔','😿','😥','🙁','😪','😓','😰',
  '😡','🤬','😤','👿','💢','😾','🔥','😠','🙄','😑','🤦','🤷',
  '🥰','😘','🤗','💞','🫶','👉👈','🙏','💐','🌹','💌','😳','☺️',
  '🎊','🎂','🥂','🍾','🎁','🏆','🙌','👏','🥳','🎈','⭐','💯',
  '😴','🥱','☕','🛌','😌','🧘','🌙','😪','🫡','🤙','😏','🍿',
]

const GIF_STICKERS = [
  { id: 'hello-wave', label: 'Hello wave', url: 'https://media.giphy.com/media/3og0IPxVg8JED6E7Xy/giphy.gif' },
  { id: 'hello-friends', label: 'Hello friends', url: 'https://media.giphy.com/media/ZdNIT7ETTbvDi/giphy.gif' },
  { id: 'hello-cute', label: 'Cute hello', url: 'https://media.giphy.com/media/3o6Yf37jDv4I4f4xlS/giphy.gif' },
  { id: 'hello-cats', label: 'Hello cats', url: 'https://media.giphy.com/media/3o6Yf1TeeTQhXyv66s/giphy.gif' },
  { id: 'hello-bear', label: 'Hello bear', url: 'https://media.giphy.com/media/3oEjHGSyClrTtTfTtC/giphy.gif' },
  { id: 'hello-kitty', label: 'Hello kitty', url: 'https://media.giphy.com/media/3o6Yf4I9XEJL4D8G4U/giphy.gif' },
  { id: 'anime-wave', label: 'Anime wave', url: 'https://media.giphy.com/media/VJh6PuU6Vn4Xe/giphy.gif' },
  { id: 'anime-blush', label: 'Anime blush', url: 'https://media.giphy.com/media/3o7TKFr3ZhJv2fQxWw/giphy.gif' },
  { id: 'anime-laugh', label: 'Anime laugh', url: 'https://media.giphy.com/media/VFZ5i6pEe6y5K/giphy.gif' },
  { id: 'giphy-sample', label: 'Happy reaction', url: 'https://media1.giphy.com/media/cZ7rmKfFYOvYI/200w_d.gif' },
]

type RecentItem = { kind: 'sticker'; value: string; label: string } | { kind: 'gif'; value: string; label: string }

interface StickerPickerProps {
  onSelect: (sticker: string) => void
  onClose: () => void
  style?: React.CSSProperties
}

const RECENT_KEY = 'socialens-chat-recent-stickers-v1'

export function StickerPicker({ onSelect, onClose, style }: StickerPickerProps) {
  const [activeCategory, setActiveCategory] = useState<'Recently' | 'Stickers' | 'GIF Stickers'>('Recently')
  const [search, setSearch] = useState('')
  const [recent, setRecent] = useState<RecentItem[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]')
      return Array.isArray(saved) ? saved.slice(0, 36) : []
    } catch { return [] }
  })

  const results = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    if (query) {
      return [
        ...STICKERS.filter(value => value.includes(query)).map(value => ({ kind: 'sticker' as const, value, label: value })),
        ...GIF_STICKERS.filter(item => item.label.toLocaleLowerCase().includes(query)).map(item => ({ kind: 'gif' as const, value: item.url, label: item.label })),
      ]
    }
    if (activeCategory === 'Recently') return recent
    if (activeCategory === 'Stickers') return STICKERS.map(value => ({ kind: 'sticker' as const, value, label: value }))
    return GIF_STICKERS.map(item => ({ kind: 'gif' as const, value: item.url, label: item.label }))
  }, [activeCategory, recent, search])

  const choose = (item: RecentItem) => {
    const next = [item, ...recent.filter(entry => entry.value !== item.value)].slice(0, 36)
    setRecent(next)
    try { window.localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* storage can be disabled */ }
    onSelect(item.kind === 'gif' ? `gif:${item.value}` : item.value)
  }

  if (typeof document === 'undefined') return null

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
          <p className="text-sm font-semibold text-foreground">Stickers</p>
          <button type="button" onClick={onClose} className="rounded-full px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">Close</button>
        </div>
        <input
          type="search"
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Search stickers and GIFs"
          aria-label="Search stickers and GIFs"
          className="h-9 w-full rounded-xl border border-border bg-muted/50 px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-pink-500"
        />
        <div className="mt-2 flex gap-1.5">
          {(['Recently', 'Stickers', 'GIF Stickers'] as const).map(category => (
            <button key={category} type="button" onClick={() => { setActiveCategory(category); setSearch('') }}
              className={`flex-1 rounded-full px-2 py-1.5 text-[11px] font-medium transition-colors ${activeCategory === category && !search ? 'bg-pink-500 text-white' : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'}`}>
              {category}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2.5">
        {results.length ? (
          <div className={activeCategory === 'GIF Stickers' || (search && results.some(item => item.kind === 'gif')) ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-6 gap-1'}>
            {results.map((item, index) => item.kind === 'gif' ? (
              <button key={item.value} type="button" title={item.label} aria-label={item.label} onClick={() => choose(item)}
                className="overflow-hidden rounded-xl border border-border bg-muted/40 hover:border-pink-400">
                {/* GIFs are loaded directly from GIPHY's public media URLs. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.value} alt={item.label} loading="lazy" className="h-[92px] w-full object-cover" />
                <span className="block truncate px-1.5 py-1 text-[10px] text-muted-foreground">{item.label}</span>
              </button>
            ) : (
              <button key={item.value + index} type="button" title={item.label} aria-label={item.label} onClick={() => choose(item)}
                className="flex aspect-square items-center justify-center rounded-lg text-[29px] leading-none transition-colors hover:bg-accent active:scale-95">
                {item.value}
              </button>
            ))}
          </div>
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground">{activeCategory === 'Recently' && !search ? 'Your recently used stickers and GIFs will appear here.' : 'No stickers found.'}</p>
        )}
      </div>
      {activeCategory === 'GIF Stickers' && (
        <div className="shrink-0 border-t border-border px-3 py-2 text-center text-[10px] text-muted-foreground">
          Powered by GIPHY
        </div>
      )}
    </div>,
    document.body
  )
}
