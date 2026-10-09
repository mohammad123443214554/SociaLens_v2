'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { useUser } from '@/lib/hooks/useUser'
import { PageLoader } from '@/components/shared/LoadingSpinner'
import { useAdminAccount, useAdminAccountComments } from '@/lib/hooks/useAdminAccounts'
import { formatTimeAgo } from '@/lib/utils/helpers'

export default function AdminAccountCommentsPage() {
  const params = useParams()
  const userId = params.userId as string
  const { profile, loading } = useUser()
  const { data: account } = useAdminAccount(userId)
  const { data: comments = [], isLoading } = useAdminAccountComments(userId)

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
        <Link href={`/settings/admin/accounts/${userId}`} className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold truncate">All Post Comment{account ? ` - ${account.username}` : ''}</h1>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-10">Loading...</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">No comments from this account.</p>
      ) : (
        <div className="space-y-3">
          {comments.map(comment => (
            <div key={comment.id} className="rounded-2xl border p-4 space-y-2">
              <p className="text-sm">{comment.content}</p>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{formatTimeAgo(comment.created_at)}</span>
                {comment.posts && (
                  <span className="truncate max-w-[60%]">
                    On <span className="font-medium">@{comment.posts.profiles?.username}</span>'s post
                    {comment.posts.content ? `: "${comment.posts.content.slice(0, 40)}${comment.posts.content.length > 40 ? '...' : ''}"` : ''}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
} 
