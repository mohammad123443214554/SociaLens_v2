'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/hooks/useUser'

export interface AppNotification {
  id: string
  type:
    | 'like' | 'comment' | 'follow' | 'unfollow' | 'message' | 'new_post'
    | 'blocked' | 'unblocked'
    | 'share_post' | 'photo' | 'video' | 'voice_message'
    | 'story_reply' | 'message_reply' | 'repost'
    | 'comment_like' | 'comment_react' | 'comment_reply'
    | 'story_like' | 'story_react' | 'story_comment'
    | 'story_comment_like' | 'story_comment_react' | 'story_comment_reply'
    | 'call' | 'verified'
  is_read: boolean
  created_at: string
  message: string | null
  context_text: string | null
  emoji: string | null
  post_id: string | null
  story_id: string | null
  comment_id: string | null
  actor: { id: string; username: string; avatar_url: string | null; is_verified?: boolean; verification_type?: 'blue' | 'yellow' | null }
}

function clip(s: string | null, n = 40) {
  return s && s.length > n ? `${s.slice(0, n)}...` : s || ''
}

export function getNotifText(n: AppNotification): string {
  switch (n.type) {
    case 'like': return 'liked your post'
    case 'comment': return `commented on your post: "${clip(n.message)}"`
    case 'follow': return 'started following you'
    case 'unfollow': return 'unfollowed you'
    case 'message': return 'sent you a message'
    case 'blocked': return 'blocked you'
    case 'unblocked': return 'unblocked you'
    case 'new_post': return 'shared a new post'
    case 'share_post': return 'shared a post with you'
    case 'photo': return 'sent a photo'
    case 'video': return 'sent a video'
    case 'voice_message': return 'sent a voice message'
    case 'story_reply': return `replied to your story: "${clip(n.message)}"`
    case 'message_reply': return `replied to your message: "${clip(n.message)}"`
    case 'repost': return 'reposted your post'
    case 'comment_like': return `liked your comment: "${clip(n.message)}"`
    case 'comment_react': return `reacted ${n.emoji ?? ''} to your comment: "${clip(n.message)}"`
    case 'comment_reply': return `replied to your comment "${clip(n.context_text, 25)}": "${clip(n.message)}"`
    case 'story_like': return 'liked your story'
    case 'story_react': return `reacted ${n.emoji ?? ''} to your story`
    case 'story_comment': return `commented on your story: "${clip(n.message)}"`
    case 'story_comment_like': return `liked your story comment: "${clip(n.message)}"`
    case 'story_comment_react': return `reacted ${n.emoji ?? ''} to your story comment: "${clip(n.message)}"`
    case 'story_comment_reply': return `replied to your story comment "${clip(n.context_text, 25)}": "${clip(n.message)}"`
    case 'call':
      return n.message === 'missed' ? 'missed call'
        : n.message === 'rejected' ? 'call declined'
        : n.message === 'cancelled' ? 'cancelled call'
        : 'called you'
    case 'verified': return "verified your account - congratulations! \ud83c\udf89 You now have the blue tick."
    default: return ''
  }
}

export function getNotifLink(n: AppNotification): string {
  switch (n.type) {
    case 'like': case 'comment': case 'new_post': case 'repost':
    case 'comment_like': case 'comment_react': case 'comment_reply':
    case 'story_like': case 'story_react': case 'story_comment':
    case 'story_comment_like': case 'story_comment_react': case 'story_comment_reply':
      return '/feed'
    case 'follow': case 'unfollow': return `/profile/${n.actor?.username}`
    case 'message': case 'message_reply': case 'story_reply': case 'share_post':
    case 'photo': case 'video': case 'voice_message': case 'call':
      return '/chat'
    case 'blocked': case 'unblocked': return '/'
    case 'verified': return '/feed'
    default: return '/feed'
  }
}

