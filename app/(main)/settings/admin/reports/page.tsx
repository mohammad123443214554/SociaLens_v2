'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Flag, Ban, ShieldAlert, ChevronRight } from 'lucide-react'
import { useUser } from '@/lib/hooks/useUser'
import { PageLoader } from '@/components/shared/LoadingSpinner'
import { useReports, usePendingAppeals, useActiveSuspensions, useActiveRestrictions, ReportStatusFilter } from '@/lib/hooks/useAdmin'
import { AdminReportCard } from '@/components/admin/AdminReportCard'
import { AdminAppealCard } from '@/components/admin/AdminAppealCard'

type Tab = ReportStatusFilter | 'appeals'

const TABS: { value: Tab; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'appeals', label: 'Appeals' },
  { value: 'actioned', label: 'Actioned' },
  { value: 'dismissed', label: 'Dismissed' },
]

export default function AdminReportsPage() {
  const { profile, loading } = useUser()
  const [tab, setTab] = useState<Tab>('pending')
  const isReportsTab = tab === 'pending' || tab === 'actioned' || tab === 'dismissed'
  const { data: reports = [], isLoading: reportsLoading } = useReports(isReportsTab ? tab : 'pending')
  const { data: appeals = [], isLoading: appealsLoading } = usePendingAppeals()
  const { data: suspended = [] } = useActiveSuspensions()
  const { data: restricted = [] } = useActiveRestrictions()

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
        <Flag className="h-5 w-5 text-pink-500" />
        <h1 className="text-xl font-bold">Reports</h1>
      </div>

      {/* Quick links to the accounts currently under a suspension/restriction,
          Regardless of which report (if any) put them there. */}
      <div className="grid grid-cols-2 gap-2">
        <Link
          href="/settings/admin/reports/suspended"
          className="flex items-center justify-between gap-2 rounded-xl border p-3 hover:bg-accent transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Ban className="h-4 w-4 text-red-500 shrink-0" />
            <div className="min-w-0">
              <span className="text-sm font-medium block truncate">Suspended</span>
              <span className="text-xs text-muted-foreground">{suspended.length} active</span>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </Link>
        <Link
          href="/settings/admin/reports/restricted"
          className="flex items-center justify-between gap-2 rounded-xl border p-3 hover:bg-accent transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0" />
            <div className="min-w-0">
              <span className="text-sm font-medium block truncate">Restricted</span>
              <span className="text-xs text-muted-foreground">{restricted.length} active</span>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </Link>
      </div>

      <div className="flex gap-1 bg-muted rounded-xl p-1 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap px-2 ${
              tab === t.value ? 'bg-card shadow-sm' : 'text-muted-foreground'
            }`}
          >
            {t.label}
            {t.value === 'appeals' && appeals.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[10px]">
                {appeals.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {tab === 'appeals' ? (
          appealsLoading ? (
            <p className="text-sm text-muted-foreground text-center py-10">Loading appeals...</p>
          ) : appeals.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">No pending appeals.</p>
          ) : (
            appeals.map(appeal => <AdminAppealCard key={appeal.id} appeal={appeal} />)
          )
        ) : reportsLoading ? (
          <p className="text-sm text-muted-foreground text-center py-10">Loading reports...</p>
        ) : reports.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">No {tab} reports.</p>
        ) : (
          reports.map(report => (
            <AdminReportCard key={report.id} report={report} actionable={tab === 'pending'} />
          ))
        )}
      </div>
    </div>
  )
}
