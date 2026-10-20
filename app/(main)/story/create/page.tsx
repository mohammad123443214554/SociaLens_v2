'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { TextStoryModal } from '@/components/stories/TextStoryModal'

export default function CreateStoryPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [lightTheme, setLightTheme] = useState(false)

  useEffect(() => {
    // Read theme immediately so the transition screen matches the selected appearance.
    const readTheme = () => setLightTheme(document.documentElement.classList.contains('light'))
    readTheme()
    const observer = new MutationObserver(readTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    const supabase = createClient()
    let active = true
    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!active) return
        if (session?.user) {
          setUser(session.user)
          // Do not block the editor on a separate profile query.
          setAuthReady(true)
        } else {
          setAuthReady(true)
          router.replace('/login')
        }
      } catch {
        if (active) {
          setAuthReady(true)
          router.replace('/login')
        }
      }
    }
    void init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      if (session?.user) {
        setUser(session.user)
        setAuthReady(true)
      } else if (authReady) {
        setUser(null)
        router.replace('/login')
      }
    })

    return () => {
      active = false
      observer.disconnect()
      subscription.unsubscribe()
    }
  // authReady is intentionally omitted: the subscription must only be installed once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  if (!authReady || !user) {
    return (
      <main className={`fixed inset-0 z-[9999] flex min-h-dvh items-center justify-center ${lightTheme ? 'bg-white text-black' : 'bg-black text-white'}`}>
        <Loader2 className="h-8 w-8 animate-spin text-pink-500" aria-label="Loading story editor" />
      </main>
    )
  }

  return (
    <main className={`fixed inset-0 z-[9999] min-h-dvh overflow-hidden ${lightTheme ? 'bg-white' : 'bg-black'}`}>
      <TextStoryModal userId={user.id} onClose={() => router.push('/feed')} onBack={() => router.push('/feed')} />
    </main>
  )
}
