'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Lock } from 'lucide-react'
import { useUser } from '@/lib/hooks/useUser'
import { useVerifyArchivePassword } from '@/lib/hooks/useChatSettings'
import { ArchiveChangePasswordWizard } from './ArchiveChangePasswordWizard'

interface ArchiveUnlockScreenProps {
  hint: string | null
  onUnlock: () => void
  /** Archive section shows "Archive is locked"; opening a single archived
   *  chat directly (search, someone's profile, a link) shows "Chat is
   *  Locked" instead - same screen, wording just matches what's actually
   *  behind it. */
  title?: string
}

export function ArchiveUnlockScreen({ hint, onUnlock, title = 'Archive is locked' }: ArchiveUnlockScreenProps) {
  const router = useRouter()
  const { user } = useUser()
  const verify = useVerifyArchivePassword()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [showHint, setShowHint] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)

  const handleSubmit = async () => {
    if (!user) return
    setError('')
    const ok = await verify.mutateAsync({ userId: user.id, password })
    if (ok) onUnlock()
    else setError('Incorrect password.')
  }

  return (
    <div className="max-w-sm mx-auto flex flex-col items-center px-4 py-16 text-center">
      <button onClick={() => router.push('/chat')} className="self-start text-muted-foreground hover:text-foreground mb-8 flex items-center gap-1 text-sm">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
        <Lock className="h-6 w-6 text-muted-foreground" />
      </div>
      <h1 className="font-bold text-lg mb-1">{title}</h1>
      <p className="text-sm text-muted-foreground mb-6">Enter your password to continue.</p>
      <input
        autoFocus
        type="password"
        inputMode="numeric"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        placeholder="Password"
        className="w-full bg-muted rounded-xl px-4 py-3 text-center text-lg tracking-widest outline-none border border-transparent focus:border-pink-500 mb-2"
      />
      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={verify.isPending || !password}
        className="w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60 mb-4"
      >
        Unlock
      </button>

      {/* Hint on the left, "Change password" on the right - always visible
          (phone and desktop both), even with no hint set, so resetting the
          password doesn't depend on having one. */}
      <div className="w-full flex items-center justify-between">
        <div>
          {hint && (
            showHint ? (
              <p className="text-xs text-muted-foreground text-left">Hint: {hint}</p>
            ) : (
              <button onClick={() => setShowHint(true)} className="text-xs text-muted-foreground underline">
                Show hint
              </button>
            )
          )}
        </div>
        <button onClick={() => setShowChangePassword(true)} className="text-xs text-pink-500 underline shrink-0">
          Change password
        </button>
      </div>

      {showChangePassword && (
        <ArchiveChangePasswordWizard
          onClose={() => setShowChangePassword(false)}
          onDone={() => setShowChangePassword(false)}
        />
      )}
    </div>
  )
}
