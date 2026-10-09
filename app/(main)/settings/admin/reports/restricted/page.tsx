'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ShieldAlert, Ban, ShieldCheck } from 'lucide-react'
import { useUser } from '@/lib/hooks/useUser'
import { PageLoader } from '@/components/shared/LoadingSpinner'
import { useActiveRestrictions, useRestrictionHistory, RestrictionFeature } from '@/lib/hooks/useAdmin'
import { AdminRestrictedCard } from '@/components/admin/AdminRestrictedCard'
import { Profile } from '@/lib/types/database.types'
import { isRestricted } from '@/lib/utils/restrictionCheck'
import { formatTimeAgo } from '@/lib/utils/helpers'

type Section = 'active' | 'history'

const FEATURES: RestrictionFeature[] = ['post', 'comment', 'message', 'story']
const FEATURE_LABELS: Record<RestrictionFeature, string> = {
  post: 'Posting',
  comment: 'Commenting',
  message: 'Messaging',
  story: 'Stories',
}

export default function RestrictedAccountsPage() {
  const { profile, loading } = useUser()
  const [section, setSection] = useState<Section>('active')
  const { data: profiles = [], isLoading: activeLoading } = useActiveRestrictions()
  const { data: history = [], isLoading: historyLoading } = useRestrictionHistory()

  // One profile can carry more than one active restriction at once (e.g.
  // both posting and messaging) - expand into one row per feature so
  // each can be lifted independently.
  const rows = useMemo(() => {
    const out: { account: Profile; feature: RestrictionFeature; until: string }[] = []
    for (const account of profiles) {
      for (const feature of FEATURES) {
        const until = (account as any)[`restrict_${feature}_until`] as string | null
        if (isRestricted(until)) out.push({ account, feature, until: until as string })
      }
    }
    return out
  }, [profiles])

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
        <ShieldAlert className="h-5 w-5 text-amber-500" />
        <h1 className="text-xl font-bold">Restrictions</h1>
      </div>

      <div className="flex gap-1 bg-muted rounded-xl p-1">
        <button
          onClick={() => setSection('active')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${section === 'active' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
        >
          Active
          {rows.length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-amber-500 text-white text-[10px]">
              {rows.length}
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
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">No active restrictions right now.</p>
          ) : (
            rows.map(row => (
              <AdminRestrictedCard key={`${row.account.id}-${row.feature}`} account={row.account} feature={row.feature} until={row.until} />
            ))
          )
        ) : historyLoading ? (
          <p className="text-sm text-muted-foreground text-center py-10">Loading...</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">No history yet.</p>
        ) : (
          history.map(log => (
            <div key={log.id} className="rounded-2xl border p-4 flex items-start gap-3">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${log.action === 'restrict' ? 'bg-amber-500/10' : 'bg-green-500/10'}`}>
                {log.action === 'restrict' ? <Ban className="h-4 w-4 text-amber-600" /> : <ShieldCheck className="h-4 w-4 text-green-600" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-medium">@{log.target_username}</span>{' '}
                  {log.action === 'restrict'
                    ? `was restricted from ${log.feature ? FEATURE_LABELS[log.feature as RestrictionFeature] : 'a feature'}`
                    : `had their ${log.feature ? FEATURE_LABELS[log.feature as RestrictionFeature] : 'feature'} restriction lifted`}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">{formatTimeAgo(log.created_at)}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
