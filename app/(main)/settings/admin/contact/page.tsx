'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Headset } from 'lucide-react'
import { useUser } from '@/lib/hooks/useUser'
import { PageLoader } from '@/components/shared/LoadingSpinner'
import { useContactSubmissions } from '@/lib/hooks/useAdmin'
import { AdminContactCard } from '@/components/admin/AdminContactCard'

type Tab = 'pending' | 'resolved'

const TABS: { value: Tab; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'resolved', label: 'Resolved' },
]

export default function AdminContactPage() {
  const { profile, loading } = useUser()
  const [tab, setTab] = useState<Tab>('pending')
  const { data: submissions = [], isLoading } = useContactSubmissions(tab)

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
        <Headset className="h-5 w-5 text-pink-500" />
        <h1 className="text-xl font-bold">Contact</h1>
      </div>

      <div className="flex gap-1 bg-muted rounded-xl p-1">
        {TABS.map(t => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.value ? 'bg-card shadow-sm' : 'text-muted-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-10">Loading...</p>
        ) : submissions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">No {tab} messages.</p>
        ) : (
          submissions.map(submission => <AdminContactCard key={submission.id} submission={submission} />)
        )}
      </div>
    </div>
  )
} 
