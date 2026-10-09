'use client'

import Link from 'next/link'
import { Check, RotateCcw, Loader2 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ContactSubmissionWithProfile, useResolveContactSubmission } from '@/lib/hooks/useAdmin'
import { getAvatarUrl, formatTimeAgo } from '@/lib/utils/helpers'
import { VerifiedBadge } from '@/components/shared/VerifiedBadge'

export function AdminContactCard({ submission }: { submission: ContactSubmissionWithProfile }) {
  const resolve = useResolveContactSubmission()
  const username = submission.profiles?.username ?? ''
  const resolved = submission.status === 'resolved'

  return (
    <div className="rounded-2xl border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Link href={`/profile/${username}`} className="flex items-center gap-2 hover:underline min-w-0">
          <Avatar className="h-6 w-6 shrink-0">
            <AvatarImage src={getAvatarUrl(submission.profiles?.avatar_url)} />
            <AvatarFallback className="text-[9px]">{username?.[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium truncate">@{username}</span>
          {submission.profiles?.is_verified && <VerifiedBadge type={submission.profiles.verification_type} className="text-xs" />}
        </Link>
        <span className="text-[10px] text-muted-foreground shrink-0">{formatTimeAgo(submission.created_at)}</span>
      </div>

      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">From: <span className="font-medium text-foreground">{submission.name}</span></p>
        <p className="text-sm bg-muted/60 rounded-lg px-3 py-2 whitespace-pre-wrap">{submission.message}</p>
      </div>

      {submission.media_url && (
        submission.media_type === 'video' ? (
          <video src={submission.media_url} controls className="w-full max-h-64 rounded-xl border bg-black object-contain" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={submission.media_url} alt="Attachment" className="w-full max-h-64 rounded-xl border object-contain bg-muted" />
        )
      )}

      <div className="flex items-center gap-2 pt-1">
        {!resolved ? (
          <button
            onClick={() => resolve.mutate({ id: submission.id, resolved: true })}
            disabled={resolve.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 text-green-600 text-xs font-medium hover:bg-green-500/20 disabled:opacity-50"
          >
            {resolve.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Mark as resolved
          </button>
        ) : (
          <button
            onClick={() => resolve.mutate({ id: submission.id, resolved: false })}
            disabled={resolve.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium hover:bg-accent disabled:opacity-50"
          >
            {resolve.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Reopen
          </button>
        )}
      </div>
    </div>
  )
}
