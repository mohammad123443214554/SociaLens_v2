'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Users, Search, Lock, ShieldCheck, Ban } from 'lucide-react'
import { useUser } from '@/lib/hooks/useUser'
import { PageLoader } from '@/components/shared/LoadingSpinner'
import { useAdminAccountsList } from '@/lib/hooks/useAdminAccounts'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { VerifiedBadge } from '@/components/shared/VerifiedBadge'
import { getAvatarUrl, formatCount } from '@/lib/utils/helpers'

export default function AdminAccountsPage() {
  const { profile, loading } = useUser()
  const [search, setSearch] = useState('')
  const { data: accounts = [], isLoading } = useAdminAccountsList(search)

  if (loading) return <PageLoader />

  if (!profile?.is_admin) {
    return (
      <div className="max-w-xl mx-auto p-4">
        <p className="text-sm text-muted-foreground text-center py-16">You don't have access to this page.</p>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/settings/admin" className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <Users className="h-5 w-5 text-purple-500" />
        <h1 className="text-xl font-bold">Accounts</h1>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by username or name..."
          className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-muted text-sm outline-none focus:ring-2 focus:ring-pink-500/40"
        />
      </div>

      <div className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-10">Loading...</p>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">No accounts found.</p>
        ) : (
          accounts.map(account => (
            <Link
              key={account.id}
              href={`/settings/admin/accounts/${account.id}`}
              className="flex items-center gap-3 rounded-2xl border p-3 hover:bg-accent transition-colors"
            >
              <Avatar className="h-11 w-11 shrink-0">
                <AvatarImage src={getAvatarUrl(account.avatar_url)} />
                <AvatarFallback>{account.username?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium truncate">{account.username}</span>
                  {account.is_private && <Lock className="h-3 w-3 text-muted-foreground shrink-0" />}
                  {account.is_verified && <VerifiedBadge type={account.verification_type} className="text-xs" />}
                  {account.is_admin && <ShieldCheck className="h-3 w-3 text-pink-500 shrink-0" />}
                  {account.is_suspended && <Ban className="h-3 w-3 text-red-500 shrink-0" />}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {account.full_name || 'No name'} &middot; {formatCount(account.posts_count)} posts &middot; {formatCount(account.followers_count)} followers
                </p>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  )
} 
