'use client'

import { ArrowLeft, PencilLine, Image as ImageIcon, ImageOff, Ban, Trash2, ChevronRight, Phone } from 'lucide-react'

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
  onRemoveWallpaper: () => void
  onToggleBlock: () => void
  onDeleteChat: () => void
  onOpenCallSettings: () => void
}

/**
 * Full-page "Chat Setting" screen - opened from the settings icon in the
 * Chat header (replaces the old 3-dot dropdown). Same actions as before,
 * just laid out as a proper settings page with a Back button.
 */
export function ChatSettingsPage({
  otherUsername,
  myNicknameForThem,
  hasWallpaper,
  iBlockedThem,
  deleting,
  showNicknameOption,
  onBack,
  onSetNickname,
  onSetWallpaper,
  onRemoveWallpaper,
  onToggleBlock,
  onDeleteChat,
  onOpenCallSettings,
}: ChatSettingsPageProps) {
  return (
    <div className="absolute inset-0 bg-background z-20 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b sticky top-0 bg-background z-10">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground p-1 -ml-1">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="font-bold text-base leading-tight">Chat Setting</h1>
          <p className="text-xs text-muted-foreground">{otherUsername}</p>
        </div>
      </div>

      {/* Options */}
      <div className="flex-1 overflow-y-auto max-w-xl w-full mx-auto p-4 space-y-4">
        <div className="rounded-2xl border bg-card divide-y overflow-hidden">
          {showNicknameOption && (
            <button
              onClick={onSetNickname}
              className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-accent transition-colors"
            >
              <div className="flex items-center gap-3">
                <PencilLine className="h-5 w-5 text-muted-foreground" />
                <div>
                  <span className="text-sm font-medium block">
                    {myNicknameForThem ? 'Edit Nickname' : 'Set Nickname'}
                  </span>
                  {myNicknameForThem && (
                    <span className="text-xs text-muted-foreground">Currently "{myNicknameForThem}"</span>
                  )}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          )}

          <button
            onClick={onSetWallpaper}
            className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-accent transition-colors"
          >
            <div className="flex items-center gap-3">
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium">{hasWallpaper ? 'Edit Wallpaper' : 'Set Wallpaper'}</span>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>

          {hasWallpaper && (
            <button
              onClick={onRemoveWallpaper}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-accent transition-colors"
            >
              <ImageOff className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium">Remove Wallpaper</span>
            </button>
          )}

          <button
            onClick={onToggleBlock}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-accent transition-colors"
          >
            <Ban className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium">{iBlockedThem ? 'Unblock' : 'Block'}</span>
          </button>
        </div>

        <div className="rounded-2xl border bg-card divide-y overflow-hidden">
          <button
            onClick={onOpenCallSettings}
            className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-accent transition-colors"
          >
            <div className="flex items-center gap-3">
              <Phone className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium">Call settings</span>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
        </div>

        <div className="rounded-2xl border bg-card overflow-hidden">
          <button
            onClick={onDeleteChat}
            disabled={deleting}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
          >
            <Trash2 className="h-5 w-5" />
            <span className="text-sm font-medium">{deleting ? 'Deleting...' : 'Delete Conversation'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
