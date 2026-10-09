'use client'

import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { DEFAULT_RINGTONE_ID, DEFAULT_RINGTONE_VOLUME } from '@/lib/utils/ringtone'

// ------------------------------------------------------------------
// Call settings - which ringtone plays for incoming/outgoing calls, and
// how loud. Stored on the user's own profile so it's the same across
// every chat and every device they're logged into.
// ------------------------------------------------------------------
export function useCallSettings(userId?: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['call-settings', userId],
    queryFn: async () => {
      if (!userId) return { ringtone: DEFAULT_RINGTONE_ID, volume: DEFAULT_RINGTONE_VOLUME }
      const { data } = await supabase
        .from('profiles')
        .select('call_ringtone, call_ringtone_volume')
        .eq('id', userId)
        .maybeSingle()
      return {
        ringtone: data?.call_ringtone || DEFAULT_RINGTONE_ID,
        volume: data?.call_ringtone_volume ?? DEFAULT_RINGTONE_VOLUME,
      }
    },
    enabled: !!userId,
  })
}

export function useUpdateCallSettings() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ userId, ringtone, volume }: { userId: string; ringtone?: string; volume?: number }) => {
      const patch: Record<string, any> = {}
      if (ringtone !== undefined) patch.call_ringtone = ringtone
      if (volume !== undefined) patch.call_ringtone_volume = volume
      const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
      if (error) throw error
    },
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: ['call-settings', userId] })
    },
  })
}

// ------------------------------------------------------------------
// Nicknames - what I privately call this person in this chat. Only I can
// see/set my own; the other person has their own separate nickname for me.
// ------------------------------------------------------------------
export function useNickname(chatId?: string, setById?: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['nickname', chatId, setById],
    queryFn: async () => {
      if (!chatId || !setById) return null
      const { data } = await supabase
        .from('nicknames')
        .select('nickname')
        .eq('chat_id', chatId)
        .eq('set_by_id', setById)
        .maybeSingle()
      return data?.nickname ?? null
    },
    enabled: !!chatId && !!setById,
  })
}

export function useSetNickname() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      chatId, setById, targetId, nickname,
    }: { chatId: string; setById: string; targetId: string; nickname: string }) => {
      const { error } = await supabase
        .from('nicknames')
        .upsert({ chat_id: chatId, set_by_id: setById, target_id: targetId, nickname }, { onConflict: 'chat_id,set_by_id' })
      if (error) throw error

      // A system message lets the other person know a nickname now exists
      // for them (and what it is) - not a secret, just a heads-up.
      await supabase.from('messages').insert({
        chat_id: chatId,
        sender_id: setById,
        content: `set a nickname for you: "${nickname}"`,
        is_system: true,
      })
    },
    onSuccess: (_, { chatId, setById }) => {
      queryClient.invalidateQueries({ queryKey: ['nickname', chatId, setById] })
    },
  })
}

export function useDeleteNickname() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ chatId, setById }: { chatId: string; setById: string }) => {
      const { error } = await supabase.from('nicknames').delete().eq('chat_id', chatId).eq('set_by_id', setById)
      if (error) throw error
    },
    onSuccess: (_, { chatId, setById }) => {
      queryClient.invalidateQueries({ queryKey: ['nickname', chatId, setById] })
    },
  })
}

// ------------------------------------------------------------------
// Blocking - scoped to chat/messaging. Blocking someone stops either side
// from sending further messages, and anonymizes the blocker's profile (and
// their past messages) from the blocked person's point of view.
// ------------------------------------------------------------------
export function useBlockStatus(userId?: string, otherUserId?: string) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  // Blocking/unblocking happens in one person's browser, but both people's
  // screens need to reflect it right away - a realtime row change on
  // either side of this relationship triggers a refetch here.
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`blocks:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blocks', filter: `blocker_id=eq.${userId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['block-status'] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blocks', filter: `blocked_id=eq.${userId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['block-status'] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  return useQuery({
    queryKey: ['block-status', userId, otherUserId],
    queryFn: async () => {
      if (!userId || !otherUserId) return { iBlockedThem: false, theyBlockedMe: false }
      const { data } = await supabase
        .from('blocks')
        .select('blocker_id, blocked_id')
        .or(`and(blocker_id.eq.${userId},blocked_id.eq.${otherUserId}),and(blocker_id.eq.${otherUserId},blocked_id.eq.${userId})`)
      const iBlockedThem = !!data?.some(b => b.blocker_id === userId)
      const theyBlockedMe = !!data?.some(b => b.blocker_id === otherUserId)
      return { iBlockedThem, theyBlockedMe }
    },
    enabled: !!userId && !!otherUserId,
  })
}

