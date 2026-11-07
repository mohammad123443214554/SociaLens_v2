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

/** Personal settings for this conversation, ordered by everyday use. */
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

      <div className="mx-auto w-full max-w-xl flex-1 space-y-4 overflow-y-auto p-4">
        {showNicknameOption && (
          <div className="overflow-hidden rounded-2xl border bg-card">
            <button type="button" onClick={onSetNickname} className="flex w-full items-center justify-between px-4 py-3.5 text-left transition-colors hover:bg-accent">
              <span className="flex min-w-0 items-center gap-3">
                <PencilLine className="h-5 w-5 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{myNicknameForThem ? 'Edit Nickname' : 'Set Nickname'}</span>
                  {myNicknameForThem && <span className="block truncate text-xs text-muted-foreground">Currently "{myNicknameForThem}"</span>}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border bg-card">
          <button type="button" onClick={onSetWallpaper} className="flex w-full items-center justify-between px-4 py-3.5 text-left transition-colors hover:bg-accent">
            <span className="flex items-center gap-3">
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium">Wallpaper settings</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl border bg-card">
          <button type="button" onClick={onOpenCallSettings} className="flex w-full items-center justify-between px-4 py-3.5 text-left transition-colors hover:bg-accent">
            <span className="flex items-center gap-3">
              <Phone className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium">Call settings</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl border bg-card">
          <button type="button" onClick={onToggleBlock} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent">
            <Ban className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium">{iBlockedThem ? 'Unblock' : 'Block'}</span>
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl border bg-card">
          <button type="button" onClick={onDeleteChat} disabled={deleting} className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50">
            <Trash2 className="h-5 w-5" />
            <span className="text-sm font-medium">{deleting ? 'Deleting...' : 'Delete Conversation'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
