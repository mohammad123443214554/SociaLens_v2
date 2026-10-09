'use client'

import Link from 'next/link'
import { ChevronLeft, ChevronRight, ShieldCheck, Flag, Users, Headset } from 'lucide-react'
import { useUser } from '@/lib/hooks/useUser'
import { PageLoader } from '@/components/shared/LoadingSpinner'
import { usePendingReportsCount, usePendingContactCount } from '@/lib/hooks/useAdmin'

export default function AdminPanelPage() {
  const { profile, loading } = useUser()
  const { data: pendingCount = 0 } = usePendingReportsCount()
  const { data: pendingContactCount = 0 } = usePendingContactCount()

  if (loading) return <PageLoader />

  // Not the admin account - Nothing here for them, Same treatment as any
  // Other page that doesn't apply to the current user.
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
        <Link href="/settings" className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <ShieldCheck className="h-5 w-5 text-pink-500" />
        <h1 className="text-xl font-bold">Admin Panel</h1>
      </div>

      <div className="rounded-2xl border divide-y overflow-hidden">
        <Link
          href="/settings/admin/reports"
          className="flex items-center justify-between p-4 hover:bg-accent transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-pink-500/10 flex items-center justify-center shrink-0">
              <Flag className="h-5 w-5 text-pink-500" />
            </div>
            <div>
              <span className="text-sm font-medium block">Reports</span>
              <span className="text-xs text-muted-foreground">Review reports, appeals, suspensions & restrictions</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {pendingCount > 0 && (
              <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-medium">
                {pendingCount}
              </span>
            )}
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </Link>

        <Link
          href="/settings/admin/accounts"
          className="flex items-center justify-between p-4 hover:bg-accent transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center shrink-0">
              <Users className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <span className="text-sm font-medium block">Accounts</span>
              <span className="text-xs text-muted-foreground">Browse every account's posts, comments, stories & likes</span>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </Link>

        <Link
          href="/settings/admin/contact"
          className="flex items-center justify-between p-4 hover:bg-accent transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-cyan-500/10 flex items-center justify-center shrink-0">
              <Headset className="h-5 w-5 text-cyan-500" />
            </div>
            <div>
              <span className="text-sm font-medium block">Contact</span>
              <span className="text-xs text-muted-foreground">Messages submitted via Contact Support</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {pendingContactCount > 0 && (
              <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-medium">
                {pendingContactCount}
              </span>
            )}
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </Link>
      </div>
    </div>
  )
}
