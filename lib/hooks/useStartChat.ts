'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/lib/types/database.types'

/**
 * Finds (or creates) a 1-on-1 chat with a target user and navigates to it,
 * respecting the target's message_privacy setting. Shared by the Chat page's
 * "new chat" search and the Message button on other people's profiles, so
 * the privacy rules only live in one place.
 */
export function useStartChat() {
  const supabase = createClient()
  const router = useRouter()
  const [startingChatWith, setStartingChatWith] = useState<string | null>(null)
  const [error, setError] = useState('')

  const startChat = async (
    currentUserId: string,
    target: Pick<Profile, 'id' | 'message_privacy'>
  ) => {
    if (!currentUserId || startingChatWith) return
    setError('')

    if (target.message_privacy && target.message_privacy !== 'everyone') {
      if (target.message_privacy === 'none') {
        setError('Message is not available.')
        return
      }
      if (target.message_privacy === 'followers') {
        const { data: follow } = await supabase
          .from('follows')
          .select('id')
          .eq('follower_id', currentUserId)
          .eq('following_id', target.id)
          .eq('status', 'accepted')
          .maybeSingle()
        if (!follow) {
          setError('Message is unavailable. Please follow and start conversation.')
          return
        }
      }
      if (target.message_privacy === 'following') {
        const { data: follow } = await supabase
          .from('follows')
          .select('id')
          .eq('follower_id', target.id)
          .eq('following_id', currentUserId)
          .eq('status', 'accepted')
          .maybeSingle()
        if (!follow) {
          setError('Message is only available to people this user follows.')
          return
        }
      }
      if (target.message_privacy === 'selected') {
        const { data: sel } = await supabase
          .from('privacy_selected_users')
          .select('id')
          .eq('owner_id', target.id)
          .eq('category', 'message')
          .eq('selected_user_id', currentUserId)
          .maybeSingle()
        if (!sel) {
          setError('Message is only available to a selected person.')
          return
        }
      }
    }

    setStartingChatWith(target.id)
    try {
      const { data: existing } = await supabase
        .from('chats')
        .select('id')
        .or(
          `and(participant1_id.eq.${currentUserId},participant2_id.eq.${target.id}),` +
          `and(participant1_id.eq.${target.id},participant2_id.eq.${currentUserId})`
        )
        .maybeSingle()

      if (existing) {
        router.push(`/chat/${existing.id}`)
        return
      }

      const { data: created, error: insertError } = await supabase
        .from('chats')
        .insert({ participant1_id: currentUserId, participant2_id: target.id })
        .select('id')
        .single()

      if (insertError || !created) {
        setError('Message is not available.')
        return
      }

      router.push(`/chat/${created.id}`)
    } finally {
      setStartingChatWith(null)
    }
  }

  return { startChat, startingChatWith, error }
}
