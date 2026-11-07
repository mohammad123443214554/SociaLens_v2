'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/hooks/useUser'
import { useArchiveLockStatus } from '@/lib/hooks/useChatSettings'
import { VolumeSettingsPage } from '@/components/chat/VolumeSettingsPage'
import { RingtoneSettingsPage } from '@/components/chat/RingtoneSettingsPage'
import { PageLoader } from '@/components/shared/LoadingSpinner'
import { ArchiveUnlockScreen } from '@/components/chat/ArchiveUnlockScreen'
import { ArchivePasswordWizard } from '@/components/chat/ArchivePasswordWizard'

export function CallSettingsSubpage({ page }: { page: 'volume' | 'ringtone' }) {
  const params = useParams()
  const chatId = params.chatId as string
  const router = useRouter()
  const { user, loading } = useUser()
  const supabase = useMemo(() => createClient(), [])
  const [chat, setChat] = useState<{ archived_by: string[] | null } | null>(null)
  const [archiveUnlocked, setArchiveUnlocked] = useState(false)
  const { data: archiveLock } = useArchiveLockStatus(user?.id)

  useEffect(() => {
    if (!chatId || !user?.id) return
    let cancelled = false
    void supabase.from('chats').select('id, archived_by').eq('id', chatId).single().then(({ data, error }) => {
      if (cancelled) return
      if (error || !data) { router.replace('/chat'); return }
      setChat(data)
    })
    return () => { cancelled = true }
  }, [chatId, user?.id, router, supabase])

  if (loading || !user || !chat) return <PageLoader />
  const isArchivedByMe = Array.isArray(chat.archived_by) && chat.archived_by.includes(user.id)
  if (isArchivedByMe && !archiveUnlocked) {
    if (archiveLock && !archiveLock.hasPassword) return <ArchivePasswordWizard onClose={() => router.push('/chat')} onDone={() => setArchiveUnlocked(true)} />
    if (archiveLock) return <ArchiveUnlockScreen hint={archiveLock.hint} lockType={archiveLock.lockType} onUnlock={() => setArchiveUnlocked(true)} title="Chat is locked" />
    return <PageLoader />
  }

  const onBack = () => router.replace(`/chat/${chatId}/settings/call`)
  return (
    <div className="min-h-[100dvh] w-full bg-background">
      {page === 'volume'
        ? <VolumeSettingsPage userId={user.id} onBack={onBack} />
        : <RingtoneSettingsPage userId={user.id} onBack={onBack} />}
    </div>
  )
}
