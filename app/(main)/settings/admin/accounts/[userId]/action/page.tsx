'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Ban, ShieldAlert, Trash2, Loader2, Check, BadgeCheck } from 'lucide-react'
import { useRouter, useParams } from 'next/navigation'
import { useUser } from '@/lib/hooks/useUser'
import { PageLoader } from '@/components/shared/LoadingSpinner'
import { useAdminAccount } from '@/lib/hooks/useAdminAccounts'
import {
  useSuspendUser,
  useUnsuspendUser,
  useRestrictUser,
  useLiftRestriction,
  useAdminPermanentlyDeleteAccount,
  useSetVerification,
  RestrictionFeature,
} from '@/lib/hooks/useAdmin'
import { isRestricted, daysRemaining } from '@/lib/utils/restrictionCheck'

const RESTRICTION_OPTIONS: { value: RestrictionFeature; label: string }[] = [
  { value: 'post', label: 'Posting' },
  { value: 'comment', label: 'Commenting' },
  { value: 'message', label: 'Messaging' },
  { value: 'story', label: 'Stories' },
]

export default function AdminAccountActionPage() {
  const params = useParams()
  const userId = params.userId as string
  const { profile, loading } = useUser()
  const { data: account, isLoading } = useAdminAccount(userId)
  const router = useRouter()

  const suspendUser = useSuspendUser()
  const unsuspendUser = useUnsuspendUser()
  const restrictUser = useRestrictUser()
  const liftRestriction = useLiftRestriction()
  const deleteAccount = useAdminPermanentlyDeleteAccount()
  const setVerification = useSetVerification()

  const [suspendReason, setSuspendReason] = useState('')
  const [confirmingSuspend, setConfirmingSuspend] = useState(false)
  const [confirmingUnsuspend, setConfirmingUnsuspend] = useState(false)
  const [confirmingVerify, setConfirmingVerify] = useState(false)
  const [confirmingUnverify, setConfirmingUnverify] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)

  if (loading) return <PageLoader />

  if (!profile?.is_admin) {
    return (
      <div className="max-w-xl mx-auto p-4">
        <p className="text-sm text-muted-foreground text-center py-16">You don't have access to this page.</p>
      </div>
    )
  }

  if (isLoading || !account) {
    return (
      <div className="max-w-xl mx-auto p-4">
        <p className="text-sm text-muted-foreground text-center py-16">Loading...</p>
      </div>
    )
  }

  const handleDelete = async () => {
    setDeleteError(null)
    try {
      await deleteAccount.mutateAsync({ userId, reason: `Permanently deleted by admin - @${account.username}` })
      router.push('/settings/admin/accounts')
    } catch (err: any) {
      setDeleteError(err.message || 'Could not delete that account.')
    }
  }

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Link href={`/settings/admin/accounts/${userId}`} className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold truncate">Action - {account.username}</h1>
      </div>

      {/* Suspend */}
      <div className="rounded-2xl border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Ban className="h-4 w-4 text-red-500" />
          <h2 className="text-sm font-semibold">Suspend Account</h2>
        </div>
        {account.is_suspended ? (
          <>
            <p className="text-xs text-muted-foreground">
              Currently suspended{account.suspension_reason ? ` - ${account.suspension_reason}` : ''}.
            </p>
            {!confirmingUnsuspend ? (
              <button
                onClick={() => setConfirmingUnsuspend(true)}
                className="px-3 py-1.5 rounded-full border text-xs font-medium hover:bg-accent"
              >
                Unsuspend
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => { unsuspendUser.mutate({ userId, username: account.username }); setConfirmingUnsuspend(false) }}
                  disabled={unsuspendUser.isPending}
                  className="px-2.5 py-1 rounded-full bg-green-500 text-white text-xs font-medium flex items-center gap-1"
                >
                  {unsuspendUser.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Yes, unsuspend'}
                </button>
                <button onClick={() => setConfirmingUnsuspend(false)} className="px-2.5 py-1 rounded-full border text-xs">Cancel</button>
              </div>
            )}
          </>
        ) : !confirmingSuspend ? (
          <button
            onClick={() => setConfirmingSuspend(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/10 text-red-500 text-xs font-medium hover:bg-red-500/20"
          >
            <Ban className="h-3.5 w-3.5" /> Suspend
          </button>
        ) : (
          <div className="space-y-2">
            <input
              value={suspendReason}
              onChange={e => setSuspendReason(e.target.value)}
              placeholder="Reason for suspension..."
              className="w-full px-3 py-2 rounded-lg bg-muted text-sm outline-none"
            />
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  suspendUser.mutate({ userId, username: account.username, reason: suspendReason || 'Suspended by admin' })
                  setConfirmingSuspend(false)
                  setSuspendReason('')
                }}
                disabled={suspendUser.isPending}
                className="px-2.5 py-1 rounded-full bg-red-500 text-white text-xs font-medium flex items-center gap-1"
              >
                {suspendUser.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Yes, suspend'}
              </button>
              <button onClick={() => setConfirmingSuspend(false)} className="px-2.5 py-1 rounded-full border text-xs">Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Restriction */}
      <div className="rounded-2xl border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold">Restriction Account</h2>
        </div>
        <div className="space-y-2">
          {RESTRICTION_OPTIONS.map(opt => {
            const until = (account as any)[`restrict_${opt.value}_until`] as string | null
            const active = isRestricted(until)
            return (
              <div key={opt.value} className="flex items-center justify-between gap-2">
                <span className="text-sm">
                  {opt.label}
                  {active && <span className="text-xs text-amber-600 ml-1.5">({daysRemaining(until)}d left)</span>}
                </span>
                {active ? (
                  <button
                    onClick={() => liftRestriction.mutate({ userId, username: account.username, feature: opt.value })}
                    disabled={liftRestriction.isPending}
                    className="px-2.5 py-1 rounded-full border text-xs font-medium hover:bg-accent"
                  >
                    Lift
                  </button>
                ) : (
                  <button
                    onClick={() => restrictUser.mutate({ userId, username: account.username, feature: opt.value })}
                    disabled={restrictUser.isPending}
                    className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 text-xs font-medium hover:bg-amber-500/20"
                  >
                    Restrict (10 days)
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Verification tick */}
      <div className="rounded-2xl border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <BadgeCheck className="h-4 w-4 text-cyan-500" />
          <h2 className="text-sm font-semibold">Verification Tick</h2>
        </div>

        {account.verification_type === 'yellow' ? (
          <p className="text-xs text-muted-foreground">
            This is the official SociaLens account - its yellow tick can't be changed here.
          </p>
        ) : account.verification_type === 'blue' ? (
          <>
            <p className="text-xs text-muted-foreground">This account has the blue verification tick.</p>
            {!confirmingUnverify ? (
              <button
                onClick={() => setConfirmingUnverify(true)}
                className="px-3 py-1.5 rounded-full border text-xs font-medium hover:bg-accent"
              >
                Remove tick
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Remove the blue tick?</span>
                <button
                  onClick={() => { setVerification.mutate({ userId, grant: false }); setConfirmingUnverify(false) }}
                  disabled={setVerification.isPending}
                  className="px-2.5 py-1 rounded-full bg-red-500 text-white text-xs font-medium flex items-center gap-1"
                >
                  {setVerification.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Yes, remove'}
                </button>
                <button onClick={() => setConfirmingUnverify(false)} className="px-2.5 py-1 rounded-full border text-xs">No</button>
              </div>
            )}
          </>
        ) : !confirmingVerify ? (
          <button
            onClick={() => setConfirmingVerify(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-500/10 text-cyan-600 text-xs font-medium hover:bg-cyan-500/20"
          >
            <BadgeCheck className="h-3.5 w-3.5" /> Give blue tick
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Give @{account.username} the blue tick?</span>
            <button
              onClick={() => { setVerification.mutate({ userId, grant: true }); setConfirmingVerify(false) }}
              disabled={setVerification.isPending}
              className="px-2.5 py-1 rounded-full bg-cyan-500 text-white text-xs font-medium flex items-center gap-1"
            >
              {setVerification.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Yes'}
            </button>
            <button onClick={() => setConfirmingVerify(false)} className="px-2.5 py-1 rounded-full border text-xs">No</button>
          </div>
        )}
      </div>

      {/* Permanent delete */}
      <div className="rounded-2xl border border-red-500/20 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Trash2 className="h-4 w-4 text-red-500" />
          <h2 className="text-sm font-semibold">Permanent Delete Account</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          This deletes @{account.username}'s account, posts, comments, stories, messages and login - everything. This can't be undone.
        </p>
        {!confirmingDelete ? (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/10 text-red-500 text-xs font-medium hover:bg-red-500/20"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete permanently
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Type <span className="font-semibold">{account.username}</span> to confirm.</p>
            <input
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder={account.username}
              className="w-full px-3 py-2 rounded-lg bg-muted text-sm outline-none"
            />
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleDelete}
                disabled={deleteAccount.isPending || deleteConfirmText !== account.username}
                className="px-2.5 py-1 rounded-full bg-red-500 text-white text-xs font-medium flex items-center gap-1 disabled:opacity-40"
              >
                {deleteAccount.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Check className="h-3 w-3" /> Confirm delete</>}
              </button>
              <button onClick={() => { setConfirmingDelete(false); setDeleteConfirmText('') }} className="px-2.5 py-1 rounded-full border text-xs">
                Cancel
              </button>
            </div>
            {deleteError && <p className="text-xs text-red-500">{deleteError}</p>}
          </div>
        )}
      </div>
    </div>
  )
} 
