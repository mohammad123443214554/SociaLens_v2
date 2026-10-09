'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Trash2, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/hooks/useUser'
import Link from 'next/link'

export default function DeleteAccountPage() {
  const { user } = useUser()
  const router = useRouter()
  const [step, setStep] = useState<'confirm' | 'deleting' | 'done'>('confirm')
  const [error, setError] = useState('')
  const [typed, setTyped] = useState('')
  const supabase = createClient()

  const handleDelete = async () => {
    if (!user) return
    setStep('deleting')
    setError('')

    try {
      const res = await fetch('/api/account/delete', { method: 'POST' })
      const result = await res.json()

      if (!res.ok) {
        setError(result.error || 'Something went wrong. Please try again.')
        setStep('confirm')
        return
      }

      // Account and all data are gone server-side - just clear the local session now.
      await supabase.auth.signOut()

      setStep('done')
      setTimeout(() => router.push('/'), 3000)
    } catch (err) {
      setError('Something went wrong. Please try again.')
      setStep('confirm')
    }
  }

  if (step === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl">👋</div>
          <h1 className="text-2xl font-bold">Account Deleted</h1>
          <p className="text-muted-foreground">Your SociaLens account and all data has been permanently deleted.</p>
          <p className="text-sm text-muted-foreground">Redirecting to home...</p>
        </div>
      </div>
    )
  }

  if (step === 'deleting') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="h-12 w-12 rounded-full border-4 border-red-500/20 border-t-red-500 animate-spin mx-auto" />
          <p className="font-semibold">Deleting your account...</p>
          <p className="text-sm text-muted-foreground">Please wait, do not close this page.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto p-4 space-y-6">
      {/* Back button */}
      <Link href="/settings" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors w-fit">
        <ArrowLeft className="h-4 w-4" />
        <span className="text-sm">Back to Settings</span>
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-xl bg-red-500/10">
          <Trash2 className="h-6 w-6 text-red-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-red-500">Delete Account</h1>
          <p className="text-sm text-muted-foreground">This action cannot be undone</p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Warning box */}
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-red-500">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="font-semibold text-sm">What will be permanently deleted:</p>
          </div>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {[
              'Your profile and all personal information',
              'All posts, reels and photos you uploaded',
              'All your messages and conversations',
              'Your followers and following list',
              'All likes, comments and notifications',
              'Everything associated with your account',
            ].map((item, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="text-red-400">•</span> {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Type confirmation */}
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Type <span className="font-bold text-red-500">DELETE</span> to confirm:
          </p>
          <Input
            value={typed}
            onChange={e => setTyped(e.target.value.toUpperCase())}
            placeholder="Type DELETE here"
            className={`border-red-500/30 focus:border-red-500 ${error ? 'border-red-500' : ''}`}
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="flex gap-3">
          <Link href="/settings" className="flex-1">
            <Button variant="outline" className="w-full">Cancel</Button>
          </Link>
          <Button
            variant="destructive"
            className="flex-1 gap-2"
            disabled={typed !== 'DELETE'}
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4" />
            Delete Forever
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Account: <span className="font-medium">{user?.email}</span>
        </p>
      </div>
    </div>
  )
}
