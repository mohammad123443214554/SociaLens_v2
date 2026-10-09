'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { useUser } from '@/lib/hooks/useUser'
import { PageLoader } from '@/components/shared/LoadingSpinner'
import { useAdminAccount, useAdminAccountStories } from '@/lib/hooks/useAdminAccounts'
import { formatTimeAgo } from '@/lib/utils/helpers'

export default function AdminAccountStoriesPage() {
  const params = useParams()
  const userId = params.userId as string
  const { profile, loading } = useUser()
  const { data: account } = useAdminAccount(userId)
  const { data: stories = [], isLoading } = useAdminAccountStories(userId)

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
        <h1 className="text-xl font-bold truncate">All Story{account ? ` - ${account.username}` : ''}</h1>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-10">Loading...</p>
      ) : stories.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">No active stories right now.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {stories.map(story => (
            <div key={story.id} className="relative aspect-[9/16] rounded-xl overflow-hidden border">
              {story.story_type === 'photo' && story.media_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={story.media_url} alt="" className="w-full h-full object-cover" />
              )}
              {story.story_type === 'video' && story.media_url && (
                <video src={story.media_url} className="w-full h-full object-cover" muted preload="metadata" />
              )}
              {story.story_type === 'text' && (
                <div
                  className="w-full h-full flex items-center justify-center p-2"
                  style={{ background: story.background_color || '#1a1a1a' }}
                >
                  <p className="text-[11px] text-white text-center line-clamp-6" style={{ color: story.text_color || '#fff' }}>
                    {story.text_content}
                  </p>
                </div>
              )}
              <span className="absolute bottom-1 left-1 right-1 text-[9px] text-white bg-black/50 rounded px-1 py-0.5 text-center">
                {formatTimeAgo(story.created_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
} 
