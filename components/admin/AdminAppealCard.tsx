'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, X, Trash2, Loader2 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { AppealWithProfile, useReviewAppeal, usePermanentlyDeleteAppealUser } from '@/lib/hooks/useAdmin'
import { getAvatarUrl, formatTimeAgo } from '@/lib/utils/helpers'
import { VerifiedBadge } from '@/components/shared/VerifiedBadge'

export function AdminAppealCard({ appeal }: { appeal: AppealWithProfile }) {
  const reviewAppeal = useReviewAppeal()
  const deleteUser = usePermanentlyDeleteAppealUser()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const username = appeal.profiles?.username ?? ''
  const busy = reviewAppeal.isPending || deleteUser.isPending

  const handlePermanentDelete = async () => {
    setDeleteError(null)
    try {
      await deleteUser.mutateAsync({
        userId: appeal.user_id,
        appealId: appeal.id,
        reason: `Appeal rejected as not genuine - ${username}`,
      })
      setConfirmingDelete(false)
    } catch (err: any) {
      setDeleteError(err.message || 'Could not delete that account.')
    }
  }

  return (
    <div className="rounded-2xl border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Link href={`/profile/${username}`} className="flex items-center gap-2 hover:underline">
          <Avatar className="h-6 w-6">
            <AvatarImage src={getAvatarUrl(appeal.profiles?.avatar_url)} />
            <AvatarFallback className="text-[9px]">{username?.[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium">{username}</span>
          {appeal.profiles?.is_verified && <VerifiedBadge type={appeal.profiles.verification_type} className="text-xs" />}
        </Link>
        <span className="text-[10px] text-muted-foreground">{formatTimeAgo(appeal.created_at)}</span>
      </div>

      <div className="flex gap-3">
        {/* Eslint-disable-next-line @next/next/no-img-element */}
        <img src={appeal.photo_url} alt="Appeal photo" className="h-20 w-20 rounded-xl object-cover border shrink-0" />
        <p className="text-sm bg-muted/60 rounded-lg px-3 py-2 flex-1">{appeal.letter}</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap pt-1">
        <button
          onClick={() => reviewAppeal.mutate({ appealId: appeal.id, userId: appeal.user_id, username, approve: true })}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 text-green-600 text-xs font-medium hover:bg-green-500/20 disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" /> Approve & Unsuspend
        </button>
        <button
          onClick={() => reviewAppeal.mutate({ appealId: appeal.id, userId: appeal.user_id, username, approve: false })}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium hover:bg-accent disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" /> Reject
        </button>

        {!confirmingDelete ? (
          <button
            onClick={() => setConfirmingDelete(true)}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/10 text-red-500 text-xs font-medium hover:bg-red-500/20 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete permanently
          </button>
        ) : (
          <div className="flex items-center gap-1.5 w-full bg-red-500/5 border border-red-500/20 rounded-xl p-2.5 mt-1">
            <span className="text-xs text-red-500 flex-1">
              This permanently deletes @{username}'s account - posts, messages, everything. This can't be undone.
            </span>
            <button
              onClick={handlePermanentDelete}
              disabled={busy}
              className="px-2.5 py-1 rounded-full bg-red-500 text-white text-xs font-medium shrink-0 flex items-center gap-1"
            >
              {deleteUser.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Yes, delete'}
            </button>
            <button onClick={() => setConfirmingDelete(false)} disabled={busy} className="px-2.5 py-1 rounded-full border text-xs shrink-0">
              Cancel
            </button>
          </div>
        )}
        {deleteError && <p className="text-xs text-red-500 w-full">{deleteError}</p>}
      </div>
    </div>
  )
} 
