'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Heart } from 'lucide-react'
import { useUser } from '@/lib/hooks/useUser'
import { PageLoader } from '@/components/shared/LoadingSpinner'
import { useAdminAccount, useAdminAccountLikes } from '@/lib/hooks/useAdminAccounts'
import { formatTimeAgo } from '@/lib/utils/helpers'

export default function AdminAccountLikesPage() {
  const params = useParams()
  const userId = params.userId as string
  const { profile, loading } = useUser()
  const { data: account } = useAdminAccount(userId)
  const { data: likes = [], isLoading } = useAdminAccountLikes(userId)

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
        <h1 className="text-xl font-bold truncate">All Like{account ? ` - ${account.username}` : ''}</h1>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-10">Loading...</p>
      ) : likes.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">This account hasn't liked anything.</p>
      ) : (
        <div className="space-y-3">
          {likes.map(like => (
            <div key={like.id} className="rounded-2xl border p-4 flex items-center gap-3">
              {like.posts?.media_url && like.posts.media_type === 'image' && (
                // Eslint-disable-next-line @next/next/no-img-element
                <img src={like.posts.media_url} alt="" className="h-14 w-14 rounded-lg object-cover shrink-0" />
              )}
              {like.posts?.media_url && like.posts.media_type === 'video' && (
                <video src={like.posts.media_url} className="h-14 w-14 rounded-lg object-cover shrink-0" muted preload="metadata" />
              )}
              {!like.posts?.media_url && (
                <div className="h-14 w-14 rounded-lg bg-muted shrink-0 flex items-center justify-center">
                  <Heart className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm truncate">
                  {like.posts ? (
                    <>
                      Liked <span className="font-medium">@{like.posts.profiles?.username}</span>'s post
                      {like.posts.content ? `: "${like.posts.content.slice(0, 40)}${like.posts.content.length > 40 ? '...' : ''}"` : ''}
                    </>
                  ) : (
                    'Liked a post that no longer exists'
                  )}
                </p>
                <span className="text-xs text-muted-foreground">{formatTimeAgo(like.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
