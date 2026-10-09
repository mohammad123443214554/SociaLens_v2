'use client'

import { useMutation } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// Confirms the password actually belongs to this account before letting
// an appeal go through - re-runs the normal password sign-in check
// without disturbing the already-active session (Supabase just
// Re-validates the credentials and returns a session, which we discard).
export function useVerifyPassword() {
  const supabase = createClient()

  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw new Error('That password is incorrect.')
    },
  })
}

export function useSubmitAppeal() {
  const supabase = createClient()

  return useMutation({
    mutationFn: async ({ userId, photoUrl, letter }: { userId: string; photoUrl: string; letter: string }) => {
      const { error } = await supabase.from('account_appeals').insert({
        user_id: userId,
        photo_url: photoUrl,
        letter: letter.trim(),
      })
      if (error) throw error
    },
  })
}
