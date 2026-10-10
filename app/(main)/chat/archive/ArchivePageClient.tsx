'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/hooks/useUser'
import { useBlockedRelations, useBlockedByOthers, useArchiveLockStatus } from '@/lib/hooks/useChatSettings'
import { PageLoader } from '@/components/shared/LoadingSpinner'
import { ChatListItem } from '@/components/chat/ChatListItem'
import { ArchivePasswordWizard } from '@/components/chat/ArchivePasswordWizard'
import { ArchiveUnlockScreen } from '@/components/chat/ArchiveUnlockScreen'
import type { Chat } from '@/lib/types/database.types'

interface ChatRow extends Chat {
  participant1: { id: string; username: string; avatar_url: string | null; is_verified?: boolean; verification_type?: 'blue' | 'yellow' | null }
  participant2: { id: string; username: string; avatar_url: string | null; is_verified?: boolean; verification_type?: 'blue' | 'yellow' | null }
}

export default function ArchivePage() {
  const { user, loading } = useUser()
  const router = useRouter()
  const supabase = createClient()
  const [chats, setChats] = useState<ChatRow[]>([])
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({})
  // Unlocking resets on every visit/reload - the whole point of the
  // password is that it re-asks each time, not just the first time.
  const [unlocked, setUnlocked] = useState(false)

  const { data: blockedRelations = new Set<string>() } = useBlockedRelations(user?.id)
  const { data: blockedByOthers = new Set<string>() } = useBlockedByOthers(user?.id)
  const { data: archiveLock, isLoading: lockLoading } = useArchiveLockStatus(user?.id)

  const fetchArchivedChats = async () => {
    if (!user) return
    const { data } = await supabase
      .from('chats')
      .select('*, participant1:profiles!chats_participant1_id_fkey(id,username,avatar_url,is_verified,verification_type), participant2:profiles!chats_participant2_id_fkey(id,username,avatar_url,is_verified,verification_type)')
      .or(`participant1_id.eq.${user.id},participant2_id.eq.${user.id}`)
      .order('last_message_time', { ascending: false })

    const visible = (data || []).filter((c: any) => {
      if (!c.archived_by?.includes(user.id)) return false
      if (c.deleted_by?.includes(user.id)) return false
      const otherId = c.participant1_id === user.id ? c.participant2_id : c.participant1_id
      if (blockedByOthers.has(otherId)) return false
      return true
    })
    visible.sort((a: any, b: any) => {
      const aPinned = a.pinned_by?.includes(user.id) ? 1 : 0
      const bPinned = b.pinned_by?.includes(user.id) ? 1 : 0
      if (aPinned !== bPinned) return bPinned - aPinned
      return new Date(b.last_message_time || 0).getTime() - new Date(a.last_message_time || 0).getTime()
    })
    setChats(visible as ChatRow[])

    // Archived chats are intentionally excluded from the unread badge
    // everywhere else, so this list doesn't show one either - it's a
    // private, quiet space, not a second inbox competing for attention.
    setUnreadMap({})
  }

  useEffect(() => {
    if (!user || !unlocked) return
    fetchArchivedChats()
    const channel = supabase
      .channel('chat-archive-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, fetchArchivedChats)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user, unlocked, blockedByOthers])

  if (loading || lockLoading) return <PageLoader />
  if (!user) return null

  const getOther = (chat: ChatRow) =>
    chat.participant1_id === user.id ? chat.participant2 : chat.participant1

  // First time ever opening Archive (from this page directly, no chat
  // pre-selected) - same 3-step wizard as archiving a chat from the list.
  if (!archiveLock?.hasPassword) {
    return (
      <ArchivePasswordWizard
        onClose={() => router.push('/chat')}
        onDone={() => setUnlocked(true)}
      />
    )
  }

  if (!unlocked) {
    return <ArchiveUnlockScreen hint={archiveLock.hint} onUnlock={() => setUnlocked(true)} />
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="sticky top-14 z-20 bg-background border-b px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.push('/chat')} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold">Archive</h1>
      </div>

      {chats.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <p className="font-medium">No archived chats</p>
          <p className="text-sm mt-1">Chats you archive will show up here.</p>
        </div>
      ) : (
        <div>
          {chats.map(chat => {
            const other = getOther(chat)
            const isPinned = chat.pinned_by?.includes(user.id) ?? false
            const iBlockedThem = blockedRelations.has(other?.id || '')
            return (
              <ChatListItem
                key={chat.id}
                chat={chat}
                other={other}
                currentUserId={user.id}
                unread={unreadMap[chat.id] || 0}
                isPinned={isPinned}
                isArchived={true}
                iBlockedThem={iBlockedThem}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
