'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, TriangleAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface SuspendedScreenProps {
  reason: string | null
  deadline: string | null
}

function formatRemaining(ms: number) {
  if (ms <= 0) return '00:00:00'
  const totalSeconds = Math.floor(ms / 1000)
  const h = Math.floor(totalSeconds / 3600).toString().padStart(2, '0')
  const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0')
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0')
  return `${h}:${m}:${s}`
}

export function SuspendedScreen({ reason, deadline }: SuspendedScreenProps) {
  const router = useRouter()
  const supabase = createClient()
  const [remaining, setRemaining] = useState<number>(deadline ? new Date(deadline).getTime() - Date.now() : 0)

  useEffect(() => {
    if (!deadline) return
    const target = new Date(deadline).getTime()
    const tick = () => setRemaining(target - Date.now())
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [deadline])

  const expired = remaining <= 0

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-sm w-full text-center space-y-5">
        <div className="mx-auto h-16 w-16 rounded-full bg-red-500/10 flex items-center justify-center">
          <Lock className="h-8 w-8 text-red-500" />
        </div>

        <div>
          <h1 className="text-xl font-bold">Your account is suspended</h1>
          {reason && <p className="text-sm text-muted-foreground mt-2">{reason}</p>}
        </div>

        <div className="rounded-2xl border p-4 space-y-1.5">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            {expired ? 'Appeal window closed' : 'Time left to appeal'}
          </p>
          <p className={`text-2xl font-mono font-bold ${expired ? 'text-red-500' : ''}`}>
            {expired ? 'Expired' : formatRemaining(remaining)}
          </p>
          {expired && (
            <p className="text-xs text-muted-foreground pt-1">
              This account and all its data will be permanently deleted.
            </p>
          )}
        </div>

        {!expired ? (
          <button
            onClick={() => router.push('/appeal')}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white font-medium"
          >
            Appeal
          </button>
        ) : (
          <div className="flex items-center gap-2 justify-center text-xs text-muted-foreground">
            <TriangleAlert className="h-3.5 w-3.5" /> No further action possible
          </div>
        )}

        <button onClick={handleSignOut} className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2">
          Sign out
        </button>
      </div>
    </div>
  )
}
