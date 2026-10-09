'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, PlayCircle, Heart, MessageCircle } from 'lucide-react'
import { useUser } from '@/lib/hooks/useUser'
import { PageLoader } from '@/components/shared/LoadingSpinner'
import { useAdminAccount, useAdminAccountPosts } from '@/lib/hooks/useAdminAccounts'
import { formatCount, getPostPreviewText } from '@/lib/utils/helpers'

export default function AdminAccountPostsPage() {
  const params = useParams()
  const userId = params.userId as string
  const { profile, loading } = useUser()
  const { data: account } = useAdminAccount(userId)
  const { data: posts = [], isLoading } = useAdminAccountPosts(userId)

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
        <h1 className="text-xl font-bold truncate">All Post{account ? ` - ${account.username}` : ''}</h1>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-10">Loading...</p>
      ) : posts.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">This account hasn't posted anything.</p>
      ) : (
        <div className="grid grid-cols-3 gap-1">
          {posts.map(post => (
            <div key={post.id} className="relative aspect-square bg-muted rounded-md overflow-hidden group">
              {post.media_url && post.media_type === 'image' && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.media_url} alt="" className="w-full h-full object-cover" />
              )}
              {post.media_url && post.media_type === 'video' && (
                <>
                  <video src={post.media_url} className="w-full h-full object-cover" muted preload="metadata" />
                  <PlayCircle className="absolute top-1.5 right-1.5 h-4 w-4 text-white drop-shadow" />
                </>
              )}
              {!post.media_url && (
                <div className="w-full h-full flex items-center justify-center p-2">
                  <p className="text-[10px] text-center line-clamp-5">{getPostPreviewText(post.content)}</p>
                </div>
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100">
                <span className="flex items-center gap-1 text-white text-xs font-medium">
                  <Heart className="h-3.5 w-3.5 fill-white" /> {formatCount(post.likes_count)}
                </span>
                <span className="flex items-center gap-1 text-white text-xs font-medium">
                  <MessageCircle className="h-3.5 w-3.5 fill-white" /> {formatCount(post.comments_count)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
} 
