'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { WallpaperModal } from '@/components/chat/WallpaperModal'
import { ArrowLeft, Image as ImageIcon, PencilLine, ImageOff, ChevronRight } from 'lucide-react'
import { PageLoader } from '@/components/shared/LoadingSpinner'
import { useUser } from '@/lib/hooks/useUser'
import { useSetChatWallpaper, useDeleteChatWallpaper, useArchiveLockStatus, useChatWallpaper } from '@/lib/hooks/useChatSettings'
import { createClient } from '@/lib/supabase/client'
import { ArchiveUnlockScreen } from '@/components/chat/ArchiveUnlockScreen'
import { ArchivePasswordWizard } from '@/components/chat/ArchivePasswordWizard'

export default function ChatWallpaperRoutePage() {
  const params = useParams()
  const chatId = params.chatId as string
  const router = useRouter()
  const searchParams = useSearchParams()
  const mode = searchParams.get('mode')
  const editExisting = mode === 'edit'
  const { user, loading } = useUser()
  const supabase = useMemo(() => createClient(), [])
  const setChatWallpaper = useSetChatWallpaper()
  const deleteChatWallpaper = useDeleteChatWallpaper()
  const [saving, setSaving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [chat, setChat] = useState<any>(null)
  const [archiveUnlocked, setArchiveUnlocked] = useState(false)
  const { data: archiveLock } = useArchiveLockStatus(user?.id)
  const { data: currentWallpaper } = useChatWallpaper(chatId, user?.id)

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
      router.replace(`/chat/${chatId}`)
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

  const handleRemoveWallpaper = async () => {
    if (!user?.id || saving) return
    setSaving(true)
    try {
      await deleteChatWallpaper.mutateAsync({ chatId, userId: user.id })
      router.replace(`/chat/${chatId}`)
    } catch (error) {
      console.error(error)
      window.alert('Could not remove wallpaper. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const showEditor = mode === 'set' || mode === 'change' || mode === 'edit'
  if (!showEditor) {
    return (
      <div className="min-h-[100dvh] w-full flex flex-col bg-background">
        <header className="flex items-center gap-3 border-b border-border px-4 py-3">
          <button type="button" onClick={() => router.replace("/chat/" + chatId + "/settings")} className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/70 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-pink-500/40 hover:text-pink-400 sm:px-3 sm:py-2 sm:text-sm"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>
          <h1 className="text-base font-bold">Wallpaper settings</h1>
        </header>
        <main className="mx-auto w-full max-w-xl flex-1 space-y-3 p-4">
          <div className="overflow-hidden rounded-2xl border border-border bg-card divide-y divide-border">
            <button type="button" onClick={() => router.push(`/chat/${chatId}/settings/wallpaper?mode=${currentWallpaper?.wallpaper_url ? 'change' : 'set'}`)} className="flex w-full items-center justify-between px-4 py-3.5 text-left hover:bg-muted/60">
              <span className="flex items-center gap-3"><ImageIcon className="h-5 w-5 text-muted-foreground" /><span className="text-sm font-medium">{currentWallpaper?.wallpaper_url ? "Change Wallpaper" : "Set Wallpaper"}</span></span><ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
            {currentWallpaper?.wallpaper_url && <button type="button" onClick={() => router.push(`/chat/${chatId}/settings/wallpaper?mode=edit`)} className="flex w-full items-center justify-between px-4 py-3.5 text-left hover:bg-muted/60"><span className="flex items-center gap-3"><PencilLine className="h-5 w-5 text-muted-foreground" /><span className="text-sm font-medium">Edit Wallpaper</span></span><ChevronRight className="h-4 w-4 text-muted-foreground" /></button>}
            {currentWallpaper?.wallpaper_url && <button type="button" disabled={saving} onClick={() => setConfirmRemove(true)} className="flex w-full items-center justify-between px-4 py-3.5 text-left hover:bg-muted/60 disabled:opacity-50"><span className="flex items-center gap-3"><ImageOff className="h-4 w-4 text-muted-foreground" /><span className="text-sm font-medium">{saving ? "Removing…" : "Remove Wallpaper"}</span></span><ChevronRight className="h-4 w-4" /></button>}
          </div>
        </main>
        {confirmRemove && (
          <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setConfirmRemove(false) }}>
            <section role="alertdialog" aria-modal="true" aria-labelledby="remove-wallpaper-title" aria-describedby="remove-wallpaper-description" className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive"><ImageOff className="h-6 w-6" /></div>
              <h2 id="remove-wallpaper-title" className="text-center text-lg font-semibold">Remove wallpaper?</h2>
              <p id="remove-wallpaper-description" className="mt-2 text-center text-sm text-muted-foreground">Your chat will return to its default background. You can set a new wallpaper anytime.</p>
              <div className="mt-5 flex gap-3">
                <button type="button" disabled={saving} onClick={() => setConfirmRemove(false)} className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-50">Cancel</button>
                <button type="button" disabled={saving} onClick={() => void handleRemoveWallpaper()} className="flex-1 rounded-xl bg-destructive px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">{saving ? 'Removing…' : 'Remove wallpaper'}</button>
              </div>
            </section>
          </div>
        )}
      </div>
    )
  }

  return (
    <WallpaperModal
        onDone={handleSave}
        initialImageUrl={editExisting ? currentWallpaper?.wallpaper_url : undefined}
        initialPosition={editExisting ? { x: currentWallpaper?.position_x ?? 50, y: currentWallpaper?.position_y ?? 50 } : undefined}
        saveLabel={editExisting ? 'Save changes' : 'Apply wallpaper'}
        onClose={() => router.replace(`/chat/${chatId}/settings`)}
        saving={saving}
  />
  )
}
