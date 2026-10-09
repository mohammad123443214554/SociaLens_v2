import { Lock } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { FollowButton } from './FollowButton'
import { Profile } from '@/lib/types/database.types'
import { getAvatarUrl } from '@/lib/utils/helpers'

interface LockedProfileViewProps {
  profile: Profile
  currentUserId?: string
}

// A fully-locked private account: the owner has chosen to only let
// people THEY follow see anything at all, so even approved followers
// land here instead of the real profile until that happens.
export function LockedProfileView({ profile, currentUserId }: LockedProfileViewProps) {
  return (
    <div className="max-w-xl mx-auto px-4 py-10 flex flex-col items-center text-center">
      <Avatar className="h-24 w-24 border-4 border-background">
        <AvatarImage src={getAvatarUrl(profile.avatar_url)} />
        <AvatarFallback className="text-2xl">{profile.username?.[0]?.toUpperCase()}</AvatarFallback>
      </Avatar>

      <div className="flex items-center gap-1.5 mt-4">
        <h1 className="font-bold text-lg">{profile.full_name || profile.username}</h1>
        <Lock className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="text-muted-foreground text-sm">@{profile.username}</p>

      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mt-8">
        <Lock className="h-7 w-7 text-muted-foreground" />
      </div>
      <p className="font-semibold mt-3">This account is private</p>
      <p className="text-sm text-muted-foreground max-w-xs mt-1">
        Only people {profile.username} follows can see their posts, story, and profile.
      </p>

      {currentUserId && (
        <div className="mt-5">
          <FollowButton
            targetUserId={profile.id}
            targetUsername={profile.username}
            isPrivate={profile.is_private}
            currentUserId={currentUserId}
          />
        </div>
      )}
    </div>
  )
}
