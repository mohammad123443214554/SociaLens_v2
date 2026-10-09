'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Ban, Check, Trash2 } from 'lucide-react'
import { useUser } from '@/lib/hooks/useUser'
import { PageLoader } from '@/components/shared/LoadingSpinner'
import { useActiveSuspensions, useSuspensionHistory } from '@/lib/hooks/useAdmin'
import { AdminSuspendedCard } from '@/components/admin/AdminSuspendedCard'
import { formatTimeAgo } from '@/lib/utils/helpers'

type Section = 'active' | 'history'

export default function SuspendedAccountsPage() {
  const { profile, loading } = useUser()
  const [section, setSection] = useState<Section>('active')
  const { data: active = [], isLoading: activeLoading } = useActiveSuspensions()
  const { data: history = [], isLoading: historyLoading } = useSuspensionHistory()

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
        <Link href="/settings/admin/reports" className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <Ban className="h-5 w-5 text-red-500" />
        <h1 className="text-xl font-bold">Suspended Accounts</h1>
      </div>

      <div className="flex gap-1 bg-muted rounded-xl p-1">
        <button
          onClick={() => setSection('active')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${section === 'active' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
        >
          Active
          {active.length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[10px]">
              {active.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setSection('history')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${section === 'history' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
        >
          History
        </button>
      </div>

      <div className="space-y-3">
        {section === 'active' ? (
          activeLoading ? (
            <p className="text-sm text-muted-foreground text-center py-10">Loading...</p>
          ) : active.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">No suspended accounts right now.</p>
          ) : (
            active.map(account => <AdminSuspendedCard key={account.id} account={account} />)
          )
        ) : historyLoading ? (
          <p className="text-sm text-muted-foreground text-center py-10">Loading...</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">No history yet.</p>
        ) : (
          history.map(log => (
            <div key={log.id} className="rounded-2xl border p-4 flex items-start gap-3">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${log.action === 'unsuspend' ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                {log.action === 'unsuspend' ? <Check className="h-4 w-4 text-green-600" /> : <Trash2 className="h-4 w-4 text-red-500" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-medium">@{log.target_username}</span>{' '}
                  {log.action === 'unsuspend' ? 'was unsuspended' : 'was permanently deleted'}
                </p>
                {log.reason && <p className="text-xs text-muted-foreground mt-0.5">{log.reason}</p>}
                <p className="text-[10px] text-muted-foreground mt-1">{formatTimeAgo(log.created_at)}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
} 
