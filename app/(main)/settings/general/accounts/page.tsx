'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Plus, Users, X, Check } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useUser } from '@/lib/hooks/useUser'
import { getAvatarUrl } from '@/lib/utils/helpers'
import { PageLoader } from '@/components/shared/LoadingSpinner'
import { useAccountSwitcher } from '@/lib/hooks/useAccountSwitcher'

export default function MultipleAccountsPage() {
  const { user, profile, loading } = useUser()
  const { accounts, addAccount, switchToAccount, removeAccount } = useAccountSwitcher()

  const [showAddAccount, setShowAddAccount] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [adding, setAdding] = useState(false)
  const [switching, setSwitching] = useState<string | null>(null)
  const [error, setError] = useState('')

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setAdding(true)
    try {
      await addAccount(email, password)
      setShowAddAccount(false)
      setEmail('')
      setPassword('')
    } catch (err: any) {
      setError(err.message || 'Could not add that account.')
    } finally {
      setAdding(false)
    }
  }

  const handleSwitch = async (account: (typeof accounts)[number]) => {
    setSwitching(account.userId)
    try {
      await switchToAccount(account)
    } catch (err: any) {
      setError(err.message || 'Could not switch to that account.')
      setSwitching(null)
    }
  }

  if (loading) return <PageLoader />
  if (!profile) return null

  const otherAccounts = accounts.filter(a => a.userId !== user?.id)

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/settings/general" className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold">Multiple Accounts</h1>
      </div>

      <Card>
        <CardContent className="pt-4 divide-y">
          <div className="flex items-center gap-3 py-3">
            <Avatar className="h-9 w-9">
              <AvatarImage src={getAvatarUrl(profile.avatar_url)} />
              <AvatarFallback>{profile.username?.[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{profile.username}</p>
              <p className="text-xs text-muted-foreground">Currently active</p>
            </div>
            <Check className="h-4 w-4 text-green-500" />
          </div>

          {otherAccounts.map(account => (
            <button
              key={account.userId}
              onClick={() => handleSwitch(account)}
              disabled={switching === account.userId}
              className="w-full flex items-center gap-3 py-3 hover:text-pink-500 transition-colors disabled:opacity-60"
            >
              <Avatar className="h-9 w-9">
                <AvatarImage src={getAvatarUrl(account.avatarUrl)} />
                <AvatarFallback>{account.username?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium truncate">{account.username}</p>
                <p className="text-xs text-muted-foreground">{switching === account.userId ? 'Switching...' : 'Tap to switch'}</p>
              </div>
              <span
                onClick={e => { e.stopPropagation(); removeAccount(account.userId) }}
                className="text-muted-foreground hover:text-red-500 p-1"
              >
                <X className="h-4 w-4" />
              </span>
            </button>
          ))}

          <button
            onClick={() => setShowAddAccount(true)}
            className="w-full flex items-center gap-3 py-3 text-pink-500 hover:text-pink-600 transition-colors"
          >
            <div className="h-9 w-9 rounded-full border-2 border-dashed border-pink-500/40 flex items-center justify-center">
              <Plus className="h-4 w-4" />
            </div>
            <span className="text-sm font-medium">Add Account</span>
          </button>
        </CardContent>
      </Card>

      {error && <p className="text-xs text-red-500 px-1">{error}</p>}

      {showAddAccount && (
        <div
          className="fixed inset-0 bg-black/60 z-[100] flex items-end sm:items-center justify-center p-4"
          onClick={() => { setShowAddAccount(false); setError('') }}
        >
          <form
            onSubmit={handleAddAccount}
            className="bg-card rounded-2xl w-full max-w-sm p-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-pink-500" />
              <p className="font-semibold">Add another account</p>
            </div>
            <p className="text-xs text-muted-foreground mb-3">Log in with a different SociaLens account to add it here.</p>

            <div className="space-y-2">
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full bg-muted rounded-xl px-3 py-2 text-sm outline-none border border-transparent focus:border-pink-500"
              />
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full bg-muted rounded-xl px-3 py-2 text-sm outline-none border border-transparent focus:border-pink-500"
              />
            </div>

            {error && <p className="text-xs text-red-500 mt-2">{error}</p>}

            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => { setShowAddAccount(false); setError('') }}
                className="flex-1 py-2 rounded-xl border text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={adding}
                className="flex-1 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white text-sm font-medium disabled:opacity-50"
              >
                {adding ? 'Adding...' : 'Add'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
