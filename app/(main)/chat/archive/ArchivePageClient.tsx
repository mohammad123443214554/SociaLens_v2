'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArchiveRestore, Bot, MessageSquare, MoreVertical, Pin, PencilLine, Forward, Trash2, Check, X, ImagePlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/hooks/useUser'
import { useBlockedRelations, useBlockedByOthers, useArchiveLockStatus } from '@/lib/hooks/useChatSettings'
import { PageLoader } from '@/components/shared/LoadingSpinner'
import { ChatListItem } from '@/components/chat/ChatListItem'
import { ArchivePasswordWizard } from '@/components/chat/ArchivePasswordWizard'
import { ArchiveUnlockScreen } from '@/components/chat/ArchiveUnlockScreen'
import { AperonixShareModal } from '@/components/aperonix/AperonixShareModal'
import { ChatWallpaperControls, ChatWallpaper } from '@/components/aperonix/ChatWallpaperControls'
import { getAvatarUrl } from '@/lib/utils/helpers'
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
  const [openAperonixMenuId, setOpenAperonixMenuId] = useState<string | null>(null)
  const [renamingAperonixId, setRenamingAperonixId] = useState<string | null>(null)
  const [renameAperonixValue, setRenameAperonixValue] = useState('')
  const [savingAperonixId, setSavingAperonixId] = useState<string | null>(null)
  const [shareChatText, setShareChatText] = useState<string | null>(null)
  const [wallpaperChatId, setWallpaperChatId] = useState<string | null>(null)
  const [wallpaperValue, setWallpaperValue] = useState<ChatWallpaper | null>(null)
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
      <div className="sticky top-14 z-20 bg-background border-b border-border px-4 py-3 flex items-center gap-3">
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
              {chats.length > 0 && <div className="flex items-center gap-2 px-4 py-3 bg-muted/40">
                <Bot className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Aperonix conversations</h2>
                <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{aperonixChats.length}</span>
              </div>}
              {aperonixChats.map(conversation => (
                <div key={conversation.id} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/60">
                  <button onClick={() => router.push('/aperonix')} aria-label="Open Aperonix" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><MessageSquare className="h-5 w-5" /></button>
                  <div className="min-w-0 flex-1">
                    {renamingAperonixId === conversation.id ? (
                      <form className="flex items-center gap-1.5" onSubmit={async event => {
                        event.preventDefault()
                        const title = renameAperonixValue.trim()
                        if (!title) return
                        setSavingAperonixId(conversation.id)
                        const { error } = await supabase.from('aperonix_conversations').update({ title, updated_at: new Date().toISOString() }).eq('id', conversation.id).eq('user_id', user.id)
                        setSavingAperonixId(null)
                        if (error) { alert('Could not rename this conversation. Please try again.'); return }
                        setAperonixChats(prev => prev.map(item => item.id === conversation.id ? { ...item, title } : item))
                        setRenamingAperonixId(null)
                      }}>
                        <input autoFocus value={renameAperonixValue} onChange={event => setRenameAperonixValue(event.target.value)} maxLength={80} className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary" aria-label="Conversation title" />
                        <button type="submit" disabled={savingAperonixId === conversation.id} aria-label="Save title" className="rounded-lg p-1.5 text-primary hover:bg-accent"><Check className="h-4 w-4" /></button>
                        <button type="button" onClick={() => setRenamingAperonixId(null)} aria-label="Cancel rename" className="rounded-lg p-1.5 hover:bg-accent"><X className="h-4 w-4" /></button>
                      </form>
                    ) : <p className="truncate text-sm font-medium">{conversation.title || 'Aperonix conversation'}</p>}
                    <p className="mt-0.5 text-xs text-muted-foreground">Archived {new Date(conversation.updated_at).toLocaleDateString()}</p>
                  </div>
                  <div className="relative shrink-0">
                    <button onClick={() => setOpenAperonixMenuId(current => current === conversation.id ? null : conversation.id)} aria-label="Conversation options" aria-expanded={openAperonixMenuId === conversation.id} className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"><MoreVertical className="h-4 w-4" /></button>
                    {openAperonixMenuId === conversation.id && <>
                      <button aria-label="Close conversation menu" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpenAperonixMenuId(null)} />
                      <div className="absolute right-0 top-9 z-40 w-56 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xl">
                        <button onClick={async () => {
                          setSavingAperonixId(conversation.id)
                          const { data, error } = await supabase.from('aperonix_conversations').select('pinned').eq('id', conversation.id).eq('user_id', user.id).single()
                          if (!error) {
                            const update = await supabase.from('aperonix_conversations').update({ pinned: !data.pinned, updated_at: new Date().toISOString() }).eq('id', conversation.id).eq('user_id', user.id)
                            if (update.error) alert('Could not update the pin. Please try again.')
                          } else alert('Could not update the pin. Please try again.')
                          setSavingAperonixId(null); setOpenAperonixMenuId(null)
                        }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm hover:bg-muted"><Pin className="h-3.5 w-3.5" /> Pin</button>
                        <button onClick={() => { setRenameAperonixValue(conversation.title); setRenamingAperonixId(conversation.id); setOpenAperonixMenuId(null) }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm hover:bg-muted"><PencilLine className="h-3.5 w-3.5" /> Rename</button>
                        <ChatWallpaperControls conversationId={conversation.id} wallpaper={wallpaperChatId === conversation.id ? wallpaperValue : null} isActive={false} onWallpaperChange={value => { setWallpaperChatId(conversation.id); setWallpaperValue(value) }} />
                        <button onClick={async () => {
                          setOpenAperonixMenuId(null)
                          const { data, error } = await supabase.from('aperonix_messages').select('role,content,created_at,attachments').eq('conversation_id', conversation.id).eq('user_id', user.id).order('created_at', { ascending: true })
                          if (error) { alert('Could not load this conversation for sharing. Please try again.'); return }
                          const shared = { version: 1, type: 'chat', title: conversation.title, owner: { username: user.email?.split('@')[0] || 'SociaLens user', avatar_url: null }, messages: (data || []).map((message: any) => ({ role: message.role === 'user' ? 'user' : 'model', content: message.content || '', timestamp: new Date(message.created_at).getTime(), attachments: (message.attachments || []).map((attachment: any) => ({ name: attachment.name, kind: attachment.kind, mimeType: attachment.mimeType })) })) }
                          setShareChatText(JSON.stringify(shared))
                        }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm hover:bg-muted"><Forward className="h-3.5 w-3.5" /> Share Chat</button>
                        <button disabled={restoringAperonixId === conversation.id} onClick={async () => {
                          setOpenAperonixMenuId(null); setRestoringAperonixId(conversation.id)
                          const { error } = await supabase.from('aperonix_conversations').update({ archived_at: null, updated_at: new Date().toISOString() }).eq('id', conversation.id).eq('user_id', user.id)
                          setRestoringAperonixId(null)
                          if (error) { alert('Could not restore this conversation. Please try again.'); return }
                          setAperonixChats(prev => prev.filter(item => item.id !== conversation.id))
                        }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm hover:bg-muted disabled:opacity-50"><ArchiveRestore className="h-3.5 w-3.5" /> Unarchive Chat</button>
                        <button onClick={async () => {
                          setOpenAperonixMenuId(null)
                          if (!window.confirm('Permanently delete this Aperonix conversation and its attachments? This action cannot be undone.')) return
                          setSavingAperonixId(conversation.id)
                          const { data: messages, error: readError } = await supabase.from('aperonix_messages').select('attachments').eq('conversation_id', conversation.id).eq('user_id', user.id)
                          if (readError) { setSavingAperonixId(null); alert('Could not prepare chat deletion. Please try again.'); return }
                          const paths = (messages || []).flatMap((row: any) => Array.isArray(row.attachments) ? row.attachments : []).map((item: any) => item?.path).filter((item: unknown): item is string => typeof item === 'string' && item.startsWith(user.id + '/'))
                          if (paths.length) {
                            const { error: storageError } = await supabase.storage.from('aperonix-files').remove([...new Set(paths)])
                            if (storageError) { setSavingAperonixId(null); alert('Attachments could not be deleted, so the conversation was kept.'); return }
                          }
                          const { error } = await supabase.from('aperonix_conversations').delete().eq('id', conversation.id).eq('user_id', user.id)
                          setSavingAperonixId(null)
                          if (error) { alert('Could not delete this conversation. Please try again.'); return }
                          setAperonixChats(prev => prev.filter(item => item.id !== conversation.id))
                        }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-red-500 hover:bg-red-500/10"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                      </div>
                    </>}
                  </div>
                </div>
              ))}
            </section>
          )}
          {chats.length > 0 && aperonixChats.length > 0 && <div className="flex items-center gap-2 px-4 py-3 bg-muted/40"><MessageSquare className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">User chats</h2><span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{chats.length}</span></div>}
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
      {shareChatText !== null && <AperonixShareModal replyText={shareChatText} contentType="chat" onClose={() => setShareChatText(null)} />}
    </div>
  )
}
