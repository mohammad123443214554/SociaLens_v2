'use client'

import { useState } from 'react'
import { X, Lock, Grid3X3, KeyRound, ShieldCheck } from 'lucide-react'
import { useUser } from '@/lib/hooks/useUser'
import { useVerifyArchivePassword, useSetArchivePassword } from '@/lib/hooks/useChatSettings'
import { ArchivePatternLock } from './ArchivePatternLock'

interface ArchiveChangePasswordWizardProps {
  lockType?: 'password' | 'pattern'
  onClose: () => void
  onDone: () => void
}

type LockType = 'password' | 'pattern'

export function ArchiveChangePasswordWizard({ lockType = 'password', onClose, onDone }: ArchiveChangePasswordWizardProps) {
  const { user } = useUser()
  const verify = useVerifyArchivePassword()
  const setPassword = useSetArchivePassword()
  const [targetLockType, setTargetLockType] = useState<LockType>(lockType)
  const [showLockPicker, setShowLockPicker] = useState(false)
  const [legacyPatternGrid, setLegacyPatternGrid] = useState(false)
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [newPattern, setNewPattern] = useState('')
  const [confirmPattern, setConfirmPattern] = useState('')
  const [hint, setHint] = useState('')
  const [error, setError] = useState('')

  const chooseLock = (type: LockType) => {
    setTargetLockType(type)
    setNewPassword('')
    setConfirmPassword('')
    setNewPattern('')
    setConfirmPattern('')
    setError('')
    setShowLockPicker(false)
  }

  const handleVerifyOld = async () => {
    if (!user) return
    setError('')
    const ok = await verify.mutateAsync({ userId: user.id, password: oldPassword })
    if (!ok) { setError('Incorrect password.'); return }
    setStep(2)
  }

  const handleVerifyOldPattern = async (pattern: string) => {
    if (!user || verify.isPending) return
    setError('')
    const ok = await verify.mutateAsync({ userId: user.id, pattern })
    if (!ok) { setError('Incorrect pattern. Please try again.'); return }
    setStep(2)
  }

  const handleNextFromNew = () => {
    if (newPassword.length < 4) { setError('Use at least 4 characters.'); return }
    setError('')
    setStep(3)
  }

  const handleConfirmPattern = (value: string) => {
    if (value !== newPattern) { setError("Patterns don't match. Please draw your pattern again."); return }
    setConfirmPattern(value)
    setError('')
    setStep(4)
  }

  const handleNextFromConfirm = () => {
    if (confirmPassword !== newPassword) { setError("Passwords don't match."); return }
    setError('')
    setStep(4)
  }

  const finish = async () => {
    if (!user) return
    setError('')
    try {
      await setPassword.mutateAsync({
        userId: user.id,
        lockType: targetLockType,
        ...(targetLockType === 'pattern' ? { pattern: newPattern } : { password: newPassword }),
        hint: hint.trim() || undefined,
      })
      onDone()
    } catch {
      setError('Could not update your Archive lock. Please try again.')
    }
  }

  const alternateLockType: LockType = lockType === 'pattern' ? 'password' : 'pattern'

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="change-archive-lock-title" className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-card shadow-[0_24px_90px_rgba(0,0,0,0.55)]" onClick={event => event.stopPropagation()}>
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-pink-500 via-fuchsia-500 to-violet-500" />
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500/15 to-violet-500/15 text-pink-500"><Lock className="h-5 w-5" /></div>
            <div><h2 id="change-archive-lock-title" className="font-semibold">Change Archive lock</h2><p className="text-xs text-muted-foreground">Update how you protect your Archive</p></div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-5 sm:p-6">
          {step === 1 && <>
            <p className="mb-4 text-sm text-muted-foreground">{lockType === 'pattern' ? 'Draw your current pattern to verify it is you.' : 'Enter your current password to verify it is you.'}</p>
            {lockType === 'pattern' ? <>
              <ArchivePatternLock key={`change-current-pattern-${legacyPatternGrid ? 4 : 3}`} gridSize={legacyPatternGrid ? 4 : 3} onComplete={handleVerifyOldPattern} disabled={verify.isPending} showIdleHint={false} />
            {error && !legacyPatternGrid && <button type="button" onClick={() => { setLegacyPatternGrid(true); setError('') }} className="mt-2 text-xs text-muted-foreground underline underline-offset-4">Use previous 4 × 4 pattern</button>}
            {legacyPatternGrid && <button type="button" onClick={() => { setLegacyPatternGrid(false); setError('') }} className="mt-2 text-xs text-muted-foreground underline underline-offset-4">Use 3 × 3 pattern</button>}
            </> : <>
              <input autoFocus type="password" value={oldPassword} onChange={event => setOldPassword(event.target.value)} onKeyDown={event => event.key === 'Enter' && handleVerifyOld()} placeholder="Current password" autoComplete="current-password" className="w-full rounded-2xl border border-border bg-muted/60 px-4 py-4 text-center text-lg tracking-[0.2em] outline-none transition focus:border-pink-500 focus:ring-2 focus:ring-pink-500/15" />
              <button type="button" onClick={handleVerifyOld} disabled={verify.isPending || !oldPassword} className="mt-4 w-full rounded-xl bg-gradient-to-r from-pink-500 to-violet-500 py-3 text-sm font-semibold text-white disabled:opacity-60">{verify.isPending ? 'Checking…' : 'Continue'}</button>
            </>}
          </>}

          {step === 2 && <>
            <div className="mb-4 flex justify-end"><button type="button" onClick={() => setShowLockPicker(true)} className="max-w-full text-right text-sm font-medium text-pink-500 underline underline-offset-4">Use different type lock</button></div>
            <p className="mb-4 text-sm text-muted-foreground">{targetLockType === 'pattern' ? 'Draw a new pattern. Connect at least four dots.' : 'Create your new password.'}</p>
            {targetLockType === 'pattern' ? <ArchivePatternLock key="change-new-pattern" onComplete={value => { setNewPattern(value); setError(''); setStep(3) }} /> : <>
              <input autoFocus type="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} placeholder="New password" autoComplete="new-password" className="w-full rounded-2xl border border-border bg-muted/60 px-4 py-4 text-center text-lg tracking-[0.2em] outline-none transition focus:border-pink-500" />
              <button type="button" onClick={handleNextFromNew} className="mt-4 w-full rounded-xl bg-gradient-to-r from-pink-500 to-violet-500 py-3 text-sm font-semibold text-white">Continue</button>
            </>}
          </>}

          {step === 3 && <>
            <p className="mb-4 text-sm text-muted-foreground">{targetLockType === 'pattern' ? 'Draw the same pattern again to confirm it.' : 'Enter your new password one more time.'}</p>
            {targetLockType === 'pattern' ? <ArchivePatternLock key="change-confirm-pattern" onComplete={handleConfirmPattern} /> : <>
              <input autoFocus type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} onKeyDown={event => event.key === 'Enter' && handleNextFromConfirm()} placeholder="Confirm new password" autoComplete="new-password" className="w-full rounded-2xl border border-border bg-muted/60 px-4 py-4 text-center text-lg tracking-[0.2em] outline-none transition focus:border-pink-500" />
              <button type="button" onClick={handleNextFromConfirm} className="mt-4 w-full rounded-xl bg-gradient-to-r from-pink-500 to-violet-500 py-3 text-sm font-semibold text-white">Continue</button>
            </>}
          </>}

          {step === 4 && <>
            <div className="mb-4 flex items-center gap-3 rounded-2xl bg-emerald-500/10 p-3 text-emerald-500"><ShieldCheck className="h-5 w-5 shrink-0" /><p className="text-sm font-medium">Your new {targetLockType === 'pattern' ? 'pattern' : 'password'} is confirmed.</p></div>
            <p className="mb-3 text-sm text-muted-foreground">Add an optional hint to help you remember your lock.</p>
            <input autoFocus type="text" value={hint} onChange={event => setHint(event.target.value)} placeholder="Lock hint (optional)" maxLength={80} className="w-full rounded-xl border border-border bg-muted/60 px-4 py-3 text-sm outline-none focus:border-pink-500" />
            <button type="button" onClick={finish} disabled={setPassword.isPending} className="mt-4 w-full rounded-xl bg-gradient-to-r from-pink-500 to-violet-500 py-3 text-sm font-semibold text-white disabled:opacity-60">{setPassword.isPending ? 'Saving your lock…' : 'Save Archive lock'}</button>
          </>}

          {error && <p role="alert" className="mt-3 text-center text-xs text-red-500">{error}</p>}
        </div>

        {showLockPicker && <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" onClick={() => setShowLockPicker(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="change-lock-picker-title" className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><h3 id="change-lock-picker-title" className="font-semibold">Choose your lock type</h3><button type="button" onClick={() => setShowLockPicker(false)} aria-label="Close lock type picker" className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button></div>
            <button type="button" onClick={() => chooseLock(alternateLockType)} className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition hover:border-primary hover:bg-primary/5">
              {alternateLockType === 'pattern' ? <Grid3X3 className="h-5 w-5 text-primary" /> : <KeyRound className="h-5 w-5 text-primary" />}
              <span className="flex-1"><span className="block text-sm font-semibold">{alternateLockType === 'pattern' ? 'Pattern Lock (3 × 3)' : 'Password Lock'}</span><span className="block text-xs text-muted-foreground">{alternateLockType === 'pattern' ? 'Connect dots to create a private pattern' : 'Unlock with your password'}</span></span>
            </button>
            <button type="button" onClick={() => setShowLockPicker(false)} className="mt-4 w-full rounded-xl bg-muted py-2.5 text-sm font-semibold hover:bg-accent">Cancel</button>
          </div>
        </div>}
      </div>
    </div>
  )
}
