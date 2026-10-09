'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, MoreVertical, Ban, Flag, EyeOff, Loader2 } from 'lucide-react'
import { useUser } from '@/lib/hooks/useUser'
import { PageLoader } from '@/components/shared/LoadingSpinner'
import { useMyBlockedUsers, useHideBlockEntry, useToggleBlock } from '@/lib/hooks/useChatSettings'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ReportModal } from '@/components/shared/ReportModal'
import { getAvatarUrl, formatTimeAgo } from '@/lib/utils/helpers'
import { Profile } from '@/lib/types/database.types'

export default function BlockedUsersPage() {
  const { user, loading } = useUser()
  const { data: blockedUsers = [], isLoading } = useMyBlockedUsers(user?.id)
  const toggleBlock = useToggleBlock()
  const hideEntry = useHideBlockEntry()
  const [reportTarget, setReportTarget] = useState<Profile | null>(null)

  if (loading) return <PageLoader />

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      {reportTarget && user && (
        <ReportModal
          reporterId={user.id}
          reportedUserId={reportTarget.id}
          targetType="user"
          onClose={() => setReportTarget(null)}
        />
      )}

      <div className="flex items-center gap-2">
        <Link href="/settings/general/account" className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <Ban className="h-5 w-5" />
        <h1 className="text-xl font-bold">Block List</h1>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-10">Loading...</p>
      ) : blockedUsers.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">You haven't blocked anyone.</p>
      ) : (
        <div className="space-y-2">
          {blockedUsers.map((blocked: any) => (
            <div key={blocked.id} className="flex items-center gap-3 rounded-2xl border p-3">
              <Link href={`/profile/${blocked.username}`} className="flex items-center gap-3 min-w-0 flex-1">
                <Avatar className="h-11 w-11 shrink-0">
                  <AvatarImage src={getAvatarUrl(blocked.avatar_url)} />
                  <AvatarFallback>{blocked.username?.[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <span className="text-sm font-medium block truncate">{blocked.username}</span>
                  <span className="text-xs text-muted-foreground">Blocked {formatTimeAgo(blocked.blocked_at)}</span>
                </div>
              </Link>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-2 rounded-full hover:bg-accent shrink-0" disabled={toggleBlock.isPending || hideEntry.isPending}>
                    {toggleBlock.isPending || hideEntry.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <MoreVertical className="h-4 w-4" />
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      if (!user) return
                      toggleBlock.mutate({ blockerId: user.id, blockedId: blocked.id, block: false })
                    }}
                  >
                    <Ban className="h-4 w-4 mr-2" /> Unblock
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setReportTarget(blocked)}>
                    <Flag className="h-4 w-4 mr-2" /> Report
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      if (!user) return
                      hideEntry.mutate({ userId: user.id, hiddenUserId: blocked.id })
                    }}
                  >
                    <EyeOff className="h-4 w-4 mr-2" /> Hide
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
