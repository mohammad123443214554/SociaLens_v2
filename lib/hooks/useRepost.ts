'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export function useIsReposted(postId: string, userId?: string, prefetched?: boolean) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['is-reposted', postId, userId],
    queryFn: async () => {
      if (!userId) return false
      const { data } = await supabase
        .from('reposts')
        .select('id')
        .eq('post_id', postId)
        .eq('user_id', userId)
        .maybeSingle()
      return !!data
    },
    // If the page that rendered this card already batch-fetched repost
    // status for its whole list (see fetchPostsWithLikes), skip the
    // per-card network request entirely and just trust that value -
    // this is what actually avoids the N+1 query pattern. Any caller
    // That doesn't have a prefetched value (existing behavior) still
    // gets its own query exactly as before.
    initialData: prefetched,
    enabled: prefetched === undefined && !!userId && !!postId,
  })
}

export function useToggleRepost() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      postId,
      userId,
      postOwnerId,
      repost,
    }: {
      postId: string
      userId: string
      postOwnerId: string
      repost: boolean
    }) => {
      if (repost) {
        const { error } = await supabase.from('reposts').insert({ post_id: postId, user_id: userId })
        if (error) throw error
        if (userId !== postOwnerId) {
          await supabase.from('notifications').insert({
            user_id: postOwnerId,
            actor_id: userId,
            type: 'repost',
            post_id: postId,
          })
        }
      } else {
        const { error } = await supabase.from('reposts').delete().eq('post_id', postId).eq('user_id', userId)
        if (error) throw error
      }
    },
    onMutate: async ({ postId, userId, repost }) => {
      const key = ['is-reposted', postId, userId] as const
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<boolean>(key)

      // Update the popup's cached status immediately. In the Home Discover
      // grid, useIsReposted is seeded with a prefetched value and its query is
      // disabled, so invalidation alone cannot refresh that value.
      queryClient.setQueryData<boolean>(key, repost)
      return { key, previous }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(context.key, context.previous)
      }
    },
    onSuccess: (_, { postId, userId, repost }) => {
      // Keep the popup's source of truth aligned with the successful write.
      queryClient.setQueryData(['is-reposted', postId, userId], repost)
      queryClient.invalidateQueries({ queryKey: ['feed-posts'] })
      queryClient.invalidateQueries({ queryKey: ['profile-posts'] })
    },
  })
}
