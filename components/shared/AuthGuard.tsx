'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PageLoader } from './LoadingSpinner'
import { SuspendedScreen } from './SuspendedScreen'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [suspension, setSuspension] = useState<{ reason: string | null; deadline: string | null } | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const checkedUserIdRef = useRef<string | null>(null)
  const checkSuspension = async (supabase: ReturnType<typeof createClient>, userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('is_suspended, suspension_reason, suspension_deadline')
      .eq('id', userId)
      .single()
    if (data?.is_suspended) {
      setSuspension({ reason: data.suspension_reason, deadline: data.suspension_deadline })
    } else {
      setSuspension(null)
    }
  }

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return
    }
    const supabase = createClient()
    let active = true

    const verifySession = async (session: { user: { id: string } } | null) => {
      if (!active) return
      if (!session) {
        router.replace('/login')
        return
      }

      // getSession() and Supabase's INITIAL_SESSION event can arrive together.
      // Check suspension once per signed-in user, not again on every token
      // refresh or duplicate initial auth notification.
      if (checkedUserIdRef.current === session.user.id) {
        setReady(true)
        return
      }

      checkedUserIdRef.current = session.user.id
      await checkSuspension(supabase, session.user.id)
      if (active) setReady(true)
    }

    void supabase.auth.getSession().then(({ data: { session } }) => verifySession(session))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        checkedUserIdRef.current = null
        router.replace('/login')
      } else if (session && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'USER_UPDATED')) {
        void verifySession(session)
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  if (!ready) return <PageLoader />
  // The appeal page itself has to stay reachable even while suspended -
  // Everything else behind AuthGuard is locked to the suspension screen.
  if (suspension && pathname !== '/appeal') {
    return <SuspendedScreen reason={suspension.reason} deadline={suspension.deadline} />
  }
  return <>{children}</>
}

export function GuestGuard({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const router = useRouter()
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      setReady(true)
      return
    }
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace('/feed')
      } else {
        setReady(true)
      }
    })
  }, [])

  if (!ready) return <PageLoader />
  return <>{children}</>
}
