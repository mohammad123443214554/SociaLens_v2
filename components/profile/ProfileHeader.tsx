'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Lock, Users, ChevronRight, MessageCircle, Loader2, MoreVertical, Ban, Flag } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { VerifiedBadge } from '@/components/shared/VerifiedBadge'
import { Button } from '@/components/ui/button'
import { FollowButton } from './FollowButton'
import { FollowersModal } from './FollowersModal'
import { Profile } from '@/lib/types/database.types'
import { formatCount, getAvatarUrl } from '@/lib/utils/helpers'
import { useStartChat } from '@/lib/hooks/useStartChat'
import { useBlockStatus, useToggleBlock } from '@/lib/hooks/useChatSettings'
import { ReportModal } from '@/components/shared/ReportModal'
import { StatusDot } from '@/components/shared/StatusDot'
import { useUserStatus } from '@/lib/hooks/useUserStatus'
import Link from 'next/link'

interface ProfileHeaderProps {
  profile: Profile
  currentUserId?: string
}

export function ProfileHeader({ profile, currentUserId }: ProfileHeaderProps) {
  const isOwn = currentUserId === profile.id
  const [modal, setModal] = useState<'followers' | 'following' | null>(null)
  const [showMenu, setShowMenu] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const { startChat, startingChatWith, error: chatError } = useStartChat()
  const { data: blockStatus } = useBlockStatus(currentUserId, profile.id)
  const toggleBlock = useToggleBlock()
  const status = useUserStatus(isOwn ? null : profile.id)

  return (
    <div>
      {/* Cover Photo */}
      <div className="relative h-32 sm:h-48 bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500">
        {profile.cover_photo_url && (
          <Image src={profile.cover_photo_url} alt="Cover" fill className="object-cover" />
        )}
      </div>

      {/* Profile Info */}
      <div className="px-4 pb-4">
        <div className="flex items-end justify-between -mt-12 mb-3">
          <div className="relative">
            <Avatar className="h-24 w-24 border-4 border-background">
              <AvatarImage src={getAvatarUrl(profile.avatar_url)} />
              <AvatarFallback className="text-2xl">
                {profile.username?.[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <StatusDot status={status} size="lg" className="absolute bottom-1 right-1" />
          </div>

          <div className="flex gap-2 mt-4">
            {isOwn ? (
              <Link href="/profile/edit">
                <Button variant="outline" size="sm">Edit Profile</Button>
              </Link>
            ) : (
              <>
                <FollowButton
                  targetUserId={profile.id}
                  targetUsername={profile.username}
                  isPrivate={profile.is_private}
                  currentUserId={currentUserId}
                />
                {currentUserId && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={startingChatWith === profile.id}
                    onClick={() => startChat(currentUserId, profile)}
                  >
                    {startingChatWith === profile.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <MessageCircle className="h-4 w-4 sm:mr-1.5" />
                        <span className="hidden sm:inline">Message</span>
                      </>
                    )}
                  </Button>
                )}
                {currentUserId && (
                  <div className="relative">
                    <Button variant="outline" size="sm" className="px-2" onClick={() => setShowMenu(v => !v)}>
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                    {showMenu && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setShowMenu(false)} />
                        <div className="absolute right-0 top-full mt-1 bg-card border rounded-xl shadow-xl overflow-hidden w-48 z-40">
                          <button
                            onClick={() => {
                              setShowMenu(false)
                              toggleBlock.mutate({ blockerId: currentUserId, blockedId: profile.id, block: !blockStatus?.iBlockedThem })
                            }}
                            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted"
                          >
                            <Ban className="h-3.5 w-3.5" /> {blockStatus?.iBlockedThem ? 'Unblock' : 'Block'}
                          </button>
                          <button
                            onClick={() => { setShowMenu(false); setShowReport(true) }}
                            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-500 hover:bg-red-500/10"
                          >
                            <Flag className="h-3.5 w-3.5" /> Report
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Name & Bio */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <h1 className="font-bold text-lg">{profile.full_name || profile.username}</h1>
            {profile.is_private && <Lock className="h-4 w-4 text-muted-foreground" />}
            {profile.is_verified && <VerifiedBadge type={profile.verification_type} />}
          </div>
          <p className="text-muted-foreground text-sm">@{profile.username}</p>
          {profile.bio && <p className="text-sm mt-2">{profile.bio}</p>}
          {chatError && <p className="text-xs text-red-500 mt-2">{chatError}</p>}
        </div>

        {/* Stats - clickable */}
        <div className="flex gap-6 mt-4">
          <div className="text-center">
            <p className="font-bold">{formatCount(profile.posts_count)}</p>
            <p className="text-xs text-muted-foreground">Posts</p>
          </div>

          <button
            onClick={() => setModal('followers')}
            className="text-center hover:opacity-70 transition-opacity"
          >
            <p className="font-bold">{formatCount(profile.followers_count)}</p>
            <p className="text-xs text-muted-foreground">Followers</p>
          </button>

          <button
            onClick={() => setModal('following')}
            className="text-center hover:opacity-70 transition-opacity"
          >
            <p className="font-bold">{formatCount(profile.following_count)}</p>
            <p className="text-xs text-muted-foreground">Following</p>
          </button>
        </div>

        {isOwn && (
          <Link
            href="/profile/suggestions"
            className="flex items-center justify-between mt-4 px-3 py-2.5 rounded-xl border hover:border-pink-500/40 hover:bg-pink-500/5 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-pink-500" />
              <span className="text-sm font-medium">Suggestions for you</span>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        )}
      </div>

      {/* Modals */}
      {modal && (
        <FollowersModal
          profileId={profile.id}
          type={modal}
          onClose={() => setModal(null)}
        />
      )}
      {showReport && currentUserId && (
        <ReportModal
          reporterId={currentUserId}
          reportedUserId={profile.id}
          targetType="user"
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  )
}
