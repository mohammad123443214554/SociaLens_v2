'use client'

import { AtSign, Link2, X } from 'lucide-react'

interface StoryStickerSidebarProps {
  onClose: () => void
  onMention: () => void
  onLink: () => void
}

export function StoryStickerSidebar({ onClose, onMention, onLink }: StoryStickerSidebarProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 top-auto z-[165] flex h-[min(78dvh,620px)] w-full max-w-none flex-col rounded-t-2xl border-t border-border bg-card text-foreground shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:top-0 sm:h-full sm:w-80 sm:max-w-[88vw] sm:rounded-none sm:border-l sm:border-t-0" role="dialog" aria-modal="true" aria-label="Story stickers">
      <div className="flex shrink-0 items-center justify-between border-b border-border p-4">
        <h2 className="text-lg font-bold">Stickers</h2>
        <button type="button" onClick={onClose} className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close stickers">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <button type="button" onClick={onMention} className="flex w-full items-center gap-3 rounded-xl border border-border bg-background p-3 text-left transition-colors hover:bg-muted">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pink-500/10 text-pink-500"><AtSign className="h-5 w-5" /></span>
          <span className="min-w-0"><span className="block text-sm font-semibold">Mention</span><span className="mt-0.5 block text-xs text-muted-foreground">Tag someone in your story</span></span>
        </button>
        <button type="button" onClick={onLink} className="mt-2 flex w-full items-center gap-3 rounded-xl border border-border bg-background p-3 text-left transition-colors hover:bg-muted">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500"><Link2 className="h-5 w-5" /></span>
          <span className="min-w-0"><span className="block text-sm font-semibold">Link</span><span className="mt-0.5 block text-xs text-muted-foreground">Add a clickable website sticker</span></span>
        </button>
      </div>
    </div>
  )
}
