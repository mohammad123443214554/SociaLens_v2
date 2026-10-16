'use client'

import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { PostWithProfile } from '@/lib/types/database.types'
import { getViewerContext } from '@/lib/recommendation/viewerContext'
import { rankFeedPosts } from '@/lib/recommendation/rankFeedPosts'
import { rankExplorePosts } from '@/lib/recommendation/rankExplorePosts'
import { rankReels } from '@/lib/recommendation/rankReels'

const FEED_PAGE_SIZE = 10
const EXPLORE_PAGE_SIZE = 15
const REELS_PAGE_SIZE = 8
const REELS_CANDIDATE_WINDOW = REELS_PAGE_SIZE * 4

// Be explicit about the posts -> profiles foreign key. This avoids PostgREST
// resolving the nested relation differently between environments and makes
// the shape returned to PostWithProfile deterministic.
const POST_SELECT = '*, profiles!posts_user_id_fkey(*)'
const REPOST_POST_SELECT = 'posts(*, profiles!posts_user_id_fkey(*))'

async function fetchPostsWithLikes(posts: PostWithProfile[], userId: string) {
  const supabase = createClient()
  if (!posts.length || !userId) return posts

  const postIds = posts.map(p => p.id)
  // Batched together (2 queries total for the whole page) instead of one
  // query per post - each PostCard/ReelCard used to run its own separate
  // "did I repost this?" check via useIsReposted, which meant a feed of
  // 10 posts fired 10 extra requests just for that one flag.
  const [{ data: likes }, { data: reposts }] = await Promise.all([
    supabase.from('likes').select('post_id').eq('user_id', userId).in('post_id', postIds),
    supabase.from('reposts').select('post_id').eq('user_id', userId).in('post_id', postIds),
  ])

  const likedSet = new Set(likes?.map(l => l.post_id) ?? [])
  const repostedSet = new Set(reposts?.map(r => r.post_id) ?? [])
  return posts.map(p => ({ ...p, is_liked: likedSet.has(p.id), is_reposted: repostedSet.has(p.id) }))
}

export function useFeedPosts(userId?: string) {
  const supabase = createClient()

  return useInfiniteQuery({
    queryKey: ['feed-posts', userId],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      if (!userId) return { posts: [] as PostWithProfile[], nextCursor: null as string | null }

      const { data: following } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', userId)
        .eq('status', 'accepted')

      const followingIds = following?.map(f => f.following_id) ?? []
      followingIds.push(userId)

      let ownQuery = supabase
        .from('posts')
        .select(POST_SELECT)
        .in('user_id', followingIds)
        .order('created_at', { ascending: false })
        .limit(FEED_PAGE_SIZE)
      if (pageParam) ownQuery = ownQuery.lt('created_at', pageParam)
      const { data, error } = await ownQuery
      if (error) throw error
      const ownPosts = await fetchPostsWithLikes((data ?? []) as PostWithProfile[], userId)

      let repostQuery = supabase
        .from('reposts')
        .select(`created_at, profiles!reposts_user_id_fkey(id,username,avatar_url,is_verified,verification_type), ${REPOST_POST_SELECT}`)
        .in('user_id', followingIds)
        .order('created_at', { ascending: false })
        .limit(FEED_PAGE_SIZE)
      if (pageParam) repostQuery = repostQuery.lt('created_at', pageParam)
      const { data: reposts } = await repostQuery

      const repostedPosts: PostWithProfile[] = (reposts || [])
        .filter((r: any) => r.posts)
        .map((r: any) => ({
          ...(r.posts as PostWithProfile),
          created_at: r.created_at,
          reposted_by: r.profiles ? [r.profiles] : [],
        }))
      const repostedWithLikes = await fetchPostsWithLikes(repostedPosts, userId)

      let merged = [...ownPosts, ...repostedWithLikes]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, FEED_PAGE_SIZE)

      const MIN_FEED_SIZE = 5
      if (!pageParam && merged.length < MIN_FEED_SIZE) {
        const excludeIds = merged.map((p) => p.id)
        let suggestedQuery = supabase
          .from('posts')
          .select(POST_SELECT)
          .order('created_at', { ascending: false })
          .limit(20)
        if (excludeIds.length > 0) {
          suggestedQuery = suggestedQuery.not('id', 'in', `(${excludeIds.join(',')})`)
        }
        const { data: suggested } = await suggestedQuery
        if (suggested && suggested.length > 0) {
          const suggestedWithLikes = await fetchPostsWithLikes(suggested as PostWithProfile[], userId)
          merged = [...merged, ...suggestedWithLikes.map((p) => ({ ...p, is_suggested: true }))]
        }
      }

      const gotFullPage = ownPosts.length === FEED_PAGE_SIZE || repostedWithLikes.length === FEED_PAGE_SIZE
      const oldest = merged.length > 0 ? merged[merged.length - 1].created_at : null

      // Relevance + engagement + freshness re-rank of what's already been
      // fetched (see rankFeedPosts) - display order only, doesn't affect
      // what gets fetched or the cursor above. Falls back to the plain
      // chronological order (exactly what this looked like before ranking
      // existed) if anything about the ranking pipeline itself fails, so a
      // bug or a not-yet-applied migration can never make the feed empty.
      let ranked = merged
      try {
        const ctx = await getViewerContext(supabase, userId)
        ranked = rankFeedPosts(merged, ctx)
      } catch (err) {
        console.error('feed ranking failed, showing chronological order', err)
      }

      return { posts: ranked, nextCursor: gotFullPage ? oldest : null }
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!userId,
    staleTime: 30000,
  })
}

