'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Lock, ShieldCheck, Ban, Grid3x3, MessageSquare, Clapperboard, MessageCircle, Heart, Gavel } from 'lucide-react'
import { useUser } from '@/lib/hooks/useUser'
import { PageLoader } from '@/components/shared/LoadingSpinner'
import { useAdminAccount } from '@/lib/hooks/useAdminAccounts'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { VerifiedBadge } from '@/components/shared/VerifiedBadge'
import { getAvatarUrl, formatCount } from '@/lib/utils/helpers'

const OPTIONS = [
  { href: 'posts', label: 'All Post', desc: "This account's posts", icon: Grid3x3, color: 'text-blue-500 bg-blue-500/10' },
  { href: 'comments', label: 'All Post Comment', desc: 'Comments this account made', icon: MessageSquare, color: 'text-green-500 bg-green-500/10' },
  { href: 'stories', label: 'All Story', desc: 'Stories currently live', icon: Clapperboard, color: 'text-amber-500 bg-amber-500/10' },
  { href: 'story-comments', label: 'All Story Comment', desc: "Comments on this account's stories", icon: MessageCircle, color: 'text-orange-500 bg-orange-500/10' },
  { href: 'likes', label: 'All Like', desc: 'Posts this account has liked', icon: Heart, color: 'text-pink-500 bg-pink-500/10' },
  { href: 'action', label: 'Action', desc: 'Suspend, restrict, or delete', icon: Gavel, color: 'text-red-500 bg-red-500/10' },
]

export default function AdminAccountInfoPage() {
  const params = useParams()
  const userId = params.userId as string
  const { profile, loading } = useUser()
  const { data: account, isLoading } = useAdminAccount(userId)

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
        <Link href="/settings/admin/accounts" className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold truncate">{account ? `${account.username} - Account Information` : 'Account Information'}</h1>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-10">Loading...</p>
      ) : !account ? (
        <p className="text-sm text-muted-foreground text-center py-10">Account not found.</p>
      ) : (
        <>
          <div className="rounded-2xl border p-4 flex items-center gap-3">
            <Avatar className="h-14 w-14 shrink-0">
              <AvatarImage src={getAvatarUrl(account.avatar_url)} />
              <AvatarFallback>{account.username?.[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold truncate">{account.username}</span>
                {account.is_private && <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                {account.is_verified && <VerifiedBadge type={account.verification_type} className="text-base" />}
                {account.is_admin && <ShieldCheck className="h-3.5 w-3.5 text-pink-500 shrink-0" />}
                {account.is_suspended && <Ban className="h-3.5 w-3.5 text-red-500 shrink-0" />}
              </div>
              {account.full_name && <p className="text-sm text-muted-foreground truncate">{account.full_name}</p>}
              <p className="text-xs text-muted-foreground mt-1">
                {formatCount(account.posts_count)} posts &middot; {formatCount(account.followers_count)} followers &middot; {formatCount(account.following_count)} following
              </p>
            </div>
          </div>

          <div className="rounded-2xl border divide-y overflow-hidden">
            {OPTIONS.map(opt => (
              <Link
                key={opt.href}
                href={`/settings/admin/accounts/${userId}/${opt.href}`}
                className="flex items-center justify-between p-4 hover:bg-accent transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${opt.color}`}>
                    <opt.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-sm font-medium block">{opt.label}</span>
                    <span className="text-xs text-muted-foreground">{opt.desc}</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
} 