export function useToggleBlock() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ blockerId, blockedId, block }: { blockerId: string; blockedId: string; block: boolean }) => {
      if (block) {
        const { error } = await supabase.from('blocks').insert({ blocker_id: blockerId, blocked_id: blockedId })
        if (error) throw error
        // Lets the blocked person know plainly what happened, instead of
        // just silently losing access to the blocker's profile/messages.
        await supabase.from('notifications').insert({
          user_id: blockedId,
          actor_id: blockerId,
          type: 'blocked',
        })
      } else {
        const { error } = await supabase.from('blocks').delete().eq('blocker_id', blockerId).eq('blocked_id', blockedId)
        if (error) throw error
        await supabase.from('notifications').insert({
          user_id: blockedId,
          actor_id: blockerId,
          type: 'unblocked',
        })
      }
    },
    onSuccess: (_, { blockerId, blockedId }) => {
      queryClient.invalidateQueries({ queryKey: ['block-status', blockerId, blockedId] })
      queryClient.invalidateQueries({ queryKey: ['block-status', blockedId, blockerId] })
    },
  })
}

// The set of user ids who have blocked me, or whom I've blocked - used for
// hiding people from search regardless of direction.
export function useBlockedRelations(userId?: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['blocked-relations', userId],
    queryFn: async () => {
      if (!userId) return new Set<string>()
      const { data } = await supabase.from('blocks').select('blocker_id, blocked_id').or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`)
      return new Set((data || []).flatMap(b => [b.blocker_id, b.blocked_id]).filter(id => id !== userId))
    },
    enabled: !!userId,
  })
}

// Just the people who have blocked ME (not people I've blocked) - their
// chat should vanish from my inbox, but a chat with someone I blocked
// stays visible to me since I'm the one who chose to block them.
export function useBlockedByOthers(userId?: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['blocked-by-others', userId],
    queryFn: async () => {
      if (!userId) return new Set<string>()
      const { data } = await supabase.from('blocks').select('blocker_id').eq('blocked_id', userId)
      return new Set((data || []).map(b => b.blocker_id))
    },
    enabled: !!userId,
  })
}

// ------------------------------------------------------------------
// Block List screen - every account this person has blocked, with their
// profile info attached, minus whichever ones they've chosen to "hide"
// from this list (hiding doesn't unblock them, it just stops showing
// up here - see hidden_block_entries).
// ------------------------------------------------------------------
export function useMyBlockedUsers(userId?: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['my-blocked-users', userId],
    queryFn: async () => {
      if (!userId) return []
      const { data: blockRows, error: blockErr } = await supabase
        .from('blocks')
        .select('blocked_id, created_at')
        .eq('blocker_id', userId)
        .order('created_at', { ascending: false })
      if (blockErr) throw blockErr
      if (!blockRows || blockRows.length === 0) return []

      const { data: hiddenRows } = await supabase
        .from('hidden_block_entries')
        .select('hidden_user_id')
        .eq('user_id', userId)
      const hiddenSet = new Set((hiddenRows || []).map(h => h.hidden_user_id))

      const visibleIds = blockRows.map(b => b.blocked_id).filter(id => !hiddenSet.has(id))
      if (visibleIds.length === 0) return []

      const { data: profiles, error: profilesErr } = await supabase
        .from('profiles')
        .select('*')
        .in('id', visibleIds)
      if (profilesErr) throw profilesErr

      // Keep the original most-recently-blocked-first order from blockRows.
      const profileMap = new Map((profiles || []).map(p => [p.id, p]))
      return blockRows
        .filter(b => !hiddenSet.has(b.blocked_id))
        .map(b => ({ ...profileMap.get(b.blocked_id)!, blocked_at: b.created_at }))
        .filter(p => !!p.id)
    },
    enabled: !!userId,
  })
}

export function useHideBlockEntry() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ userId, hiddenUserId }: { userId: string; hiddenUserId: string }) => {
      const { error } = await supabase.from('hidden_block_entries').insert({ user_id: userId, hidden_user_id: hiddenUserId })
      if (error) throw error
    },
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: ['my-blocked-users', userId] })
    },
  })
}

// ------------------------------------------------------------------
// Chat wallpaper - a personal display setting, like nicknames. Scoped to
// (chat_id, user_id): the wallpaper I set here only ever applies to this
// one conversation, and only on my own screen - it never appears for the
// other person, and setting one chat's wallpaper never touches any other
// chat's wallpaper.
// ------------------------------------------------------------------
export function useChatWallpaper(chatId?: string, userId?: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['chat-wallpaper', chatId, userId],
    queryFn: async () => {
      if (!chatId || !userId) return null
      const { data } = await supabase
        .from('chat_wallpapers')
        .select('wallpaper_url, position_x, position_y')
        .eq('chat_id', chatId)
        .eq('user_id', userId)
        .maybeSingle()
      return data ?? null
    },
    enabled: !!chatId && !!userId,
  })
}

export function useSetChatWallpaper() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      chatId, userId, wallpaperUrl, positionX, positionY,
    }: { chatId: string; userId: string; wallpaperUrl: string; positionX: number; positionY: number }) => {
      const { error } = await supabase
        .from('chat_wallpapers')
        .upsert(
          { chat_id: chatId, user_id: userId, wallpaper_url: wallpaperUrl, position_x: positionX, position_y: positionY },
          { onConflict: 'chat_id,user_id' }
        )
      if (error) throw error
    },
    onSuccess: (_, { chatId, userId }) => {
      queryClient.invalidateQueries({ queryKey: ['chat-wallpaper', chatId, userId] })
    },
  })
}

export function useDeleteChatWallpaper() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ chatId, userId }: { chatId: string; userId: string }) => {
      const { error } = await supabase.from('chat_wallpapers').delete().eq('chat_id', chatId).eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: (_, { chatId, userId }) => {
      queryClient.invalidateQueries({ queryKey: ['chat-wallpaper', chatId, userId] })
    },
  })
}

// ------------------------------------------------------------------
// Soft chat delete - hides it from my inbox only. If either side sends a
// new message afterward, it reappears for both, same as most chat apps.
// ------------------------------------------------------------------
export function useDeleteChatForMe() {
  const supabase = createClient()

  return useMutation({
    mutationFn: async ({ chatId, userId }: { chatId: string; userId: string }) => {
      const { data: chat } = await supabase.from('chats').select('deleted_by').eq('id', chatId).maybeSingle()
      const current: string[] = chat?.deleted_by || []
      if (current.includes(userId)) return
      const { error } = await supabase.from('chats').update({ deleted_by: [...current, userId] }).eq('id', chatId)
      if (error) throw error
    },
  })
}

// ------------------------------------------------------------------
// Pin / unpin a chat - purely personal, each side can pin the same
// conversation independently (or not at all), same idea as the Aperonix
// entry that's always pinned at the top.
// ------------------------------------------------------------------
export function useTogglePinChat() {
  const supabase = createClient()

  return useMutation({
    mutationFn: async ({ chatId, userId, pin }: { chatId: string; userId: string; pin: boolean }) => {
      const { data: chat } = await supabase.from('chats').select('pinned_by').eq('id', chatId).maybeSingle()
      const current: string[] = chat?.pinned_by || []
      const next = pin ? [...new Set([...current, userId])] : current.filter((id) => id !== userId)
      const { error } = await supabase.from('chats').update({ pinned_by: next }).eq('id', chatId)
      if (error) throw error
    },
  })
}

// ------------------------------------------------------------------
// Archive / unarchive a chat - also personal to each side. An archived
// chat is hidden from the normal inbox, doesn't raise notifications, and
// doesn't add to the unread badge - see /chat/archive and the
// notify-message push route.
// ------------------------------------------------------------------
export function useToggleArchiveChat() {
  const supabase = createClient()

  return useMutation({
    mutationFn: async ({ chatId, userId, archive }: { chatId: string; userId: string; archive: boolean }) => {
      const { data: chat } = await supabase.from('chats').select('archived_by').eq('id', chatId).maybeSingle()
      const current: string[] = chat?.archived_by || []
      const next = archive ? [...new Set([...current, userId])] : current.filter((id) => id !== userId)
      const { error } = await supabase.from('chats').update({ archived_by: next }).eq('id', chatId)
      if (error) throw error
    },
  })
}

// ------------------------------------------------------------------
// Archive lock - a simple PIN that protects the whole Archive section
// (not per-chat). This is a casual privacy screen (stops someone picking
// up your unlocked phone from browsing it), not bank-grade security, so a
// SHA-256 hash via the browser's built-in Web Crypto API is enough - no
// extra password-hashing library needed.
// ------------------------------------------------------------------
async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(pin)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function useArchiveLockStatus(userId?: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['archive-lock-status', userId],
    queryFn: async () => {
      if (!userId) return { hasPassword: false, hint: null as string | null }
      const { data } = await supabase
        .from('profiles')
        .select('archive_password_hash, archive_password_hint')
        .eq('id', userId)
        .maybeSingle()
      return { hasPassword: !!data?.archive_password_hash, hint: data?.archive_password_hint || null }
    },
    enabled: !!userId,
  })
}

export function useSetArchivePassword() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ userId, password, hint }: { userId: string; password: string; hint?: string }) => {
      const hash = await hashPin(password)
      const { error } = await supabase
        .from('profiles')
        .update({ archive_password_hash: hash, archive_password_hint: hint?.trim() || null })
        .eq('id', userId)
      if (error) throw error
    },
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: ['archive-lock-status', userId] })
    },
  })
}

export function useVerifyArchivePassword() {
  const supabase = createClient()

  return useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      const { data } = await supabase.from('profiles').select('archive_password_hash').eq('id', userId).maybeSingle()
      if (!data?.archive_password_hash) return true // no password set yet - nothing to check against
      const hash = await hashPin(password)
      return hash === data.archive_password_hash
    },
  })
}
