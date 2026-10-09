'use client'

import { useState } from 'react'
import Link from 'next/link'
import { X, Loader2 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Profile } from '@/lib/types/database.types'
import { getAvatarUrl } from '@/lib/utils/helpers'
import { VerifiedBadge } from '@/components/shared/VerifiedBadge'
import { useLiftRestriction, RestrictionFeature } from '@/lib/hooks/useAdmin'
import { daysRemaining } from '@/lib/utils/restrictionCheck'

const FEATURE_LABELS: Record<RestrictionFeature, string> = {
  post: 'Posting',
  comment: 'Commenting',
  message: 'Messaging',
  story: 'Stories',
}

export function AdminRestrictedCard({ account, feature, until }: { account: Profile; feature: RestrictionFeature; until: string }) {
  const liftRestriction = useLiftRestriction()
  const [confirming, setConfirming] = useState(false)
  const days = daysRemaining(until)

  return (
    <div className="rounded-2xl border p-4 flex items-center justify-between gap-3">
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
          <span className="text-[11px] text-amber-600">{FEATURE_LABELS[feature]} restricted &middot; {days} {days === 1 ? 'day' : 'days'} left</span>
        </div>
      </Link>

      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          disabled={liftRestriction.isPending}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-full border text-xs font-medium hover:bg-accent disabled:opacity-50 shrink-0"
        >
          <X className="h-3.5 w-3.5" /> Lift
        </button>
      ) : (
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => { liftRestriction.mutate({ userId: account.id, username: account.username, feature }); setConfirming(false) }}
            disabled={liftRestriction.isPending}
            className="px-2.5 py-1 rounded-full bg-amber-500 text-white text-xs font-medium flex items-center gap-1"
          >
            {liftRestriction.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Yes'}
          </button>
          <button onClick={() => setConfirming(false)} className="px-2.5 py-1 rounded-full border text-xs">
            No
          </button>
        </div>
      )}
    </div>
  )
}  
