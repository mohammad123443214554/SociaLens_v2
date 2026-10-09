'use client'

import { useMutation } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export function useSubmitContactSupport() {
  const supabase = createClient()

  return useMutation({
    mutationFn: async ({
      userId, name, message, mediaUrl, mediaType,
    }: {
      userId: string
      name: string
      message: string
      mediaUrl?: string | null
      mediaType?: 'image' | 'video' | null
    }) => {
      const { error } = await supabase.from('contact_submissions').insert({
        user_id: userId,
        name: name.trim(),
        message: message.trim(),
        media_url: mediaUrl || null,
        media_type: mediaUrl ? mediaType || null : null,
      })
      if (error) throw error
    },
  })
} 
