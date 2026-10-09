'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MoreVertical, Pin, PinOff, Trash2, Ban, Archive, ArchiveRestore } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getAvatarUrl, formatTimeAgo } from '@/lib/utils/helpers'
import { getChatPreviewText } from '@/lib/utils/chatPreview'
import { getClampedPopupPosition } from '@/lib/utils/popupPosition'
import { useTogglePinChat, useToggleArchiveChat, useDeleteChatForMe, useToggleBlock } from '@/lib/hooks/useChatSettings'
import type { Chat } from '@/lib/types/database.types'
import { VerifiedBadge } from '@/components/shared/VerifiedBadge'
import { StatusDot } from '@/components/shared/StatusDot'
import { useUserStatus } from '@/lib/hooks/useUserStatus'

const MENU_WIDTH = 200
const MENU_HEIGHT = 200

interface ChatListItemProps {
  chat: Chat
  other: { id: string; username: string; avatar_url: string | null; is_verified?: boolean; verification_type?: 'blue' | 'yellow' | null } | null | undefined
  currentUserId: string
  unread: number
  isPinned: boolean
  isArchived: boolean
  /** Whether *I* have blocked this person - the list already excludes
   *  chats where they've blocked me, so this only ever needs to reflect
   *  My own side. */
  iBlockedThem: boolean
  /** When set, replaces the default in-place archive toggle - e.g. to run
   *  the first-time password wizard before actually archiving. */
  onArchive?: () => void
}

export function ChatListItem({ chat, other, currentUserId, unread, isPinned, isArchived, iBlockedThem, onArchive }: ChatListItemProps) {
  const router = useRouter()
  const [showMenu, setShowMenu] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const menuBtnRef = useRef<HTMLButtonElement>(null)

  const togglePin = useTogglePinChat()
  const toggleArchive = useToggleArchiveChat()
  const deleteChat = useDeleteChatForMe()
  const toggleBlock = useToggleBlock()
  const status = useUserStatus(other?.id, chat.id)

  const openMenu = () => {
    const rect = menuBtnRef.current?.getBoundingClientRect()
    if (rect) setMenuPos(getClampedPopupPosition(rect, MENU_WIDTH, MENU_HEIGHT))
    setShowMenu(true)
  }

  const handlePin = () => {
    setShowMenu(false)
    togglePin.mutate({ chatId: chat.id, userId: currentUserId, pin: !isPinned })
  }

  const handleDelete = () => {
    setShowMenu(false)
    if (!confirm('Delete this conversation? It will be removed from your inbox.')) return
    deleteChat.mutate({ chatId: chat.id, userId: currentUserId })
  }

  const handleBlock = () => {
    setShowMenu(false)
    if (!other) return
    if (!iBlockedThem && !confirm(`Block ${other.username}? They won't be able to message you, and your profile will be hidden from them here.`)) return
    toggleBlock.mutate({ blockerId: currentUserId, blockedId: other.id, block: !iBlockedThem })
  }

  const handleArchive = () => {
    setShowMenu(false)
    if (onArchive) { onArchive(); return }
    toggleArchive.mutate({ chatId: chat.id, userId: currentUserId, archive: !isArchived })
  }

  if (!other) return null

  return (
    <div className="relative w-full flex items-center gap-1 border-b group">
      <button
        onClick={() => router.push(`/chat/${chat.id}`)}
        className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors text-left"
      >
        <div className="relative shrink-0">
          <Avatar className="h-12 w-12">
            <AvatarImage src={getAvatarUrl(other.avatar_url)} />
            <AvatarFallback>{other.username?.[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <StatusDot status={status} className="absolute bottom-0 right-0" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {isPinned && <Pin className="h-3 w-3 text-muted-foreground shrink-0 fill-current" />}
            <p className={`text-sm truncate ${unread > 0 ? 'font-bold' : 'font-semibold'}`}>{other.username}</p>
            {other.is_verified && <VerifiedBadge type={other.verification_type} className="text-xs shrink-0" />}
            <p className="text-xs text-muted-foreground shrink-0 ml-auto">
              {chat.last_message_time ? formatTimeAgo(chat.last_message_time) : ''}
            </p>
          </div>
          <p className={`text-xs truncate mt-0.5 ${unread > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
            {getChatPreviewText(chat, currentUserId)}
          </p>
        </div>
      </button>

      <button
        ref={menuBtnRef}
        onClick={openMenu}
        className="shrink-0 p-2 mr-1 rounded-full text-muted-foreground hover:bg-accent hover:text-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {showMenu && menuPos && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setShowMenu(false)} />
          <div
            className="fixed z-40 bg-card border rounded-xl shadow-xl overflow-hidden"
            style={{ top: menuPos.top, left: menuPos.left, width: MENU_WIDTH }}
          >
            <button onClick={handlePin} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted">
              {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
              {isPinned ? 'Unpin' : 'Pin'}
            </button>
            <button onClick={handleArchive} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted">
              {isArchived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
              {isArchived ? 'Unarchive' : 'Archive chat'}
            </button>
            <button onClick={handleBlock} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted">
              <Ban className="h-3.5 w-3.5" />
              {iBlockedThem ? 'Unblock' : 'Block'}
            </button>
            <button onClick={handleDelete} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-500 hover:bg-red-500/10">
              <Trash2 className="h-3.5 w-3.5" />
              Delete chat
            </button>
          </div>
        </>
      )}
    </div>
  )
}
