'use client'

import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/lib/types/database.types'
import { createClient } from '@/lib/supabase/client'

interface UserContextValue {
  user: User | null
  profile: Profile | null
  loading: boolean
  refreshProfile: () => Promise<void>
}

export const UserContext = createContext<UserContextValue | null>(null)

/**
 * Owns the single browser auth/profile subscription for the whole app.
 * Keeping this above the route tree avoids every navbar, page and provider
 * independently hydrating the same session and requesting the same profile.
 */
export function UserProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), [])
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)
  const profileRequestsRef = useRef(new Map<string, Promise<Profile | null>>())

  const fetchProfile = useCallback((userId: string) => {
    const existing = profileRequestsRef.current.get(userId)
    if (existing) return existing

    const request = supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        const nextProfile = data as Profile | null
        if (mountedRef.current && nextProfile) setProfile(nextProfile)
        return nextProfile
      })
      .catch((error) => {
        console.error('[SociaLens] Could not load profile', error)
        return null
      })
      .finally(() => profileRequestsRef.current.delete(userId))

    profileRequestsRef.current.set(userId, request)
    return request
  }, [supabase])

  useEffect(() => {
    mountedRef.current = true
    let activeUserId: string | null = null

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUser = session?.user ?? null

      if (!nextUser) {
        activeUserId = null
        setUser(null)
        setProfile(null)
        setLoading(false)
        return
      }

      const nextUserId = nextUser.id
      setUser(nextUser)

      // Token refreshes happen routinely and do not mean profile data changed.
      // Avoid another profiles SELECT on every refresh event.
      const shouldLoadProfile =
        event === 'INITIAL_SESSION' ||
        event === 'SIGNED_IN' ||
        event === 'USER_UPDATED' ||
        event === 'PASSWORD_RECOVERY' ||
        activeUserId !== nextUserId

      if (shouldLoadProfile) {
        activeUserId = nextUserId
        setLoading(true)
        void fetchProfile(nextUserId).finally(() => {
          if (mountedRef.current && activeUserId === nextUserId) setLoading(false)
        })
      } else {
        setLoading(false)
      }
    })

    return () => {
      mountedRef.current = false
      subscription.unsubscribe()
    }
  }, [fetchProfile, supabase])

  const refreshProfile = useCallback(async () => {
    if (!user?.id) return
    profileRequestsRef.current.delete(user.id)
    await fetchProfile(user.id)
  }, [fetchProfile, user?.id])

  const value = useMemo(() => ({ user, profile, loading, refreshProfile }), [user, profile, loading, refreshProfile])

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}
