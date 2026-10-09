'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PageLoader } from './LoadingSpinner'
import { SuspendedScreen } from './SuspendedScreen'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [suspension, setSuspension] = useState<{ reason: string | null; deadline: string | null } | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  const checkSuspension = async (userId: string) => {
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
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace('/login')
        return
      }
      await checkSuspension(session.user.id)
      setReady(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        router.replace('/login')
      } else if (session) {
        checkSuspension(session.user.id).then(() => setReady(true))
      }
    })

    return () => subscription.unsubscribe()
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
  const supabase = createClient()

  useEffect(() => {
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
