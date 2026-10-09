'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useTrackEvent } from '@/lib/hooks/useTrackEvent'

export function useFollowStatus(followerId?: string, followingId?: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['follow-status', followerId, followingId],
    queryFn: async () => {
      if (!followerId || !followingId) return null
      const { data } = await supabase
        .from('follows')
        .select('*')
        .eq('follower_id', followerId)
        .eq('following_id', followingId)
        .single()
      return data
    },
    enabled: !!followerId && !!followingId,
  })
}

export function useFollowUser() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const track = useTrackEvent()

  return useMutation({
    mutationFn: async ({
      followerId,
      followingId,
      isPrivate,
    }: {
      followerId: string
      followingId: string
      isPrivate: boolean
    }) => {
      const { error } = await supabase.from('follows').insert({
        follower_id: followerId,
        following_id: followingId,
        status: isPrivate ? 'pending' : 'accepted',
      })
      if (error) throw error
      track({ target_type: 'post', target_id: followingId, creator_id: followingId, event_type: 'follow' })

      if (!isPrivate) {
        // followers_count/following_count are maintained entirely by a
        // database trigger on the follows table now (see
        // supabase-migration-follow-counts-fix.sql) - it recalculates the
        // real count every time a row here changes, so there's nothing to
        // Increment by hand. Calling an RPC here too would double-count.
        await supabase.from('notifications').insert({
          user_id: followingId,
          actor_id: followerId,
          type: 'follow',
        })
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['follow-status', variables.followerId, variables.followingId] })
    },
  })
}

export function useUnfollowUser() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ followerId, followingId }: { followerId: string; followingId: string }) => {
      // Only send an "unfollow" notification if this was an accepted
      // follow (an unfollow notification for a pending request that was
      // simply withdrawn would be confusing - they were never told about
      // a "follow" in the first place).
      const { data: existing } = await supabase
        .from('follows')
        .select('status')
        .eq('follower_id', followerId)
        .eq('following_id', followingId)
        .single()

      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', followerId)
        .eq('following_id', followingId)
      if (error) throw error

      // Counts update themselves via the follows-table trigger - see the
      // note in useFollowUser above.
      if (existing?.status === 'accepted') {
        await supabase.from('notifications').insert({
          user_id: followingId,
          actor_id: followerId,
          type: 'unfollow',
        })
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['follow-status', variables.followerId, variables.followingId] })
    },
  })
}

export function useFollowRequests(userId?: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['follow-requests', userId],
    queryFn: async () => {
      if (!userId) return []
      const { data, error } = await supabase
        .from('follows')
        .select('*, profiles!follows_follower_id_fkey(*)')
        .eq('following_id', userId)
        .eq('status', 'pending')

      if (error) throw error
      return data
    },
    enabled: !!userId,
  })
}

export function useRespondToFollowRequest() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      followId,
      followerId,
      followingId,
      action,
    }: {
      followId: string
      followerId: string
      followingId: string
      action: 'accepted' | 'rejected'
    }) => {
      if (action === 'accepted') {
        await supabase.from('follows').update({ status: 'accepted' }).eq('id', followId)
        // Counts update themselves via the follows-table trigger.
        await supabase.from('notifications').insert({
          user_id: followingId,
          actor_id: followerId,
          type: 'follow',
        })
      } else {
        await supabase.from('follows').delete().eq('id', followId)
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['follow-requests', variables.followingId] })
    },
  })
}
