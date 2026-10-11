'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArchiveRestore, Bot, MessageSquare } from 'lucide-react'
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
  const [aperonixChats, setAperonixChats] = useState<{ id: string; title: string; updated_at: string }[]>([])
  const [restoringAperonixId, setRestoringAperonixId] = useState<string | null>(null)
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

    const { data: archivedAperonix, error: aperonixError } = await supabase
      .from('aperonix_conversations')
      .select('id,title,updated_at')
      .eq('user_id', user.id)
      .not('archived_at', 'is', null)
      .order('archived_at', { ascending: false })
    if (aperonixError) {
      console.error('Could not load archived Aperonix chats', aperonixError)
    } else {
      setAperonixChats(archivedAperonix || [])
    }

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'aperonix_conversations' }, fetchArchivedChats)
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

      {chats.length === 0 && aperonixChats.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <p className="font-medium">No archived chats</p>
          <p className="text-sm mt-1">Chats you archive will show up here.</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {aperonixChats.length > 0 && (
            <section className="border-b border-border">
              <div className="flex items-center gap-2 px-4 py-3 bg-muted/40">
                <Bot className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Aperonix conversations</h2>
                <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{aperonixChats.length}</span>
              </div>
              {aperonixChats.map(conversation => (
                <div key={conversation.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/60">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><MessageSquare className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{conversation.title || 'Aperonix conversation'}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Archived {new Date(conversation.updated_at).toLocaleDateString()}</p>
                  </div>
                  <button
                    disabled={restoringAperonixId === conversation.id}
                    onClick={async () => {
                      setRestoringAperonixId(conversation.id)
                      const { error } = await supabase.from('aperonix_conversations')
                        .update({ archived_at: null, updated_at: new Date().toISOString() })
                        .eq('id', conversation.id).eq('user_id', user.id)
                      setRestoringAperonixId(null)
                      if (error) { alert('Could not restore this conversation. Please try again.'); return }
                      setAperonixChats(prev => prev.filter(item => item.id !== conversation.id))
                      router.push('/aperonix')
                    }}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-accent disabled:opacity-50"
                  >
                    <ArchiveRestore className="h-3.5 w-3.5" /> {restoringAperonixId === conversation.id ? 'Restoring…' : 'Restore'}
                  </button>
                </div>
              ))}
            </section>
          )}
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
