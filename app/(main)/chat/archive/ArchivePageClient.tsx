'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArchiveRestore, Bot, MessageSquare, MoreVertical, Pin, PencilLine, Trash2, Check, X, AudioLines, Play, Copy } from 'lucide-react'
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
  const [aperonixChats, setAperonixChats] = useState<{ id: string; title: string; updated_at: string; pinned: boolean }[]>([])
  const [voiceConversations, setVoiceConversations] = useState<{ id: string; title: string; updated_at: string; archived_at: string | null; pinned: boolean; storage_path: string | null; mime_type: string; duration_ms: number }[]>([])
  const [openVoiceMenuId, setOpenVoiceMenuId] = useState<string | null>(null)
  const [renamingVoiceId, setRenamingVoiceId] = useState<string | null>(null)
  const [renameVoiceValue, setRenameVoiceValue] = useState('')
  const [voiceBusyId, setVoiceBusyId] = useState<string | null>(null)
  const [voicePlayback, setVoicePlayback] = useState<{ title: string; url: string } | null>(null)
  const [restoringAperonixId, setRestoringAperonixId] = useState<string | null>(null)
  const [openAperonixMenuId, setOpenAperonixMenuId] = useState<string | null>(null)
  const [renamingAperonixId, setRenamingAperonixId] = useState<string | null>(null)
  const [renameAperonixValue, setRenameAperonixValue] = useState('')
  const [savingAperonixId, setSavingAperonixId] = useState<string | null>(null)
  const [unarchiveConfirm, setUnarchiveConfirm] = useState<{ kind: 'user' | 'aperonix' | 'voice'; id: string; title: string } | null>(null)
  const [unarchiveBusy, setUnarchiveBusy] = useState(false)
  const [shareChatText, setShareChatText] = useState<string | null>(null)
  const [wallpaperChatId, setWallpaperChatId] = useState<string | null>(null)
  const [wallpaperValue, setWallpaperValue] = useState<ChatWallpaper | null>(null)
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({})
  // Unlocking resets on every visit/reload - the whole point of the
  // password is that it re-asks each time, not just the first time.
  const [unlocked, setUnlocked] = useState(false)
  const [activeSection, setActiveSection] = useState<'aperonix-chat' | 'users' | 'voice'>('aperonix-chat')

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
      .select('id,title,updated_at,pinned')
      .eq('user_id', user.id)
      .not('archived_at', 'is', null)
      .order('archived_at', { ascending: false })
    if (aperonixError) {
      console.error('Could not load archived Aperonix chats', aperonixError)
    } else {
      setAperonixChats([...(archivedAperonix || [])].sort((a: any, b: any) => Number(b.pinned) - Number(a.pinned) || new Date(b.archived_at || b.updated_at).getTime() - new Date(a.archived_at || a.updated_at).getTime()))
    }

    const { data: archivedVoice, error: voiceError } = await supabase
      .from('aperonix_voice_conversations')
      .select('id,title,updated_at,archived_at,pinned,storage_path,mime_type,duration_ms')
      .eq('user_id', user.id)
      .not('archived_at', 'is', null)
      .order('archived_at', { ascending: false })
    if (voiceError) console.error('Could not load archived voice conversations', voiceError)
    else setVoiceConversations([...(archivedVoice || [])].sort((a: any, b: any) => Number(b.pinned) - Number(a.pinned) || new Date(b.archived_at || b.updated_at).getTime() - new Date(a.archived_at || a.updated_at).getTime()))

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'aperonix_voice_conversations' }, fetchArchivedChats)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user, unlocked, blockedByOthers])

  if (loading || lockLoading) return <PageLoader />
  if (!user) return null

  const getOther = (chat: ChatRow) =>
    chat.participant1_id === user.id ? chat.participant2 : chat.participant1

  const handleUserChatPin = async (chat: ChatRow, nextPinned: boolean) => {
    const current = chat.pinned_by || []
    const next = nextPinned
      ? [...new Set([...current, user.id])]
      : current.filter((id: string) => id !== user.id)
    setChats(prev => prev.map(item => item.id === chat.id ? { ...item, pinned_by: next } : item)
      .sort((a, b) => Number(b.pinned_by?.includes(user.id)) - Number(a.pinned_by?.includes(user.id)) || new Date(b.last_message_time || 0).getTime() - new Date(a.last_message_time || 0).getTime()))
    const { data, error } = await supabase.from('chats').update({ pinned_by: next }).eq('id', chat.id).select('id,pinned_by').single()
    if (error || !data) {
      setChats(prev => prev.map(item => item.id === chat.id ? { ...item, pinned_by: current } : item))
      alert('Could not update this chat pin. Please try again.')
      return
    }
    setChats(prev => prev.map(item => item.id === chat.id ? { ...item, pinned_by: data.pinned_by } : item)
      .sort((a, b) => Number(b.pinned_by?.includes(user.id)) - Number(a.pinned_by?.includes(user.id)) || new Date(b.last_message_time || 0).getTime() - new Date(a.last_message_time || 0).getTime()))
  }

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

      {chats.length === 0 && aperonixChats.length === 0 && voiceConversations.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <p className="font-medium">No archived chats or conversations</p>
          <p className="text-sm mt-1">Items you archive will show up here.</p>
        </div>
      ) : (
        <div className="space-y-4 px-4 py-4">
          {(chats.length > 0 || aperonixChats.length > 0 || voiceConversations.length > 0) && <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1" role="tablist" aria-label="Archived items">
            <button role="tab" aria-selected={activeSection === 'users'} onClick={() => setActiveSection('users')} className={`min-w-0 rounded-lg px-2 py-2.5 text-xs sm:text-sm font-semibold transition-colors ${activeSection === 'users' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>User Chat <span className="ml-1 text-xs opacity-70">{chats.length}</span></button>
            <button role="tab" aria-selected={activeSection === 'aperonix-chat'} onClick={() => setActiveSection('aperonix-chat')} className={`min-w-0 rounded-lg px-2 py-2.5 text-xs sm:text-sm font-semibold transition-colors ${activeSection === 'aperonix-chat' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Aperonix Chat <span className="ml-1 text-xs opacity-70">{aperonixChats.length}</span></button>
            <button role="tab" aria-selected={activeSection === 'voice'} onClick={() => setActiveSection('voice')} className={`min-w-0 rounded-lg px-2 py-2.5 text-xs sm:text-sm font-semibold transition-colors ${activeSection === 'voice' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Aperonix Voice Conversation <span className="ml-1 text-xs opacity-70">{voiceConversations.length}</span></button>
          </div>}
          {activeSection === 'aperonix-chat' && aperonixChats.length > 0 && (
            <section className="border-b border-border">
              {aperonixChats.map(conversation => (
                <div key={conversation.id} role="button" tabIndex={0} onClick={() => router.push(`/aperonix?archive=1&chatId=${conversation.id}`)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); router.push(`/aperonix?archive=1&chatId=${conversation.id}`) } }} className="group flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <button onClick={event => { event.stopPropagation(); router.push(`/aperonix?archive=1&chatId=${conversation.id}`) }} aria-label="Open Aperonix conversation" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><MessageSquare className="h-5 w-5" /></button>
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
                    ) : <button onClick={() => router.push(`/aperonix?archive=1&chatId=${conversation.id}`)} className="block max-w-full truncate text-left text-sm font-medium hover:text-primary">{conversation.title || 'Aperonix conversation'}</button>}
                    <p className="mt-0.5 text-xs text-muted-foreground">Archived {new Date(conversation.updated_at).toLocaleDateString()}</p>
                  </div>
                  <div className="relative shrink-0" onClick={event => event.stopPropagation()}>
                    <button onClick={() => setOpenAperonixMenuId(current => current === conversation.id ? null : conversation.id)} aria-label="Conversation options" aria-expanded={openAperonixMenuId === conversation.id} className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"><MoreVertical className="h-4 w-4" /></button>
                    {openAperonixMenuId === conversation.id && <>
                      <button aria-label="Close conversation menu" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpenAperonixMenuId(null)} />
                      <div className="absolute right-0 top-9 z-40 w-56 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xl">
                        <button disabled={savingAperonixId === conversation.id} onClick={async () => {
                          const nextPinned = !conversation.pinned
                          setSavingAperonixId(conversation.id)
                          setOpenAperonixMenuId(null)
                          const { data, error } = await supabase.from('aperonix_conversations')
                            .update({ pinned: nextPinned })
                            .eq('id', conversation.id).eq('user_id', user.id)
                            .select('id,pinned').single()
                          setSavingAperonixId(null)
                          if (error || !data) { alert('Could not update the pin. Please try again.'); return }
                          setAperonixChats(prev => prev.map(item => item.id === conversation.id ? { ...item, pinned: data.pinned } : item)
                            .sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()))
                        }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm hover:bg-muted disabled:opacity-50"><Pin className="h-3.5 w-3.5" /> {conversation.pinned ? "Unpin" : "Pin"}</button>
                        <button onClick={() => { setRenameAperonixValue(conversation.title); setRenamingAperonixId(conversation.id); setOpenAperonixMenuId(null) }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm hover:bg-muted"><PencilLine className="h-3.5 w-3.5" /> Rename</button>
                        <ChatWallpaperControls conversationId={conversation.id} wallpaper={wallpaperChatId === conversation.id ? wallpaperValue : null} isActive={false} onWallpaperChange={value => { setWallpaperChatId(conversation.id); setWallpaperValue(value) }} />

                        <button disabled={restoringAperonixId === conversation.id} onClick={() => {
                          setOpenAperonixMenuId(null)
                          setUnarchiveConfirm({ kind: 'aperonix', id: conversation.id, title: conversation.title || 'Aperonix conversation' })
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
            {activeSection === 'voice' && voiceConversations.length > 0 && <section className="border-b border-border">
              {voiceConversations.map(conversation => <div key={conversation.id} role="button" tabIndex={0} onClick={() => router.push(`/aperonix/voice?archive=1&conversationId=${conversation.id}`)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); router.push(`/aperonix/voice?archive=1&conversationId=${conversation.id}`) } }} className="group flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <button onClick={event => { event.stopPropagation(); router.push(`/aperonix/voice?archive=1&conversationId=${conversation.id}`) }} aria-label="Open archived voice conversation" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><AudioLines className="h-5 w-5" /></button>
                <div className="min-w-0 flex-1">
                  {renamingVoiceId === conversation.id ? <form className="flex items-center gap-1.5" onSubmit={async event => { event.preventDefault(); const title = renameVoiceValue.trim(); if (!title) return; setVoiceBusyId(conversation.id); const { error } = await supabase.from('aperonix_voice_conversations').update({ title, updated_at: new Date().toISOString() }).eq('id', conversation.id).eq('user_id', user.id); setVoiceBusyId(null); if (error) { alert('Could not rename this conversation.'); return }; setVoiceConversations(prev => prev.map(item => item.id === conversation.id ? { ...item, title } : item)); setRenamingVoiceId(null) }}>
                    <input autoFocus value={renameVoiceValue} onChange={event => setRenameVoiceValue(event.target.value)} maxLength={80} className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1 text-sm outline-none" aria-label="Conversation title" />
                    <button type="submit" disabled={voiceBusyId === conversation.id} aria-label="Save title" className="rounded-lg p-1.5 text-primary hover:bg-accent"><Check className="h-4 w-4" /></button><button type="button" onClick={() => setRenamingVoiceId(null)} aria-label="Cancel rename" className="rounded-lg p-1.5 hover:bg-accent"><X className="h-4 w-4" /></button>
                  </form> : <button onClick={() => router.push(`/aperonix/voice?archive=1&conversationId=${conversation.id}`)} className="block max-w-full truncate text-left text-sm font-medium hover:text-primary">{conversation.title || 'Voice conversation'}</button>}
                  <p className="mt-0.5 text-xs text-muted-foreground">Archived {new Date(conversation.archived_at || conversation.updated_at).toLocaleDateString()}</p>
                </div>
                <div className="relative shrink-0" onClick={event => event.stopPropagation()}>
                  <button onClick={() => setOpenVoiceMenuId(current => current === conversation.id ? null : conversation.id)} aria-label="Voice conversation options" aria-expanded={openVoiceMenuId === conversation.id} className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"><MoreVertical className="h-4 w-4" /></button>
                  {openVoiceMenuId === conversation.id && <><button aria-label="Close voice conversation menu" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpenVoiceMenuId(null)} /><div className="absolute right-0 top-9 z-40 w-60 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xl">
                    <button disabled={voiceBusyId === conversation.id} onClick={async () => { const nextPinned = !conversation.pinned; setVoiceBusyId(conversation.id); setOpenVoiceMenuId(null); const { data, error } = await supabase.from('aperonix_voice_conversations').update({ pinned: nextPinned }).eq('id', conversation.id).eq('user_id', user.id).select('id,pinned').single(); setVoiceBusyId(null); if (error || !data) { alert('Could not update pin. Please try again.'); return }; setVoiceConversations(prev => prev.map(item => item.id === conversation.id ? { ...item, pinned: data.pinned } : item).sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.archived_at || b.updated_at).getTime() - new Date(a.archived_at || a.updated_at).getTime())) }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm hover:bg-muted disabled:opacity-50"><Pin className="h-3.5 w-3.5" />{conversation.pinned ? 'Unpin conversation' : 'Pin to top'}</button>
                    <button onClick={() => { setRenameVoiceValue(conversation.title); setRenamingVoiceId(conversation.id); setOpenVoiceMenuId(null) }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm hover:bg-muted"><PencilLine className="h-3.5 w-3.5" />Rename</button>
                    <ChatWallpaperControls conversationId={conversation.id} wallpaper={null} isActive={false} onWallpaperChange={() => {}} tableName="aperonix_voice_wallpapers" wallpaperLabel="voice conversation" />
                    <button disabled={voiceBusyId === conversation.id} onClick={async () => { setOpenVoiceMenuId(null); if (!window.confirm(`Create a copy of “${conversation.title}”?`)) return; setVoiceBusyId(conversation.id); const { data: { user: currentUser } } = await supabase.auth.getUser(); if (!currentUser) { setVoiceBusyId(null); return }; let copiedPath: string | null = null; if (conversation.storage_path) { copiedPath = currentUser.id + '/' + crypto.randomUUID() + '/recording-copy-' + Date.now() + '.' + (conversation.storage_path.split('.').pop() || 'webm'); const { error: copyError } = await supabase.storage.from('aperonix-voice-recordings').copy(conversation.storage_path, copiedPath); if (copyError) { setVoiceBusyId(null); alert('Could not copy the recording.'); return } }; const { data, error } = await supabase.from('aperonix_voice_conversations').insert({ user_id: currentUser.id, title: conversation.title + ' (copy)', storage_path: copiedPath, mime_type: conversation.mime_type, duration_ms: conversation.duration_ms, pinned: false, archived_at: new Date().toISOString() }).select('id,title,updated_at,archived_at,pinned,storage_path,mime_type,duration_ms').single(); setVoiceBusyId(null); if (error || !data) { if (copiedPath) await supabase.storage.from('aperonix-voice-recordings').remove([copiedPath]); alert('Could not duplicate conversation.'); return }; setVoiceConversations(prev => [data, ...prev]) }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm hover:bg-muted disabled:opacity-50"><Copy className="h-3.5 w-3.5" />Duplicate</button>
                    <button disabled={!conversation.storage_path} onClick={async () => { setOpenVoiceMenuId(null); const { data, error } = await supabase.storage.from('aperonix-voice-recordings').createSignedUrl(conversation.storage_path!, 600); if (error || !data?.signedUrl) { alert('Could not play this recording.'); return }; setVoicePlayback({ title: conversation.title, url: data.signedUrl }) }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm hover:bg-muted disabled:opacity-50"><Play className="h-3.5 w-3.5" />Play recording</button>
                    <button disabled={voiceBusyId === conversation.id} onClick={() => { setOpenVoiceMenuId(null); setUnarchiveConfirm({ kind: 'voice', id: conversation.id, title: conversation.title || 'Voice conversation' }) }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm hover:bg-muted disabled:opacity-50"><ArchiveRestore className="h-3.5 w-3.5" />Unarchive conversation</button>
                    <button disabled={voiceBusyId === conversation.id} onClick={async () => { setOpenVoiceMenuId(null); if (!window.confirm(`Permanently delete “${conversation.title}” and its recording? This cannot be undone.`)) return; setVoiceBusyId(conversation.id); const { error: removeError } = await supabase.from('aperonix_voice_conversations').delete().eq('id', conversation.id).eq('user_id', user.id); if (removeError) { setVoiceBusyId(null); alert('Could not delete conversation.'); return }; if (conversation.storage_path) { const { error: storageError } = await supabase.storage.from('aperonix-voice-recordings').remove([conversation.storage_path]); if (storageError) console.error('Could not remove archived voice recording', storageError) }; setVoiceBusyId(null); setVoiceConversations(prev => prev.filter(item => item.id !== conversation.id)) }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-red-500 hover:bg-red-500/10"><Trash2 className="h-3.5 w-3.5" />Delete</button>
                  </div></>}
                </div>
              </div>)}
            </section>}
          {voicePlayback && <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/65 p-4" onClick={() => setVoicePlayback(null)}><div role="dialog" aria-modal="true" aria-label="Play archived voice conversation" className="w-full max-w-lg rounded-2xl border border-border bg-background p-5 shadow-2xl" onClick={event => event.stopPropagation()}><div className="mb-5 flex items-center justify-between gap-3"><div><h3 className="font-semibold">{voicePlayback.title}</h3><p className="mt-1 text-xs text-muted-foreground">Full saved conversation audio</p></div><button onClick={() => setVoicePlayback(null)} aria-label="Close player" className="rounded-full p-2 hover:bg-accent"><X className="h-4 w-4" /></button></div><audio controls autoPlay src={voicePlayback.url} className="w-full" /></div></div>}
          {activeSection === 'users' && chats.length > 0 && <div className="space-y-1">
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
                onArchive={() => setUnarchiveConfirm({ kind: 'user', id: chat.id, title: other?.username ? 'Chat with ' + other.username : 'User chat' })}
                onPin={nextPinned => void handleUserChatPin(chat, nextPinned)}
              />
            )
          })}
          </div>}
        </div>
      )}
      {unarchiveConfirm && <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/60 p-4" onClick={() => { if (!unarchiveBusy) setUnarchiveConfirm(null) }}>
        <div role="dialog" aria-modal="true" aria-labelledby="unarchive-dialog-title" className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-2xl" onClick={event => event.stopPropagation()}>
          <div className="p-5 sm:p-6">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ArchiveRestore className="h-6 w-6" /></div>
            <h2 id="unarchive-dialog-title" className="text-lg font-semibold">Unarchive this {unarchiveConfirm.kind === "voice" ? "voice conversation" : "chat"}?</h2>
            <p className="mt-2 break-words text-sm text-muted-foreground">“{unarchiveConfirm.title}” will be moved out of Archive and back to your conversations. You can archive it again anytime.</p>
          </div>
          <div className="flex flex-col-reverse gap-2 border-t border-border bg-muted/30 p-4 sm:flex-row sm:justify-end">
            <button disabled={unarchiveBusy} onClick={() => setUnarchiveConfirm(null)} className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-accent disabled:opacity-50">Cancel</button>
            <button disabled={unarchiveBusy} onClick={async () => {
              if (!unarchiveConfirm) return
              setUnarchiveBusy(true)
              let error: { message: string } | null = null
              if (unarchiveConfirm.kind === "user") {
                const chat = chats.find(item => item.id === unarchiveConfirm.id)
                const archivedBy = (chat?.archived_by || []).filter((id: string) => id !== user.id)
                const result = await supabase.from("chats").update({ archived_by: archivedBy }).eq("id", unarchiveConfirm.id)
                error = result.error
                if (!error) setChats(prev => prev.filter(item => item.id !== unarchiveConfirm.id))
              } else if (unarchiveConfirm.kind === "aperonix") {
                const result = await supabase.from("aperonix_conversations").update({ archived_at: null, updated_at: new Date().toISOString() }).eq("id", unarchiveConfirm.id).eq("user_id", user.id)
                error = result.error
                if (!error) setAperonixChats(prev => prev.filter(item => item.id !== unarchiveConfirm.id))
              } else {
                const result = await supabase.from("aperonix_voice_conversations").update({ archived_at: null, updated_at: new Date().toISOString() }).eq("id", unarchiveConfirm.id).eq("user_id", user.id)
                error = result.error
                if (!error) setVoiceConversations(prev => prev.filter(item => item.id !== unarchiveConfirm.id))
              }
              setUnarchiveBusy(false)
              if (error) { alert("Could not unarchive this item. Please try again."); return }
              setUnarchiveConfirm(null)
            }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50">
              {unarchiveBusy ? "Unarchiving…" : <><ArchiveRestore className="h-4 w-4" /> Unarchive</>}
            </button>
          </div>
        </div>
      </div>}
      {shareChatText !== null && <AperonixShareModal replyText={shareChatText} contentType="chat" onClose={() => setShareChatText(null)} />}
    </div>
  )
}
