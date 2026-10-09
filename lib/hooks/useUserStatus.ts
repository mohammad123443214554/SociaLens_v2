'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/hooks/useUser'
import { usePresence } from '@/lib/contexts/PresenceContext'
import { canAccessByPrivacy } from '@/lib/utils/privacyAccess'

export function useUserStatus(targetUserId: string | undefined | null, chatId?: string): 'online' | 'active' | null {
  const { user } = useUser()
  const { activeUserIds } = usePresence()
  const [allowed, setAllowed] = useState(true)
  const [onlineInChat, setOnlineInChat] = useState(false)

  // Status Privacy check - fetched once per (viewer, target) pair.
  useEffect(() => {
    if (!targetUserId || !user || targetUserId === user.id) { setAllowed(true); return }
    let cancelled = false
    const supabase = createClient()
    ;(async () => {
      const { data: profile } = await supabase.from('profiles').select('status_privacy').eq('id', targetUserId).maybeSingle()
      const ok = await canAccessByPrivacy(supabase, user.id, targetUserId, (profile as any)?.status_privacy, 'status')
      if (!cancelled) setAllowed(ok)
    })()
    return () => { cancelled = true }
  }, [targetUserId, user?.id])

  // If a chatId is given, additionally watch that specific conversation's
  // presence channel for "is the target currently on this chat page" -
  // That's what upgrades the dot from blue (Active) to green (Online).
  useEffect(() => {
    if (!chatId || !targetUserId) { setOnlineInChat(false); return }
    const supabase = createClient()
    const channel = supabase.channel(`chat:${chatId}`)
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ userId: string }>()
        const ids = Object.values(state).flat().map((p) => p.userId)
        setOnlineInChat(ids.includes(targetUserId))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [chatId, targetUserId])

  if (!targetUserId || !allowed) return null
  if (onlineInChat) return 'online'
  if (activeUserIds.has(targetUserId)) return 'active'
  return null
}
