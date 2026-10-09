'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Users } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/hooks/useUser'
import { getAvatarUrl } from '@/lib/utils/helpers'
import { PageLoader } from '@/components/shared/LoadingSpinner'
import { FollowButton } from '@/components/profile/FollowButton'
import { VerifiedBadge } from '@/components/shared/VerifiedBadge'
import { Profile } from '@/lib/types/database.types'

export default function SuggestionsPage() {
  const { user, loading } = useUser()
  const router = useRouter()
  const supabase = createClient()

  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: ['suggestions', user?.id],
    queryFn: async () => {
      const { data: alreadyFollowing } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user?.id ?? '')

      const excludeIds = new Set((alreadyFollowing || []).map(f => f.following_id))
      excludeIds.add(user?.id ?? '')

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('is_private', false)
        .order('created_at', { ascending: false })
        .limit(80)

      const candidates = ((data as Profile[]) || []).filter(p => !excludeIds.has(p.id))
      if (candidates.length === 0 || !user) return []

      // Suggestions Privacy (Settings > Privacy > Suggestions Privacy) -
      // Separate from Search Result Privacy, so someone can be findable
      // By search without necessarily being pushed into everyone's
      // suggestions feed, or vice versa.
      const ids = candidates.map(p => p.id)
      const [{ data: iFollow }, { data: followMe }, { data: selectedMe }, { data: blockRows }] = await Promise.all([
        supabase.from('follows').select('following_id').eq('follower_id', user.id).eq('status', 'accepted').in('following_id', ids),
        supabase.from('follows').select('follower_id').eq('following_id', user.id).eq('status', 'accepted').in('follower_id', ids),
        supabase.from('privacy_selected_users').select('owner_id').eq('category', 'suggestions').eq('selected_user_id', user.id).in('owner_id', ids),
        supabase.from('blocks').select('blocker_id, blocked_id').or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`),
      ])
      const iFollowSet = new Set((iFollow || []).map((r: any) => r.following_id))
      const followsMeSet = new Set((followMe || []).map((r: any) => r.follower_id))
      const selectedMeSet = new Set((selectedMe || []).map((r: any) => r.owner_id))
      const blockedRelationSet = new Set(
        (blockRows || []).flatMap((b: any) => [b.blocker_id, b.blocked_id]).filter((id: string) => id !== user.id)
      )

      const visible = candidates.filter(p => {
        if (blockedRelationSet.has(p.id)) return false
        switch ((p as any).suggestions_privacy) {
          // 'followers' = p's followers, i.e. the viewer must follow p.
          // 'following' = people p follows, i.e. p must follow the viewer.
          case 'followers': return iFollowSet.has(p.id)
          case 'following': return followsMeSet.has(p.id)
          case 'selected': return selectedMeSet.has(p.id)
          case 'none': return false
          case 'everyone':
          default: return true
        }
      })

      if (visible.length === 0) return []

      // Rank by mutual connections + past interaction/creator-similarity
      // signal, not just "who joined most recently" - the same mix
      // Instagram's "Suggested for you" uses (people your friends follow,
      // people whose content you already seem to like).
      const visibleIds = visible.map(p => p.id)
      const { data: iFollowRows } = await supabase.from('follows').select('following_id').eq('follower_id', user.id).eq('status', 'accepted')
      const myFollowingIds = (iFollowRows || []).map((r: any) => r.following_id)

      const [{ data: mutualRows }, { data: affinityRows }] = await Promise.all([
        myFollowingIds.length > 0
          ? supabase.from('follows').select('follower_id, following_id').eq('status', 'accepted').in('follower_id', myFollowingIds).in('following_id', visibleIds)
          : Promise.resolve({ data: [] as any[] }),
        supabase.from('user_creator_affinity').select('creator_id, score').eq('user_id', user.id).in('creator_id', visibleIds),
      ])
      const mutualCount = new Map<string, number>()
      for (const r of (mutualRows || []) as any[]) {
        mutualCount.set(r.following_id, (mutualCount.get(r.following_id) || 0) + 1)
      }
      const affinity = new Map((affinityRows || []).map((r: any) => [r.creator_id, r.score]))

      const ranked = [...visible].sort((a, b) => {
        const scoreA = (mutualCount.get(a.id) || 0) * 3 + Math.tanh((affinity.get(a.id) || 0) / 5) * 2
        const scoreB = (mutualCount.get(b.id) || 0) * 3 + Math.tanh((affinity.get(b.id) || 0) / 5) * 2
        if (scoreB !== scoreA) return scoreB - scoreA
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })

      return ranked.slice(0, 30)
    },
    enabled: !!user,
  })

  if (loading) return <PageLoader />
  if (!user) return null

  return (
    <div className="max-w-xl mx-auto">
      <div className="sticky top-14 z-10 bg-background border-b flex items-center gap-3 px-4 py-3">
        <button onClick={() => router.back()} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="font-bold text-lg">Suggestions for you</h1>
          <p className="text-xs text-muted-foreground">People you might want to follow</p>
        </div>
      </div>

      {isLoading ? (
        <div className="p-4 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : suggestions.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center text-muted-foreground">
          <div className="w-16 h-16 rounded-full bg-pink-500/10 flex items-center justify-center">
            <Users className="h-8 w-8 text-pink-500/50" />
          </div>
          <p className="font-semibold text-foreground">No suggestions right now</p>
          <p className="text-sm max-w-xs">Check back later for people to follow.</p>
        </div>
      ) : (
        <div className="divide-y">
          {suggestions.map(profile => (
            <div key={profile.id} className="flex items-center gap-3 px-4 py-3">
              <Link href={`/profile/${profile.username}`} className="flex items-center gap-3 flex-1 min-w-0">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={getAvatarUrl(profile.avatar_url)} />
                  <AvatarFallback className="bg-gradient-to-br from-pink-500 to-purple-500 text-white font-bold">
                    {profile.username?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate flex items-center gap-1">
                    {profile.username}
                    {profile.is_verified && <VerifiedBadge type={profile.verification_type} className="text-xs shrink-0" />}
                  </p>
                  {profile.full_name && <p className="text-xs text-muted-foreground truncate">{profile.full_name}</p>}
                </div>
              </Link>
              <FollowButton
                targetUserId={profile.id}
                targetUsername={profile.username}
                isPrivate={profile.is_private}
                currentUserId={user.id}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
