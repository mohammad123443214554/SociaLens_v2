'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/hooks/useUser'
import {
  useBlockStatus, useToggleBlock, useNickname, useSetNickname, useDeleteNickname,
  useChatWallpaper, useDeleteChatWallpaper, useDeleteChatForMe,
} from '@/lib/hooks/useChatSettings'
import { ChatSettingsPage } from '@/components/chat/ChatSettingsPage'
import { NicknameModal } from '@/components/chat/NicknameModal'
import { CallSettingsPage } from '@/components/chat/CallSettingsPage'
import { PageLoader } from '@/components/shared/LoadingSpinner'

export default function ChatSettingsRoutePage() {
  const params = useParams()
  const chatId = params.chatId as string
  const router = useRouter()
  const { user, loading } = useUser()
  const supabase = useMemo(() => createClient(), [])
  const [chat, setChat] = useState<any>(null)
  const [showNickname, setShowNickname] = useState(false)
  const [showCallSettings, setShowCallSettings] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const { data: wallpaper } = useChatWallpaper(chatId, user?.id)
  const { data: nickname } = useNickname(chatId, user?.id)
  const { data: blockStatus } = useBlockStatus(user?.id, chat?.other?.id)
  const setNickname = useSetNickname()
  const deleteNickname = useDeleteNickname()
  const toggleBlock = useToggleBlock()
  const deleteChat = useDeleteChatForMe()
  const deleteWallpaper = useDeleteChatWallpaper()

  useEffect(() => {
    if (!chatId || !user?.id) return
    let cancelled = false
    void supabase
      .from('chats')
      .select('*, participant1:profiles!chats_participant1_id_fkey(*), participant2:profiles!chats_participant2_id_fkey(*)')
      .eq('id', chatId)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data) {
          router.replace('/chat')
          return
        }
        const other = data.participant1_id === user.id ? data.participant2 : data.participant1
        setChat({ ...data, other })
      })
    return () => { cancelled = true }
  }, [chatId, user?.id, router, supabase])

  if (loading || !user || !chat) return <PageLoader />

  const other = chat.other
  const iBlockedThem = !!blockStatus?.iBlockedThem
  const theyBlockedMe = !!blockStatus?.theyBlockedMe

  const handleToggleBlock = () => {
    const block = !iBlockedThem
    if (block && !window.confirm(`Block ${other.username}? They won't be able to message you, and your profile will be hidden from them here.`)) return
    toggleBlock.mutate({ blockerId: user.id, blockedId: other.id, block })
  }

  const handleDeleteChat = async () => {
    if (!window.confirm('Delete this conversation? It will be removed from your inbox.')) return
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
    try {
      await deleteWallpaper.mutateAsync({ chatId, userId: user.id })
    } catch (error) {
      console.error(error)
      window.alert('Could not remove wallpaper. Please try again.')
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
    <div className="relative min-h-[calc(100dvh-4rem)] bg-background">
      <ChatSettingsPage
        otherUsername={other.username}
        myNicknameForThem={nickname || null}
        hasWallpaper={!!wallpaper}
        iBlockedThem={iBlockedThem}
        deleting={deleting}
        showNicknameOption={!theyBlockedMe}
        onBack={() => router.push(`/chat/${chatId}`)}
        onSetNickname={() => setShowNickname(true)}
        onSetWallpaper={() => router.push(`/chat/${chatId}/settings/wallpaper`)}
        onRemoveWallpaper={handleRemoveWallpaper}
        onToggleBlock={handleToggleBlock}
        onDeleteChat={handleDeleteChat}
        onOpenCallSettings={() => setShowCallSettings(true)}
      />
      {showCallSettings && (
        <CallSettingsPage userId={user.id} onBack={() => setShowCallSettings(false)} />
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
