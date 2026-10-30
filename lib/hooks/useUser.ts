'use client'

import { useContext } from 'react'
import { UserContext } from '@/components/shared/UserProvider'

/**
 * Reads the one app-wide auth/profile state. Do not create a new Supabase
 * auth listener from individual pages or shared navigation components.
 */
export function useUser() {
  const context = useContext(UserContext)
  if (!context) {
    throw new Error('useUser must be used within the root UserProvider')
  }
  return context
}
