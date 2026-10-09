'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Edit, X, Search, Archive } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/hooks/useUser'
import { getAvatarUrl } from '@/lib/utils/helpers'
import { useBlockedByOthers, useBlockedRelations, useArchiveLockStatus } from '@/lib/hooks/useChatSettings'
import { PageLoader } from '@/components/shared/LoadingSpinner'
import { ChatListItem } from '@/components/chat/ChatListItem'
import { ArchivePasswordWizard } from '@/components/chat/ArchivePasswordWizard'
import type { Chat } from '@/lib/types/database.types'

interface ChatRow extends Chat {
  participant1: { id: string; username: string; avatar_url: string | null; is_verified?: boolean; verification_type?: 'blue' | 'yellow' | null }
  participant2: { id: string; username: string; avatar_url: string | null; is_verified?: boolean; verification_type?: 'blue' | 'yellow' | null }
}

interface SearchProfile {
  id: string
  username: string
  full_name: string | null
  avatar_url: string | null
  message_privacy: 'everyone' | 'followers' | 'following' | 'selected' | 'none'
}

export default function ChatPage() {
  const { user, loading } = useUser()
  const [chats, setChats] = useState<ChatRow[]>([])
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({})
  const router = useRouter()
  const supabase = createClient()

  const [showNewChat, setShowNewChat] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchProfile[]>([])
  const [searching, setSearching] = useState(false)
  const [startingChatWith, setStartingChatWith] = useState<string | null>(null)
  const [startChatError, setStartChatError] = useState('')
  const [showArchiveWizard, setShowArchiveWizard] = useState<string | null>(null) // chatId pending archive

  const { data: blockedByOthers = new Set<string>() } = useBlockedByOthers(user?.id)
  const { data: blockedRelations = new Set<string>() } = useBlockedRelations(user?.id)
  const { data: archiveLock } = useArchiveLockStatus(user?.id)

  const fetchChats = async () => {
    if (!user) return
    const { data } = await supabase
      .from('chats')
      .select('*, participant1:profiles!chats_participant1_id_fkey(id,username,avatar_url,is_verified,verification_type), participant2:profiles!chats_participant2_id_fkey(id,username,avatar_url,is_verified,verification_type)')
      .or(`participant1_id.eq.${user.id},participant2_id.eq.${user.id}`)
      .order('last_message_time', { ascending: false })
    // Chats the person deleted from their own inbox stay hidden until a
    // new message brings them back. Chats where the other side blocked me
    // disappear from my list entirely (their account is effectively gone
    // to me until they unblock). Archived chats live in /chat/archive
    // instead of here.
    const visible = (data || []).filter((c: any) => {
      if (c.deleted_by?.includes(user.id)) return false
      if (c.archived_by?.includes(user.id)) return false
      const otherId = c.participant1_id === user.id ? c.participant2_id : c.participant1_id
      if (blockedByOthers.has(otherId)) return false
      return true
    })
    // Pinned chats first, then most-recently-active.
    visible.sort((a: any, b: any) => {
      const aPinned = a.pinned_by?.includes(user.id) ? 1 : 0
      const bPinned = b.pinned_by?.includes(user.id) ? 1 : 0
      if (aPinned !== bPinned) return bPinned - aPinned
      return new Date(b.last_message_time || 0).getTime() - new Date(a.last_message_time || 0).getTime()
    })
    setChats(visible as ChatRow[])

    // Unread counts - archived chats never contribute to the badge, that's
    // what keeps the Archive section quiet/private.
    const archivedIds = new Set((data || []).filter((c: any) => c.archived_by?.includes(user.id)).map((c: any) => c.id))
    const { data: unread } = await supabase
      .from('messages')
      .select('chat_id')
      .eq('is_read', false)
      .neq('sender_id', user.id)
    if (unread) {
      const counts: Record<string, number> = {}
      unread.forEach(m => { if (!archivedIds.has(m.chat_id)) counts[m.chat_id] = (counts[m.chat_id] || 0) + 1 })
      setUnreadMap(counts)
    }
  }

  useEffect(() => {
    if (!user) return
    fetchChats()
    const channel = supabase
      .channel('chat-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, fetchChats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, fetchChats)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user, blockedByOthers])

  // Search profiles by username/name while the "New conversation" panel is open
  useEffect(() => {
    if (!showNewChat) return
    const query = searchQuery.trim()
    if (!query) { setSearchResults([]); return }

    setSearching(true)
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, message_privacy')
        .or(`username.ilike.%${query}%,full_name.ilike.%${query}%`)
        .neq('id', user?.id ?? '')
        .limit(15)
      const filtered = ((data as SearchProfile[]) || []).filter(p => !blockedRelations.has(p.id))
      setSearchResults(filtered)
      setSearching(false)
    }, 300)

    return () => clearTimeout(timeout)
  }, [searchQuery, showNewChat, user, blockedRelations])

  const startChat = async (target: SearchProfile) => {
    if (!user || startingChatWith) return
    setStartChatError('')

    // Check the recipient's message privacy up front so we can show a clear,
    // friendly explanation instead of a raw database error.
    if (target.message_privacy && target.message_privacy !== 'everyone') {
      if (target.message_privacy === 'none') {
        setStartChatError('Message is not available.')
        return
      }
      if (target.message_privacy === 'followers') {
        const { data: follow } = await supabase
          .from('follows')
          .select('id')
          .eq('follower_id', user.id)
          .eq('following_id', target.id)
          .eq('status', 'accepted')
          .maybeSingle()
        if (!follow) {
          setStartChatError('Message is unavailable. Please follow and start conversation.')
          return
        }
      }
      if (target.message_privacy === 'following') {
        const { data: follow } = await supabase
          .from('follows')
          .select('id')
          .eq('follower_id', target.id)
          .eq('following_id', user.id)
          .eq('status', 'accepted')
          .maybeSingle()
        if (!follow) {
          setStartChatError('Message is only available to people this user follows.')
          return
        }
      }
      if (target.message_privacy === 'selected') {
        const { data: sel } = await supabase
          .from('privacy_selected_users')
          .select('id')
          .eq('owner_id', target.id)
          .eq('category', 'message')
          .eq('selected_user_id', user.id)
          .maybeSingle()
        if (!sel) {
          setStartChatError('Message is a selected person are available.')
          return
        }
      }
    }

    setStartingChatWith(target.id)
    try {
      // Reuse an existing conversation if one already exists between these two users
      const { data: existing } = await supabase
        .from('chats')
        .select('id')
        .or(
          `and(participant1_id.eq.${user.id},participant2_id.eq.${target.id}),` +
          `and(participant1_id.eq.${target.id},participant2_id.eq.${user.id})`
        )
        .maybeSingle()

      if (existing) {
        router.push(`/chat/${existing.id}`)
        return
      }

      const { data: created, error } = await supabase
        .from('chats')
        .insert({ participant1_id: user.id, participant2_id: target.id })
        .select('id')
        .single()

      if (error || !created) {
        setStartChatError('Message is not available.')
        return
      }

      router.push(`/chat/${created.id}`)
    } finally {
      setStartingChatWith(null)
    }
  }

  if (loading) return <PageLoader />

  const getOther = (chat: ChatRow) =>
    chat.participant1_id === user?.id ? chat.participant2 : chat.participant1

  return (
    <div className="max-w-xl mx-auto">
      <div className="sticky top-14 z-10 bg-background border-b px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold">Messages</h1>
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/chat/archive')} className="text-muted-foreground hover:text-foreground" title="Archive">
            <Archive className="h-5 w-5" />
          </button>
          <button onClick={() => setShowNewChat(true)} className="text-muted-foreground hover:text-foreground" title="New conversation">
            <Edit className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Aperonix AI - always pinned at the top */}
      <Link
        href="/aperonix"
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors border-b text-left"
      >
        <Image src="/images/aperonix-logo.png" alt="Aperonix" width={48} height={48} className="rounded-full shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Aperonix AI</p>
          <p className="text-xs text-muted-foreground truncate mt-0.5">Ask me anything about SociaLens</p>
        </div>
      </Link>

      {chats.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <p className="font-medium">No messages yet</p>
          <p className="text-sm mt-1">Start a conversation!</p>
        </div>
      ) : (
        <div>
          {chats.map(chat => {
            if (!user) return null
            const other = getOther(chat)
            const unread = unreadMap[chat.id] || 0
            const isPinned = chat.pinned_by?.includes(user.id) ?? false
            // The main list already hides chats where the other person
            // blocked me, so if there's still a block relation on record
            // here, it can only be one I put in place myself.
            const iBlockedThem = blockedRelations.has(other?.id || '')
            return (
              <ChatListItem
                key={chat.id}
                chat={chat}
                other={other}
                currentUserId={user.id}
                unread={unread}
                isPinned={isPinned}
                isArchived={false}
                iBlockedThem={iBlockedThem}
                onArchive={!archiveLock?.hasPassword ? () => setShowArchiveWizard(chat.id) : undefined}
              />
            )
          })}
        </div>
      )}

      {/* New conversation modal */}
      {showNewChat && (
        <div
          className="fixed inset-0 bg-black/60 z-[100] flex items-end sm:items-center justify-center p-4"
          onClick={() => { setShowNewChat(false); setSearchQuery(''); setSearchResults([]) }}
        >
          <div
            className="bg-card rounded-2xl w-full max-w-sm max-h-[70vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <p className="font-semibold">New Conversation</p>
              <button
                onClick={() => { setShowNewChat(false); setSearchQuery(''); setSearchResults([]) }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-3 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search by username..."
                  className="w-full bg-muted rounded-xl pl-9 pr-3 py-2 text-sm outline-none border border-transparent focus:border-pink-500"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {searching ? (
                <p className="text-xs text-muted-foreground text-center py-6">Searching...</p>
              ) : searchQuery.trim() === '' ? (
                <p className="text-xs text-muted-foreground text-center py-6">Type a username to find someone to message.</p>
              ) : searchResults.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No one found.</p>
              ) : (
                searchResults.map(p => (
                  <button
                    key={p.id}
                    onClick={() => startChat(p)}
                    disabled={startingChatWith === p.id}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-accent transition-colors text-left disabled:opacity-60"
                  >
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarImage src={getAvatarUrl(p.avatar_url)} />
                      <AvatarFallback>{p.username?.[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{p.username}</p>
                      {p.full_name && <p className="text-xs text-muted-foreground truncate">{p.full_name}</p>}
                    </div>
                    {startingChatWith === p.id && <span className="text-xs text-muted-foreground">Starting...</span>}
                  </button>
                ))
              )}
            </div>
            {startChatError && (
              <p className="text-xs text-red-500 text-center p-3 border-t">{startChatError}</p>
            )}
          </div>
        </div>
      )}

      {/* First-time archive password setup, triggered from a chat's "Archive" action */}
      {showArchiveWizard && user && (
        <ArchivePasswordWizard
          onClose={() => setShowArchiveWizard(null)}
          onDone={() => {
            const chatId = showArchiveWizard
            setShowArchiveWizard(null)
            supabase.from('chats').select('archived_by').eq('id', chatId).maybeSingle().then(({ data }) => {
              const current: string[] = data?.archived_by || []
              if (!current.includes(user.id)) {
                supabase.from('chats').update({ archived_by: [...current, user.id] }).eq('id', chatId).then(() => fetchChats())
              }
            })
          }}
        />
      )}
    </div>
  )
}
