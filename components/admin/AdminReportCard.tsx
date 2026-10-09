'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Ban, ShieldAlert, Check, ChevronDown } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ReportWithProfiles } from '@/lib/types/database.types'
import { getAvatarUrl, formatTimeAgo } from '@/lib/utils/helpers'
import { VerifiedBadge } from '@/components/shared/VerifiedBadge'
import {
  useReportTargetPreview,
  useSuspendUser,
  useRestrictUser,
  useDismissReport,
  RestrictionFeature,
} from '@/lib/hooks/useAdmin'

const REASON_LABELS: Record<string, string> = {
  spam: 'Spam',
  nudity: 'Nudity or sexual content',
  harassment: 'Harassment or bullying',
  fake_account: 'Fake account',
  hate_speech: 'Hate speech',
  other: 'Other',
}

const TARGET_LABELS: Record<string, string> = {
  post: 'Post',
  story: 'Story',
  comment: 'Comment',
  story_comment: 'Story comment',
  message: 'Message',
  user: 'Account',
}

const RESTRICTION_OPTIONS: { value: RestrictionFeature; label: string }[] = [
  { value: 'post', label: 'Posting' },
  { value: 'comment', label: 'Commenting' },
  { value: 'message', label: 'Messaging' },
  { value: 'story', label: 'Stories' },
]

export function AdminReportCard({ report, actionable }: { report: ReportWithProfiles; actionable: boolean }) {
  const { data: preview } = useReportTargetPreview(report)
  const suspendUser = useSuspendUser()
  const restrictUser = useRestrictUser()
  const dismissReport = useDismissReport()

  const [showRestrictMenu, setShowRestrictMenu] = useState(false)
  const [confirmingSuspend, setConfirmingSuspend] = useState(false)
  const busy = suspendUser.isPending || restrictUser.isPending || dismissReport.isPending

  const handleSuspend = () => {
    suspendUser.mutate({
      userId: report.reported_user_id,
      username: report.reported_user?.username ?? '',
      reason: `${REASON_LABELS[report.reason]}${report.details ? ` - ${report.details}` : ''}`,
      reportId: report.id,
    })
    setConfirmingSuspend(false)
  }

  const handleRestrict = (feature: RestrictionFeature) => {
    restrictUser.mutate({ userId: report.reported_user_id, username: report.reported_user?.username ?? '', feature, reportId: report.id })
    setShowRestrictMenu(false)
  }

  return (
    <div className="rounded-2xl border p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-sm min-w-0">
          <Link href={`/profile/${report.reporter?.username}`} className="flex items-center gap-1.5 shrink-0 hover:underline">
            <Avatar className="h-5 w-5"><AvatarImage src={getAvatarUrl(report.reporter?.avatar_url)} /><AvatarFallback className="text-[9px]">{report.reporter?.username?.[0]?.toUpperCase()}</AvatarFallback></Avatar>
            <span className="font-medium">{report.reporter?.username}</span>
            {report.reporter?.is_verified && <VerifiedBadge type={report.reporter.verification_type} className="text-xs" />}
          </Link>
          <span className="text-muted-foreground shrink-0">reported</span>
          <Link href={`/profile/${report.reported_user?.username}`} className="flex items-center gap-1.5 shrink-0 hover:underline">
            <Avatar className="h-5 w-5"><AvatarImage src={getAvatarUrl(report.reported_user?.avatar_url)} /><AvatarFallback className="text-[9px]">{report.reported_user?.username?.[0]?.toUpperCase()}</AvatarFallback></Avatar>
            <span className="font-medium">{report.reported_user?.username}</span>
            {report.reported_user?.is_verified && <VerifiedBadge type={report.reported_user.verification_type} className="text-xs" />}
          </Link>
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0">{formatTimeAgo(report.created_at)}</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="px-2 py-0.5 rounded-full bg-muted font-medium">{TARGET_LABELS[report.target_type]}</span>
        <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 font-medium">{REASON_LABELS[report.reason]}</span>
      </div>

      {report.details && (
        <p className="text-sm bg-muted/60 rounded-lg px-3 py-2">
          <span className="text-muted-foreground text-xs block mb-0.5">Reporter's note</span>
          {report.details}
        </p>
      )}

      {preview && (
        <p className="text-sm bg-muted/60 rounded-lg px-3 py-2">
          <span className="text-muted-foreground text-xs block mb-0.5">Content</span>
          "{preview}"
        </p>
      )}

      {actionable && (
        <div className="flex items-center gap-2 flex-wrap pt-1">
          {!confirmingSuspend ? (
            <button
              onClick={() => setConfirmingSuspend(true)}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/10 text-red-500 text-xs font-medium hover:bg-red-500/20 disabled:opacity-50"
            >
              <Ban className="h-3.5 w-3.5" /> Suspend
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Suspend this account?</span>
              <button onClick={handleSuspend} disabled={busy} className="px-2.5 py-1 rounded-full bg-red-500 text-white text-xs font-medium">
                Yes, suspend
              </button>
              <button onClick={() => setConfirmingSuspend(false)} className="px-2.5 py-1 rounded-full border text-xs">
                Cancel
              </button>
            </div>
          )}

          <div className="relative">
            <button
              onClick={() => setShowRestrictMenu(v => !v)}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-600 text-xs font-medium hover:bg-amber-500/20 disabled:opacity-50"
            >
              <ShieldAlert className="h-3.5 w-3.5" /> Restrict <ChevronDown className="h-3 w-3" />
            </button>
            {showRestrictMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowRestrictMenu(false)} />
                <div className="absolute left-0 top-full mt-1 bg-card border rounded-xl shadow-xl overflow-hidden w-40 z-40">
                  {RESTRICTION_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => handleRestrict(opt.value)}
                      className="w-full text-left px-3.5 py-2.5 text-sm hover:bg-muted"
                    >
                      {opt.label} (10 days)
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => dismissReport.mutate({ reportId: report.id })}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium hover:bg-accent disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" /> Dismiss
          </button>
        </div>
      )}
    </div>
  )
}  
