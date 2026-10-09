import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { ProfileHeader } from '@/components/profile/ProfileHeader'
import { ProfileTabsFixed } from '@/components/profile/ProfileTabsFixed'
import { LockedProfileView } from '@/components/profile/LockedProfileView'
import { FollowRequestsDialog } from '@/components/profile/FollowRequestsDialog'

interface ProfilePageProps {
  params: Promise<{ username: string }>
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { username } = await params
  const supabase = await createClient()

  // Middleware already verified this request is authenticated before this page started rendering.
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user ?? null

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', username)
    .single()

  if (!profile) notFound()

  const isOwn = user?.id === profile.id

  let isFollowing = false
  let ownerFollowsViewer = false
  if (user && !isOwn) {
    const [{ data: follow }, { data: ownerFollowsMe }] = await Promise.all([
      supabase.from('follows').select('status').eq('follower_id', user.id).eq('following_id', profile.id).single(),
      supabase.from('follows').select('id').eq('follower_id', profile.id).eq('following_id', user.id).eq('status', 'accepted').maybeSingle(),
    ])
    isFollowing = follow?.status === 'accepted'
    ownerFollowsViewer = !!ownerFollowsMe
  }

  const isLocked = profile.is_private && !isOwn && !ownerFollowsViewer

  if (isLocked) {
    return <LockedProfileView profile={profile} currentUserId={user?.id} />
  }

  return (
    <div className="max-w-xl mx-auto">
      <ProfileHeader profile={profile} currentUserId={user?.id} />
      {isOwn && profile.is_private && (
        <div className="px-4 pb-2">
          <FollowRequestsDialog userId={profile.id} />
        </div>
      )}
      <ProfileTabsFixed
        profileId={profile.id}
        isPrivate={profile.is_private}
        isFollowing={isFollowing}
        isOwn={isOwn}
      />
    </div>
  )
}
