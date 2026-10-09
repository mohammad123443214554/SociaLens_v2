'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/hooks/useUser'
import { useEventFlusher } from '@/lib/hooks/useTrackEvent'

interface PresenceContextValue {
  // Everyone currently known to have SociaLens open, on any page - the
  // "Active" (blue dot) state. Per-conversation "Online" (green dot) is a
  // separate, narrower thing tracked by the chat page/list themselves.
  activeUserIds: Set<string>
}

const PresenceContext = createContext<PresenceContextValue>({ activeUserIds: new Set() })

export function usePresence() {
  return useContext(PresenceContext)
}

// Mounted once near the root of the signed-in app (see (main)/layout.tsx)
// so there's exactly one global presence channel for the whole session,
// not one per component that happens to want to show a status dot.
export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser()
  const [activeUserIds, setActiveUserIds] = useState<Set<string>>(new Set())
  const supabaseRef = useRef(createClient())
  useEventFlusher()

  useEffect(() => {
    if (!user) return
    const supabase = supabaseRef.current
    const channel = supabase.channel('presence:global', {
      config: { presence: { key: user.id } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ userId: string }>()
        setActiveUserIds(new Set(Object.keys(state)))
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ userId: user.id, online_at: new Date().toISOString() })
        }
      })

    // A tab going to the background doesn't necessarily close the socket
    // right away, but treating "hidden" as still Active is fine - it's the
    // same tolerance Instagram/WhatsApp Web give a briefly-backgrounded tab.

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  return <PresenceContext.Provider value={{ activeUserIds }}>{children}</PresenceContext.Provider>
}
