'use client'

import { useEffect, useMemo, useState } from 'react'
import { Ban, ShieldCheck } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/hooks/useUser'
import {
  useBlockStatus, useToggleBlock, useNickname, useSetNickname, useDeleteNickname,
  useChatWallpaper, useDeleteChatWallpaper, useDeleteChatForMe, useArchiveLockStatus,
} from '@/lib/hooks/useChatSettings'
import { ChatSettingsPage } from '@/components/chat/ChatSettingsPage'
import { NicknameModal } from '@/components/chat/NicknameModal'
import { PageLoader } from '@/components/shared/LoadingSpinner'
import { ArchiveUnlockScreen } from '@/components/chat/ArchiveUnlockScreen'
import { ArchivePasswordWizard } from '@/components/chat/ArchivePasswordWizard'

export default function ChatSettingsRoutePage() {
  const params = useParams()
  const chatId = params.chatId as string
  const router = useRouter()
  const { user, loading } = useUser()
  const supabase = useMemo(() => createClient(), [])
  const [chat, setChat] = useState<any>(null)
  const [showNickname, setShowNickname] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDeleteChat, setConfirmDeleteChat] = useState(false)
  const [confirmBlockAction, setConfirmBlockAction] = useState(false)
  const [confirmRemoveWallpaper, setConfirmRemoveWallpaper] = useState(false)
  const [removingWallpaper, setRemovingWallpaper] = useState(false)
  const [archiveUnlocked, setArchiveUnlocked] = useState(false)
  const { data: wallpaper } = useChatWallpaper(chatId, user?.id)
  const { data: nickname } = useNickname(chatId, user?.id)
  const { data: blockStatus } = useBlockStatus(user?.id, chat?.other?.id)
  const setNickname = useSetNickname()
  const deleteNickname = useDeleteNickname()
  const toggleBlock = useToggleBlock()
  const deleteChat = useDeleteChatForMe()
  const deleteWallpaper = useDeleteChatWallpaper()
  const { data: archiveLock } = useArchiveLockStatus(user?.id)

  useEffect(() => {
    if (!chatId) return
    let cancelled = false
    void supabase
      .from('chats')
      .select('id, participant1_id, participant2_id, archived_by, participant1:profiles!chats_participant1_id_fkey(id, username), participant2:profiles!chats_participant2_id_fkey(id, username)')
      .eq('id', chatId)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data) {
          router.replace('/chat')
          return
        }
        setChat(data)
      })
    return () => { cancelled = true }
  }, [chatId, router, supabase])

  if (loading || !user || !chat) return <PageLoader />

  const other = chat.participant1_id === user.id ? chat.participant2 : chat.participant1
  if (!other?.id) return <PageLoader />

  // Preserve the same archive-password gate as the conversation route. A
  // dedicated settings URL must not become a way to bypass an archived chat's
  // lock after a refresh or by pasting the settings URL directly.
  const isArchivedByMe = Array.isArray(chat.archived_by) && chat.archived_by.includes(user.id)
  if (isArchivedByMe && !archiveUnlocked) {
    if (archiveLock && !archiveLock.hasPassword) {
      return <ArchivePasswordWizard onClose={() => router.push('/chat')} onDone={() => setArchiveUnlocked(true)} />
    }
    if (archiveLock) {
      return <ArchiveUnlockScreen hint={archiveLock.hint} lockType={archiveLock.lockType} onUnlock={() => setArchiveUnlocked(true)} title="Chat is locked" />
    }
    return <PageLoader />
  }

  const iBlockedThem = !!blockStatus?.iBlockedThem
  const theyBlockedMe = !!blockStatus?.theyBlockedMe

  const handleToggleBlock = () => {
    if (toggleBlock.isPending) return
    setConfirmBlockAction(true)
  }

  const confirmToggleBlock = async () => {
    if (toggleBlock.isPending) return
    try {
      await toggleBlock.mutateAsync({ blockerId: user.id, blockedId: other.id, block: !iBlockedThem })
      setConfirmBlockAction(false)
    } catch (error) {
      console.error('Could not update block status:', error)
    }
  }

  const handleDeleteChat = () => {
    if (!deleting) setConfirmDeleteChat(true)
  }

  const confirmDeleteAllChat = async () => {
    if (deleting) return
    setDeleting(true)
    try {
      await deleteChat.mutateAsync({ chatId, userId: user.id })
      router.replace('/chat')
    } catch (error) {
      console.error(error)
      setDeleting(false)
    }
  }

  const handleRemoveWallpaper = async () => {
    if (removingWallpaper) return
    setRemovingWallpaper(true)
    try {
      await deleteWallpaper.mutateAsync({ chatId, userId: user.id })
      setConfirmRemoveWallpaper(false)
    } catch (error) {
      console.error(error)
      window.alert('Could not remove wallpaper. Please try again.')
    } finally {
      setRemovingWallpaper(false)
    }
  }

  const handleSaveNickname = async (value: string) => {
    await setNickname.mutateAsync({ chatId, setById: user.id, targetId: other.id, nickname: value })
    setShowNickname(false)
  }
  const handleDeleteNickname = async () => {
    await deleteNickname.mutateAsync({ chatId, setById: user.id })
    setShowNickname(false)
  }

  return (
    <div className="relative min-h-[100dvh] bg-background">
      <ChatSettingsPage
        otherUsername={other.username}
        myNicknameForThem={nickname || null}
        hasWallpaper={!!wallpaper}
        iBlockedThem={iBlockedThem}
        deleting={deleting}
        showNicknameOption={!theyBlockedMe}
        onBack={() => router.replace(`/chat/${chatId}`)}
        onSetNickname={() => setShowNickname(true)}
        onSetWallpaper={() => router.push(`/chat/${chatId}/settings/wallpaper`)}
        onEditWallpaper={() => router.push(`/chat/${chatId}/settings/wallpaper?edit=1`)}
        onRemoveWallpaper={() => setConfirmRemoveWallpaper(true)}
        onToggleBlock={handleToggleBlock}
        onDeleteChat={handleDeleteChat}
        onOpenCallSettings={() => router.push(`/chat/${chatId}/settings/call`)}
      />
      {confirmBlockAction && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !toggleBlock.isPending) setConfirmBlockAction(false)
          }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="block-chat-title"
            aria-describedby="block-chat-description"
            className="w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
          >
            <div className="h-1 w-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-violet-500" />
            <div className="p-5">
              <div className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full ${iBlockedThem ? 'bg-emerald-500/10 text-emerald-500' : 'bg-destructive/10 text-destructive'}`}>
                {iBlockedThem ? <ShieldCheck className="h-6 w-6" /> : <Ban className="h-6 w-6" />}
              </div>
              <h2 id="block-chat-title" className="text-center text-lg font-semibold">
                {iBlockedThem ? `Unblock ${other.username}?` : `Block ${other.username}?`}
              </h2>
              <p id="block-chat-description" className="mt-2 text-center text-sm leading-relaxed text-muted-foreground">
                {iBlockedThem
                  ? 'This person will be able to message you and see your profile again, subject to your privacy settings.'
                  : "They won't be able to message you, and your profile will be hidden from them here. You can unblock them anytime."}
              </p>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  disabled={toggleBlock.isPending}
                  onClick={() => setConfirmBlockAction(false)}
                  className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={toggleBlock.isPending}
                  onClick={confirmToggleBlock}
                  className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 ${iBlockedThem ? 'bg-emerald-600' : 'bg-destructive'}`}
                >
                  {toggleBlock.isPending ? 'Please wait…' : iBlockedThem ? 'Unblock' : 'Block'}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
      {confirmDeleteChat && (
        <div
          className="fixed inset-0 z-[190] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deleting) setConfirmDeleteChat(false)
          }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-chat-title"
            aria-describedby="delete-chat-description"
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl"
          >
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <span className="text-xl">!</span>
            </div>
            <h2 id="delete-chat-title" className="text-center text-lg font-semibold">Delete all chat?</h2>
            <p id="delete-chat-description" className="mt-2 text-center text-sm text-muted-foreground">
              This conversation will be removed from your inbox. The other participant's chat will not be deleted.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirmDeleteChat(false)}
                className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={confirmDeleteAllChat}
                className="flex-1 rounded-xl bg-destructive px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete all chat'}
              </button>
            </div>
          </section>
        </div>
      )}
      {confirmRemoveWallpaper && (
        <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !removingWallpaper) setConfirmRemoveWallpaper(false) }}>
          <section role="alertdialog" aria-modal="true" aria-labelledby="remove-wallpaper-title" aria-describedby="remove-wallpaper-description" className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive"><span className="text-xl">⌫</span></div>
            <h2 id="remove-wallpaper-title" className="text-center text-lg font-semibold">Remove wallpaper?</h2>
            <p id="remove-wallpaper-description" className="mt-2 text-center text-sm text-muted-foreground">This will remove your custom wallpaper from this conversation. You can set another one anytime.</p>
            <div className="mt-5 flex gap-3">
              <button type="button" disabled={removingWallpaper} onClick={() => setConfirmRemoveWallpaper(false)} className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-50">Cancel</button>
              <button type="button" disabled={removingWallpaper} onClick={handleRemoveWallpaper} className="flex-1 rounded-xl bg-destructive px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">{removingWallpaper ? 'Removing…' : 'Remove wallpaper'}</button>
            </div>
          </section>
        </div>
      )}
      {showNickname && (
        <NicknameModal
          currentNickname={nickname || null}
          targetUsername={other.username}
          onSave={handleSaveNickname}
          onDelete={handleDeleteNickname}
          onClose={() => setShowNickname(false)}
          saving={setNickname.isPending}
          deleting={deleteNickname.isPending}
        />
      )}
    </div>
  )
}
