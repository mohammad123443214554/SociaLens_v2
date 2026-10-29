'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { WallpaperModal } from '@/components/chat/WallpaperModal'
import { PageLoader } from '@/components/shared/LoadingSpinner'
import { useUser } from '@/lib/hooks/useUser'
import { useSetChatWallpaper, useArchiveLockStatus, useChatWallpaper } from '@/lib/hooks/useChatSettings'
import { createClient } from '@/lib/supabase/client'
import { ArchiveUnlockScreen } from '@/components/chat/ArchiveUnlockScreen'
import { ArchivePasswordWizard } from '@/components/chat/ArchivePasswordWizard'

export default function ChatWallpaperRoutePage() {
  const params = useParams()
  const chatId = params.chatId as string
  const router = useRouter()
  const { user, loading } = useUser()
  const supabase = useMemo(() => createClient(), [])
  const setChatWallpaper = useSetChatWallpaper()
  const [saving, setSaving] = useState(false)
  const [chat, setChat] = useState<any>(null)
  const [archiveUnlocked, setArchiveUnlocked] = useState(false)
  const { data: archiveLock } = useArchiveLockStatus(user?.id)
  const { data: currentWallpaper } = useChatWallpaper(chatId, user?.id)
  const editExisting = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('edit') === '1'

  useEffect(() => {
    if (!chatId || !user?.id) return
    let cancelled = false
    void supabase
      .from('chats')
      .select('id, archived_by')
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
  }, [chatId, user?.id, router, supabase])

  const handleSave = async (file: File, position: { x: number; y: number }) => {
    if (!user?.id || saving) return
    setSaving(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${user.id}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('chat-wallpapers').upload(path, file, {
        cacheControl: '31536000',
      })
      if (uploadError) throw new Error(uploadError.message || 'Upload failed')
      const { data: urlData } = supabase.storage.from('chat-wallpapers').getPublicUrl(path)
      await setChatWallpaper.mutateAsync({
        chatId,
        userId: user.id,
        wallpaperUrl: urlData.publicUrl,
        positionX: Math.round(position.x),
        positionY: Math.round(position.y),
      })
      window.sessionStorage.removeItem(`socia-lens-wallpaper-draft:${window.location.pathname}`)
      router.replace(`/chat/${chatId}/settings`)
    } catch (error) {
      console.error(error)
      window.alert('Could not set wallpaper. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !user || !chat || (editExisting && currentWallpaper === undefined)) return <PageLoader />

  // Keep the archive lock effective even when the wallpaper URL is opened
  // directly or refreshed instead of coming from the conversation page.
  const isArchivedByMe = Array.isArray(chat.archived_by) && chat.archived_by.includes(user.id)
  if (isArchivedByMe && !archiveUnlocked) {
    if (archiveLock && !archiveLock.hasPassword) {
      return <ArchivePasswordWizard onClose={() => router.push('/chat')} onDone={() => setArchiveUnlocked(true)} />
    }
    if (archiveLock) {
      return <ArchiveUnlockScreen hint={archiveLock.hint} onUnlock={() => setArchiveUnlocked(true)} title="Chat is locked" />
    }
    return <PageLoader />
  }

  return (
    <div className="fixed inset-0 z-[140] bg-background">
      <WallpaperModal
        onDone={handleSave}
        initialImageUrl={editExisting ? currentWallpaper?.wallpaper_url : undefined}
        initialPosition={editExisting ? { x: currentWallpaper?.position_x ?? 50, y: currentWallpaper?.position_y ?? 50 } : undefined}
        saveLabel={editExisting ? 'Save changes' : 'Apply wallpaper'}
        onClose={() => router.replace(`/chat/${chatId}/settings`)}
        saving={saving}
      />
    </div>
  )
}
