'use client'

import { useState } from 'react'
import { X, Lock, Grid3X3, KeyRound, ShieldCheck, ArrowLeft } from 'lucide-react'
import { useUser } from '@/lib/hooks/useUser'
import { useSetArchivePassword } from '@/lib/hooks/useChatSettings'
import { ArchivePatternLock } from './ArchivePatternLock'

interface ArchivePasswordWizardProps {
  onClose: () => void
  onDone: () => void
}

type LockType = 'password' | 'pattern' | 'pattern4'

export function ArchivePasswordWizard({ onClose, onDone }: ArchivePasswordWizardProps) {
  const { user } = useUser()
  const setPassword = useSetArchivePassword()
  const [lockType, setLockType] = useState<LockType>('password')
  const [showLockPicker, setShowLockPicker] = useState(false)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [newPattern, setNewPattern] = useState('')
  const [confirmPattern, setConfirmPattern] = useState('')
  const [hint, setHint] = useState('')
  const [error, setError] = useState('')

  const chooseLock = (type: LockType) => {
    setLockType(type)
    setStep(1)
    setError('')
    setNewPassword('')
    setConfirmPassword('')
    setNewPattern('')
    setConfirmPattern('')
    setShowLockPicker(false)
  }

  const handleNextFromNew = () => {
    if (newPassword.length < 4) { setError('Use at least 4 characters.'); return }
    setError('')
    setStep(2)
  }

  const handleNextFromConfirm = () => {
    if (confirmPassword !== newPassword) { setError("Passwords don't match."); return }
    setError('')
    setStep(3)
  }

  const handleNewPattern = (value: string) => {
    setNewPattern(value)
    setError('')
    setStep(2)
  }

  const handleConfirmPattern = (value: string) => {
    if (value !== newPattern) {
      setError("Patterns don't match. Please draw your pattern again.")
      setConfirmPattern('')
      return
    }
    setConfirmPattern(value)
    setError('')
    setStep(3)
  }

  const finish = async () => {
    if (!user) return
    setError('')
    try {
      await setPassword.mutateAsync({
        userId: user.id,
        lockType,
        ...(lockType === 'password' ? { password: newPassword } : { pattern: newPattern }),
        hint: hint.trim() || undefined,
      })
      onDone()
    } catch {
      setError('Could not save your Archive lock. Please try again.')
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="archive-setup-title" className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-card shadow-[0_24px_90px_rgba(0,0,0,0.55)]" onClick={event => event.stopPropagation()}>
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-pink-500 via-fuchsia-500 to-violet-500" />
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500/15 to-violet-500/15 text-pink-500"><Lock className="h-5 w-5" /></div>
            <div><h2 id="archive-setup-title" className="font-semibold">Protect your Archive</h2><p className="text-xs text-muted-foreground">Private conversations, secured your way</p></div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close setup" className="rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-5 sm:p-6">
          <div className="mb-5 flex justify-end"><button type="button" onClick={() => setShowLockPicker(true)} className="max-w-full text-right text-sm font-medium text-pink-500 underline underline-offset-4">Use different type lock</button></div>

          {lockType === 'password' && step === 1 && <>
            <p className="mb-4 text-sm leading-6 text-muted-foreground">Create a password to protect your Archive. You’ll need it every time you open it.</p>
            <input autoFocus type="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} onKeyDown={event => event.key === 'Enter' && handleNextFromNew()} placeholder="New password" autoComplete="new-password" className="w-full rounded-2xl border border-border bg-muted/60 px-4 py-4 text-center text-lg tracking-[0.2em] outline-none transition focus:border-pink-500 focus:ring-2 focus:ring-pink-500/15" />
            <button type="button" onClick={handleNextFromNew} className="mt-4 w-full rounded-xl bg-gradient-to-r from-pink-500 to-violet-500 py-3 text-sm font-semibold text-white shadow-lg shadow-pink-500/15 transition hover:brightness-110">Continue</button>
          </>}

          {lockType === 'password' && step === 2 && <>
            <button type="button" onClick={() => setStep(1)} className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3 w-3" /> Back</button>
            <p className="mb-4 text-sm text-muted-foreground">Enter your password one more time to confirm it.</p>
            <input autoFocus type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} onKeyDown={event => event.key === 'Enter' && handleNextFromConfirm()} placeholder="Confirm password" autoComplete="new-password" className="w-full rounded-2xl border border-border bg-muted/60 px-4 py-4 text-center text-lg tracking-[0.2em] outline-none transition focus:border-pink-500 focus:ring-2 focus:ring-pink-500/15" />
            <button type="button" onClick={handleNextFromConfirm} className="mt-4 w-full rounded-xl bg-gradient-to-r from-pink-500 to-violet-500 py-3 text-sm font-semibold text-white">Continue</button>
          </>}

          {lockType !== 'password' && step === 1 && <>
            <p className="mb-3 text-sm leading-6 text-muted-foreground">Draw a unique pattern on the {lockType === 'pattern4' ? '4 × 4' : '3 × 3'} grid. Connect at least four dots.</p>
            <ArchivePatternLock key={`new-pattern-${lockType}`} gridSize={lockType === 'pattern4' ? 4 : 3} onComplete={handleNewPattern} />
          </>}

          {lockType !== 'password' && step === 2 && <>
            <button type="button" onClick={() => { setStep(1); setNewPattern(''); setError('') }} className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3 w-3" /> Draw again</button>
            <p className="mb-3 text-sm text-muted-foreground">Draw the same pattern again to confirm it.</p>
            <ArchivePatternLock key={`confirm-pattern-${lockType}`} gridSize={lockType === 'pattern4' ? 4 : 3} onComplete={handleConfirmPattern} />
          </>}

          {step === 3 && <>
            <div className="mb-4 flex items-center gap-3 rounded-2xl bg-emerald-500/10 p-3 text-emerald-500"><ShieldCheck className="h-5 w-5 shrink-0" /><p className="text-sm font-medium">{lockType !== 'password' ? 'Pattern confirmed successfully.' : 'Password confirmed successfully.'}</p></div>
            <p className="mb-3 text-sm text-muted-foreground">Add an optional hint to help you remember your lock.</p>
            <input autoFocus type="text" value={hint} onChange={event => setHint(event.target.value)} placeholder="Lock hint (optional)" maxLength={80} className="w-full rounded-xl border border-border bg-muted/60 px-4 py-3 text-sm outline-none focus:border-pink-500" />
            <button type="button" onClick={finish} disabled={setPassword.isPending} className="mt-4 w-full rounded-xl bg-gradient-to-r from-pink-500 to-violet-500 py-3 text-sm font-semibold text-white shadow-lg shadow-pink-500/15 disabled:opacity-60">{setPassword.isPending ? 'Saving your lock…' : 'Save Archive lock'}</button>
          </>}

          {error && <p role="alert" className="mt-3 text-center text-xs text-red-500">{error}</p>}
        </div>

        {showLockPicker && <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" onClick={() => setShowLockPicker(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="lock-picker-title" className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><h3 id="lock-picker-title" className="font-semibold">Use a different lock</h3><button type="button" onClick={() => setShowLockPicker(false)} aria-label="Close lock type picker" className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button></div>
            <div className="space-y-2">
              {(['pattern', 'pattern4'] as const).map(type => <button key={type} type="button" onClick={() => chooseLock(type)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${lockType === type ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'}`}><Grid3X3 className="h-5 w-5 text-primary" /><span className="flex-1"><span className="block text-sm font-semibold">Pattern Lock ({type === 'pattern4' ? '4 × 4' : '3 × 3'})</span><span className="block text-xs text-muted-foreground">Connect dots to create a private pattern</span></span></button>)}
            </div>
            <button type="button" onClick={() => setShowLockPicker(false)} className="mt-4 w-full rounded-xl bg-muted py-2.5 text-sm font-semibold hover:bg-accent">Cancel</button>
          </div>
        </div>}
      </div>
    </div>
  )
}
