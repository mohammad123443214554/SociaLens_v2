'use client'

import { useState } from 'react'
import { X, Lock } from 'lucide-react'
import { useUser } from '@/lib/hooks/useUser'
import { useSetArchivePassword } from '@/lib/hooks/useChatSettings'

interface ArchivePasswordWizardProps {
  onClose: () => void
  onDone: () => void
}

/**
 * First-time setup for the Archive section's PIN - a centered dialog (not
 * a full page) with three steps: new password, confirm it, then an
 * optional hint. Runs whether someone triggers it from a chat's "Archive"
 * menu action or by opening the Archive section directly for the first
 * time - same wizard either way.
 */
export function ArchivePasswordWizard({ onClose, onDone }: ArchivePasswordWizardProps) {
  const { user } = useUser()
  const setPassword = useSetArchivePassword()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [hint, setHint] = useState('')
  const [error, setError] = useState('')

  const handleNextFromNew = () => {
    if (newPassword.length < 4) { setError('Use at least 4 digits.'); return }
    setError('')
    setStep(2)
  }

  const handleNextFromConfirm = () => {
    if (confirmPassword !== newPassword) { setError("Passwords don't match."); return }
    setError('')
    setStep(3)
  }

  const finish = async () => {
    if (!user) return
    await setPassword.mutateAsync({ userId: user.id, password: newPassword, hint: hint.trim() || undefined })
    onDone()
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[110] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border rounded-2xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <p className="font-semibold flex items-center gap-2">
            <Lock className="h-4 w-4" /> Set archive password
          </p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {step === 1 && (
            <>
              <p className="text-sm text-muted-foreground">Choose a password to protect your Archive. You'll need it every time you open it.</p>
              <input
                autoFocus
                type="password"
                inputMode="numeric"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
                className="w-full bg-muted rounded-xl px-4 py-3 text-center text-lg tracking-widest outline-none border border-transparent focus:border-pink-500"
              />
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button
                onClick={handleNextFromNew}
                className="w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-xl py-2.5 text-sm font-semibold"
              >
                Next
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <p className="text-sm text-muted-foreground">Confirm your password.</p>
              <input
                autoFocus
                type="password"
                inputMode="numeric"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                className="w-full bg-muted rounded-xl px-4 py-3 text-center text-lg tracking-widest outline-none border border-transparent focus:border-pink-500"
              />
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button
                onClick={handleNextFromConfirm}
                className="w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-xl py-2.5 text-sm font-semibold"
              >
                Next
              </button>
            </>
          )}

          {step === 3 && (
            <>
              <p className="text-sm text-muted-foreground">Set a hint in case you forget your password (optional).</p>
              <input
                autoFocus
                type="text"
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                placeholder="Password hint"
                maxLength={80}
                className="w-full bg-muted rounded-xl px-4 py-3 text-sm outline-none border border-transparent focus:border-pink-500"
              />
              <button
                onClick={finish}
                disabled={setPassword.isPending}
                className="w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
              >
                {hint.trim() ? 'Next' : setPassword.isPending ? 'Saving...' : 'Skip'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