export function useExplorePosts(userId?: string) {
  const supabase = createClient()

  return useInfiniteQuery({
    queryKey: ['explore-posts', userId],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      // Fetch a wider, fresh candidate window, then personalize and rank it.
      // Pagination advances by the candidate window (not the displayed 15),
      // so re-ranking never repeats the same candidates across pages.
      const candidateWindow = EXPLORE_PAGE_SIZE * 4
      const { data, error } = await supabase
        .from('posts')
        .select(POST_SELECT)
        .order('created_at', { ascending: false })
        .range(pageParam, pageParam + candidateWindow - 1)

      if (error) throw error
      let candidates = (data ?? []) as PostWithProfile[]
      if (userId) candidates = await fetchPostsWithLikes(candidates, userId)

      let posts = candidates.slice(0, EXPLORE_PAGE_SIZE)
      try {
        const ctx = await getViewerContext(supabase, userId)
        posts = rankExplorePosts(candidates, ctx, EXPLORE_PAGE_SIZE)
      } catch (err) {
        // Keep Explore usable if personalization data is temporarily unavailable.
        console.error('Explore post ranking failed, showing recent posts', err)
      }

      return {
        posts,
        nextCursor: candidates.length === candidateWindow ? pageParam + candidateWindow : null,
      }
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 30000,
  })
}

export function useReelsPosts(userId?: string) {
  const supabase = createClient()

  return useInfiniteQuery({
    queryKey: ['reels-posts', userId],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      let query = supabase
        .from('posts')
        .select(POST_SELECT)
        .eq('media_type', 'video')
        .order('created_at', { ascending: false })
      if (userId) {
        const { data: hiddenRows, error: hiddenError } = await supabase
          .from('post_not_interested').select('post_id').eq('user_id', userId)
        if (hiddenError) throw hiddenError
        const hiddenIds = (hiddenRows || []).map(row => row.post_id)
        if (hiddenIds.length) query = query.not('id', 'in', `(${hiddenIds.join(',')})`)
      }
      query = query.limit(REELS_CANDIDATE_WINDOW)
      if (pageParam) query = query.lt('created_at', pageParam)
      const { data, error } = await query

      if (error) throw error
      let posts = (data ?? []) as PostWithProfile[]
      if (userId) posts = await fetchPostsWithLikes(posts, userId)
      const nextCursor = posts.length === REELS_CANDIDATE_WINDOW ? (posts[posts.length - 1]?.created_at ?? null) : null

      if (userId) {
        const { data: following } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', userId)
          .eq('status', 'accepted')
        const followingIds = (following || []).map(f => f.following_id)
        if (followingIds.length > 0) {
          const { data: reposts } = await supabase
            .from('reposts')
            .select('post_id, created_at, profiles!reposts_user_id_fkey(id,username,avatar_url,is_verified,verification_type)')
            .in('post_id', posts.map(p => p.id))
            .in('user_id', followingIds)
            .order('created_at', { ascending: false })

          if (reposts && reposts.length > 0) {
            const repostMap = new Map<string, any[]>()
            for (const r of reposts as any[]) {
              const existing = repostMap.get(r.post_id) ?? []
              if (r.profiles) existing.push(r.profiles)
              repostMap.set(r.post_id, existing)
            }
            posts = posts.map(p => repostMap.has(p.id) ? { ...p, reposted_by: repostMap.get(p.id) } : p)
          }
        }
      }

      // Safety/Spam Filter -> Feature Calc -> Personalization -> Ranking ->
      // Freshness/Exploration -> Diversity (see rankReels). Falls back to
      // plain chronological (trimmed to one page) if the ranking pipeline
      // itself throws for any reason - a reel must never simply fail to
      // appear because of a bug or a not-yet-run migration in the
      // personalization layer.
      let ranked = posts.slice(0, REELS_PAGE_SIZE)
      try {
        const ctx = await getViewerContext(supabase, userId)
        const result = rankReels(posts, ctx, REELS_PAGE_SIZE)
        ranked = result
      } catch (err) {
        console.error('reels ranking failed, showing chronological order', err)
      }

      return { posts: ranked, nextCursor }
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 30000,
  })
}