function setBadge(count: number) {
  if ('setAppBadge' in navigator) {
    if (count > 0) (navigator as any).setAppBadge(count).catch(() => {})
    else (navigator as any).clearAppBadge().catch(() => {})
  }
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: count > 0 ? 'SET_BADGE' : 'CLEAR_BADGE', count
    })
  }
  document.title = count > 0 ? `(${count}) SociaLens` : 'SociaLens - Connect With The World'
}

async function showNativeNotification(title: string, body: string, url: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    const reg = await navigator.serviceWorker.ready
    await reg.showNotification(title, {
      body, icon: '/icons/icon-192x192.png', badge: '/icons/icon-72x72.png',
      vibrate: [200, 100, 200], data: { url }, tag: 'socialens', renotify: true,
    } as any)
  } catch { new Notification(title, { body, icon: '/icons/icon-192x192.png' }) }
}

const CHAT_AND_CALL_TYPES = new Set([
  'message', 'photo', 'video', 'voice_message', 'share_post',
  'story_reply', 'message_reply', 'call',
])

/**
 * Core notifications data - fetch, realtime updates, unread badge, and
 * (optionally) native OS notifications when something new arrives while
 * backgrounded. Used by the navbar bell (badge/native-alert duty only)
 * and by the full /notifications page (list + search, no native duty of
 * its own, so a background tab never double-fires the same alert).
 */
export function useNotifications(options?: { notifyNative?: boolean }) {
  const notifyNative = options?.notifyNative ?? false
  const { user } = useUser()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const prevCountRef = useRef(0)
  const supabase = createClient()

  const fetchNotifications = useCallback(async () => {
    if (!user) return

    const { data: myProfile } = await supabase
      .from('profiles')
      .select('notifications_muted')
      .eq('id', user.id)
      .single()

    if ((myProfile as any)?.notifications_muted) {
      setNotifications([])
      setUnreadCount(0)
      setBadge(0)
      prevCountRef.current = 0
      setLoading(false)
      return
    }

    const { data: onlyFrom } = await supabase
      .from('privacy_selected_users')
      .select('selected_user_id')
      .eq('owner_id', user.id)
      .eq('category', 'notify')
    const allowedActorIds = (onlyFrom || []).map((r: any) => r.selected_user_id)

    let query = supabase
      .from('notifications')
      .select('*, actor:profiles!notifications_actor_id_fkey(id, username, avatar_url, is_verified, verification_type)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100)

    if (allowedActorIds.length > 0) {
      query = query.in('actor_id', allowedActorIds)
    }

    const { data } = await query

    if (data) {
      setNotifications(data as AppNotification[])
      const unread = data.filter(n => !n.is_read).length
      setUnreadCount(unread)
      setBadge(unread)

      if (notifyNative && unread > prevCountRef.current && document.hidden) {
        const newest = data.find(n => !n.is_read)
        if (newest && !CHAT_AND_CALL_TYPES.has(newest.type)) {
          await showNativeNotification('SociaLens', `${newest.actor?.username} ${getNotifText(newest as AppNotification)}`, getNotifLink(newest as AppNotification))
        }
      }
      prevCountRef.current = unread
    }
    setLoading(false)
  }, [user, notifyNative])

  const markAllRead = useCallback(async () => {
    if (!user) return
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false)
    setUnreadCount(0)
    setBadge(0)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }, [user])

  const clearAll = useCallback(async () => {
    if (!user) return
    await supabase.from('notifications').delete().eq('user_id', user.id)
    setNotifications([])
    setUnreadCount(0)
    setBadge(0)
  }, [user])

  useEffect(() => {
    if (!user) return
    fetchNotifications()

    if (notifyNative && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    const handleVisibility = () => { if (!document.hidden) setBadge(0) }
    if (notifyNative) document.addEventListener('visibilitychange', handleVisibility)

    const channel = supabase.channel(`notifs:${user.id}:${notifyNative ? 'bell' : 'page'}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => fetchNotifications())
      .subscribe()

    const interval = setInterval(fetchNotifications, 30000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
      if (notifyNative) document.removeEventListener('visibilitychange', handleVisibility)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  return { notifications, unreadCount, loading, markAllRead, clearAll, refetch: fetchNotifications }
}
