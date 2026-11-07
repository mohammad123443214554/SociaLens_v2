'use client'

import { ArrowLeft, PencilLine, Image as ImageIcon, Ban, Trash2, ChevronRight, Phone } from 'lucide-react'

interface ChatSettingsPageProps {
  otherUsername: string
  myNicknameForThem: string | null
  hasWallpaper: boolean
  iBlockedThem: boolean
  deleting: boolean
  showNicknameOption: boolean
  onBack: () => void
  onSetNickname: () => void
  onSetWallpaper: () => void
  onEditWallpaper: () => void
  onRemoveWallpaper: () => void
  onToggleBlock: () => void
  onDeleteChat: () => void
  onOpenCallSettings: () => void
}

/** Each chat preference is its own clearly separated row, in the requested order. */
export function ChatSettingsPage({
  otherUsername,
  myNicknameForThem,
  iBlockedThem,
  deleting,
  showNicknameOption,
  onBack,
  onSetNickname,
  onSetWallpaper,
  onToggleBlock,
  onDeleteChat,
  onOpenCallSettings,
}: ChatSettingsPageProps) {
  const rowClass = 'flex min-h-14 w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent'

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-background">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background px-4 py-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/70 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-pink-500/40 hover:text-pink-400 sm:px-3 sm:py-2 sm:text-sm">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <div>
          <h1 className="text-base font-bold leading-tight">Chat Setting</h1>
          <p className="text-xs text-muted-foreground">{otherUsername}</p>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-3 overflow-y-auto p-4">
        {showNicknameOption && (
          <section className="shrink-0 overflow-hidden rounded-2xl border border-border bg-card">
            <button type="button" onClick={onSetNickname} className={rowClass}>
              <PencilLine className="h-5 w-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{myNicknameForThem ? 'Edit Nickname' : 'Set Nickname'}</span>
                {myNicknameForThem && <span className="block truncate text-xs text-muted-foreground">Currently "{myNicknameForThem}"</span>}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </section>
        )}

        <section className="shrink-0 overflow-hidden rounded-2xl border border-border bg-card">
          <button type="button" onClick={onSetWallpaper} className={rowClass}>
            <ImageIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 text-sm font-medium">Wallpaper settings</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </section>

        <section className="shrink-0 overflow-hidden rounded-2xl border border-border bg-card">
          <button type="button" onClick={onOpenCallSettings} className={rowClass}>
            <Phone className="h-5 w-5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 text-sm font-medium">Call settings</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </section>

        <section className="shrink-0 overflow-hidden rounded-2xl border border-border bg-card">
          <button type="button" onClick={onToggleBlock} className={rowClass}>
            <Ban className="h-5 w-5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 text-sm font-medium">{iBlockedThem ? 'Unblock' : 'Block'}</span>
          </button>
        </section>

        <section className="shrink-0 overflow-hidden rounded-2xl border border-border bg-card">
          <button type="button" onClick={onDeleteChat} disabled={deleting} className={rowClass + ' text-destructive hover:bg-destructive/10 disabled:opacity-50'}>
            <Trash2 className="h-5 w-5 shrink-0" />
            <span className="min-w-0 flex-1 text-sm font-medium">{deleting ? 'Deleting...' : 'Delete Conversation'}</span>
          </button>
        </section>
      </div>
    </div>
  )
}
