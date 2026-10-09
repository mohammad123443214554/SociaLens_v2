'use client'

import { useEffect, useState } from 'react'
import { X, Users } from 'lucide-react'
import Link from 'next/link'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { VerifiedBadge } from '@/components/shared/VerifiedBadge'
import { StatusDot } from '@/components/shared/StatusDot'
import { useUserStatus } from '@/lib/hooks/useUserStatus'
import { createClient } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/utils/helpers'
import { Profile } from '@/lib/types/database.types'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

interface FollowersModalProps {
  profileId: string
  type: 'followers' | 'following'
  onClose: () => void
}

function PersonRow({ person, onClose }: { person: Profile; onClose: () => void }) {
  const status = useUserStatus(person.id)
  return (
    <Link
      href={`/profile/${person.username}`}
      onClick={onClose}
      className="flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors"
    >
      <div className="relative shrink-0">
        <Avatar className="h-11 w-11">
          <AvatarImage
            src={getAvatarUrl(person.avatar_url)}
            alt={person.username}
          />
          <AvatarFallback className="bg-gradient-to-br from-pink-500 to-purple-500 text-white font-semibold">
            {person.username?.[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <StatusDot status={status} className="absolute bottom-0 right-0" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate">{person.username}</p>
        {person.full_name && (
          <p className="text-xs text-muted-foreground truncate">{person.full_name}</p>
        )}
      </div>
      {person.is_verified && (
        <VerifiedBadge type={person.verification_type} className="text-sm shrink-0" />
      )}
    </Link>
  )
}

export function FollowersModal({ profileId, type, onClose }: FollowersModalProps) {
  const [people, setPeople] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const fetchPeople = async () => {
      setLoading(true)
      if (type === 'followers') {
        const { data } = await supabase
          .from('follows')
          .select('profiles!follows_follower_id_fkey(*)')
          .eq('following_id', profileId)
          .eq('status', 'accepted')
        setPeople((data || []).map((d: any) => d.profiles).filter(Boolean))
      } else {
        const { data } = await supabase
          .from('follows')
          .select('profiles!follows_following_id_fkey(*)')
          .eq('follower_id', profileId)
          .eq('status', 'accepted')
        setPeople((data || []).map((d: any) => d.profiles).filter(Boolean))
      }
      setLoading(false)
    }
    fetchPeople()
  }, [profileId, type])

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="font-bold text-base">
            {type === 'followers' ? 'Followers' : 'Following'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* list */}
        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-10">
              <LoadingSpinner />
            </div>
          ) : people.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <Users className="h-12 w-12 opacity-30" />
              <p className="text-sm font-medium">
                {type === 'followers' ? 'No followers yet' : 'Not following anyone'}
              </p>
              <p className="text-xs text-center px-6 text-muted-foreground">
                {type === 'followers'
                  ? "When someone follows this account, they'll appear here."
                  : "When this account follows someone, they'll appear here."}
              </p>
            </div>
          ) : (
            people.map(person => (
              <PersonRow key={person.id} person={person} onClose={onClose} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
