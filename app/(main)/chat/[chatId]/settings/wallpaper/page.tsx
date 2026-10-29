'use client'

import { useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { WallpaperModal } from '@/components/chat/WallpaperModal'
import { PageLoader } from '@/components/shared/LoadingSpinner'
import { useUser } from '@/lib/hooks/useUser'
import { useSetChatWallpaper } from '@/lib/hooks/useChatSettings'
import { createClient } from '@/lib/supabase/client'

export default function ChatWallpaperRoutePage() {
  const params = useParams()
  const chatId = params.chatId as string
  const router = useRouter()
  const { user, loading } = useUser()
  const supabase = useMemo(() => createClient(), [])
  const setChatWallpaper = useSetChatWallpaper()
  const [saving, setSaving] = useState(false)

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
      router.replace(`/chat/${chatId}/settings`)
    } catch (error) {
      console.error(error)
      window.alert('Could not set wallpaper. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !user) return <PageLoader />

  return (
    <div className="fixed inset-0 z-[140] bg-background">
      <WallpaperModal
        onDone={handleSave}
        onClose={() => router.replace(`/chat/${chatId}/settings`)}
        saving={saving}
      />
    </div>
  )
}
