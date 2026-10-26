'use client'

import { useState } from 'react'
import { AtSign, Image, Link2, Timer, X, Smile, BarChart3, Brain, Camera, SlidersHorizontal, Images, Shapes, Search } from 'lucide-react'

interface StoryStickerSidebarProps {
  onClose: () => void
  onMention: () => void
  onLink?: () => void
  onCountdown?: () => void
  onGIF?: () => void
  onEmoji?: () => void
  onPoll?: () => void
  onQuiz?: () => void
  onSnapDrop?: () => void
  onEmojiSlider?: () => void
  onPhotoCollage?: () => void
  onShapeCut?: () => void
}

export function StoryStickerSidebar({ onClose, onMention, onLink, onCountdown, onGIF, onEmoji, onPoll, onQuiz, onSnapDrop, onEmojiSlider, onPhotoCollage, onShapeCut }: StoryStickerSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const stickers = [
    { id: 'emoji', title: 'Emojis', description: 'Add searchable emoji stickers', onSelect: onEmoji, icon: <Smile className="h-5 w-5" />, iconStyle: 'bg-amber-500/10 text-amber-500' },
    { id: 'gif', title: 'GIF', description: 'Search animated GIF stickers', onSelect: onGIF, icon: <Image className="h-5 w-5" />, iconStyle: 'bg-fuchsia-500/10 text-fuchsia-500' },
    { id: 'mention', title: 'Mention', description: 'Tag someone in your story', onSelect: onMention, icon: <AtSign className="h-5 w-5" />, iconStyle: 'bg-pink-500/10 text-pink-500' },
    { id: 'poll', title: 'Poll', description: 'Ask a question and collect votes', onSelect: onPoll, icon: <BarChart3 className="h-5 w-5" />, iconStyle: 'bg-pink-500/10 text-pink-500' },
    { id: 'photo-collage', title: 'Photo Collage', description: 'Combine 2–6 photos in one sticker', onSelect: onPhotoCollage, icon: <Images className="h-5 w-5" />, iconStyle: 'bg-indigo-500/10 text-indigo-500' },
    { id: 'emoji-slider', title: 'Emoji Slider', description: 'Collect emoji reactions from viewers', onSelect: onEmojiSlider, icon: <SlidersHorizontal className="h-5 w-5" />, iconStyle: 'bg-orange-500/10 text-orange-500' },
    { id: 'quiz', title: 'Quiz', description: 'Ask a question with one correct answer', onSelect: onQuiz, icon: <Brain className="h-5 w-5" />, iconStyle: 'bg-violet-500/10 text-violet-500' },
    { id: 'countdown', title: 'Countdown', description: 'Add a live countdown to your story', onSelect: onCountdown, icon: <Timer className="h-5 w-5" />, iconStyle: 'bg-violet-500/10 text-violet-500' },
    { id: 'link', title: 'Link', description: 'Add a clickable website sticker', onSelect: onLink, icon: <Link2 className="h-5 w-5" />, iconStyle: 'bg-blue-500/10 text-blue-500' },
    { id: 'snapdrop', title: 'SnapDrop', description: 'Invite people to add a photo', onSelect: onSnapDrop, icon: <Camera className="h-5 w-5" />, iconStyle: 'bg-violet-500/10 text-violet-500' },
    { id: 'shapecut', title: 'ShapeCut', description: 'Clip a photo into one of 120 shapes', onSelect: onShapeCut, icon: <Shapes className="h-5 w-5" />, iconStyle: 'bg-cyan-500/10 text-cyan-500' },
  ]

  const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
  const filteredStickers = stickers.filter(sticker =>
    `${sticker.title} ${sticker.description}`.toLocaleLowerCase().includes(normalizedQuery)
  )

  return (
    <div className="fixed inset-x-0 bottom-0 top-auto z-[165] flex h-[min(78dvh,620px)] w-full max-w-none flex-col rounded-t-2xl border-t border-border bg-card text-foreground shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:top-0 sm:h-full sm:w-80 sm:max-w-[88vw] sm:rounded-none sm:border-l sm:border-t-0" role="dialog" aria-modal="true" aria-label="Story stickers">
      <div className="flex shrink-0 items-center justify-between border-b border-border p-4">
        <h2 className="text-lg font-bold">Stickers</h2>
        <button type="button" onClick={onClose} className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close stickers">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="shrink-0 border-b border-border p-3">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            placeholder="Search stickers..."
            aria-label="Search stickers"
            className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-16 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {searchQuery.length > 0 && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Clear
            </button>
          )}
        </label>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {filteredStickers.length > 0 ? (
          filteredStickers.map(sticker => (
            <button
              key={sticker.id}
              type="button"
              onClick={sticker.onSelect}
              disabled={!sticker.onSelect}
              className="mb-2 flex w-full items-center gap-3 rounded-xl border border-border bg-background p-3 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${sticker.iconStyle}`}>
                {sticker.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{sticker.title}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{sticker.description}</span>
              </span>
            </button>
          ))
        ) : (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground" role="status">No stickers found</p>
        )}
      </div>
    </div>
  )
}
