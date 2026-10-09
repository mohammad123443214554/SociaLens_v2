'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ShieldCheck, Loader2 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Profile } from '@/lib/types/database.types'
import { getAvatarUrl, formatTimeAgo } from '@/lib/utils/helpers'
import { VerifiedBadge } from '@/components/shared/VerifiedBadge'
import { useUnsuspendUser } from '@/lib/hooks/useAdmin'

export function AdminSuspendedCard({ account }: { account: Profile }) {
  const unsuspendUser = useUnsuspendUser()
  const [confirming, setConfirming] = useState(false)

  const deadlinePassed = account.suspension_deadline ? new Date(account.suspension_deadline).getTime() < Date.now() : false

  return (
    <div className="rounded-2xl border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Link href={`/profile/${account.username}`} className="flex items-center gap-2 hover:underline min-w-0">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src={getAvatarUrl(account.avatar_url)} />
            <AvatarFallback className="text-xs">{account.username?.[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <span className="text-sm font-medium truncate flex items-center gap-1">
              {account.username}
              {account.is_verified && <VerifiedBadge type={account.verification_type} className="text-xs" />}
            </span>
            <span className="text-[10px] text-muted-foreground">Suspended {formatTimeAgo(account.suspended_at || account.created_at)}</span>
          </div>
        </Link>
        {deadlinePassed ? (
          <span className="text-[10px] text-red-500 font-medium shrink-0">Deletion pending</span>
        ) : (
          <span className="text-[10px] text-muted-foreground shrink-0">24h appeal window</span>
        )}
      </div>

      {account.suspension_reason && (
        <p className="text-sm bg-muted/60 rounded-lg px-3 py-2">
          <span className="text-muted-foreground text-xs block mb-0.5">Reason</span>
          {account.suspension_reason}
        </p>
      )}

      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          disabled={unsuspendUser.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 text-green-600 text-xs font-medium hover:bg-green-500/20 disabled:opacity-50"
        >
          <ShieldCheck className="h-3.5 w-3.5" /> Unsuspend
        </button>
      ) : (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Lift this suspension?</span>
          <button
            onClick={() => { unsuspendUser.mutate({ userId: account.id, username: account.username }); setConfirming(false) }}
            disabled={unsuspendUser.isPending}
            className="px-2.5 py-1 rounded-full bg-green-500 text-white text-xs font-medium flex items-center gap-1"
          >
            {unsuspendUser.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Yes, unsuspend'}
          </button>
          <button onClick={() => setConfirming(false)} className="px-2.5 py-1 rounded-full border text-xs">
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}  
