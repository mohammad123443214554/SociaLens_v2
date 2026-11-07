'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Lock } from 'lucide-react'
import { useUser } from '@/lib/hooks/useUser'
import { useVerifyArchivePassword } from '@/lib/hooks/useChatSettings'
import { ArchiveChangePasswordWizard } from './ArchiveChangePasswordWizard'
import { ArchivePatternLock } from './ArchivePatternLock'

interface ArchiveUnlockScreenProps {
  hint: string | null
  lockType?: 'password' | 'pattern'
  onUnlock: () => void
  /** Archive section shows "Archive is locked"; opening a single archived
   *  chat directly (search, someone's profile, a link) shows "Chat is
   *  Locked" instead - same screen, wording just matches what's actually
   *  behind it. */
  title?: string
}

export function ArchiveUnlockScreen({ hint, lockType = 'password', onUnlock, title = 'Archive is locked' }: ArchiveUnlockScreenProps) {
  const router = useRouter()
  const { user } = useUser()
  const verify = useVerifyArchivePassword()
  const [password, setPassword] = useState('')
  const [patternError, setPatternError] = useState('')
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

  const handlePattern = async (value: string) => {
    if (!user || verify.isPending) return
    setPatternError('')
    const ok = await verify.mutateAsync({ userId: user.id, pattern: value })
    if (ok) onUnlock()
    else setPatternError('Incorrect pattern. Please try again.')
  }

  return (
    <div className="min-h-[calc(100dvh-64px)] overflow-hidden flex items-center justify-center px-4 py-5">
    <div className="mx-auto flex w-full max-w-sm flex-col items-center text-center">
      <button onClick={() => router.push('/chat')} className="mb-6 self-start flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
        <Lock className="h-6 w-6 text-muted-foreground" />
      </div>
      <h1 className="font-bold text-lg mb-1">{title}</h1>
      {lockType === 'password' && <p className="mb-6 text-sm text-muted-foreground">Enter your password to continue.</p>}
      {lockType === 'pattern' ? (
        <div className="w-full">
          <ArchivePatternLock key="archive-unlock-pattern" onComplete={handlePattern} disabled={verify.isPending} showIdleHint={false} />
          {verify.isPending && <p className="mt-2 text-xs text-muted-foreground">Checking pattern…</p>}
          {patternError && <p role="alert" className="mt-2 text-xs text-red-500">{patternError}</p>}
        </div>
      ) : (
        <>
          <input autoFocus type="password" inputMode="numeric" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} placeholder="Password" className="w-full bg-muted rounded-xl px-4 py-3 text-center text-lg tracking-widest outline-none border border-transparent focus:border-pink-500 mb-2" />
          {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
          <button onClick={handleSubmit} disabled={verify.isPending || !password} className="w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60 mb-4">{verify.isPending ? 'Checking…' : 'Unlock'}</button>
        </>
      )}

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
          {lockType === 'pattern' ? 'Change lock' : 'Change password'}
        </button>
      </div>

      {showChangePassword && (
        <ArchiveChangePasswordWizard
          lockType={lockType}
          onClose={() => setShowChangePassword(false)}
          onDone={() => setShowChangePassword(false)}
        />
      )}
    </div>
    </div>
  )
}
