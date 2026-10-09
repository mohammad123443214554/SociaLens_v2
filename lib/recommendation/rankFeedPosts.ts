import { PostWithProfile } from '@/lib/types/database.types'
import { ViewerContext } from './viewerContext'
import { scorePost, diversify, FEED_WEIGHTS } from './scoring'

/**
 * Re-ranks one already-fetched feed page (own + followed + reposts, plus
 * The occasional suggested top-up - see useFeedPosts) by relevance,
 * engagement and freshness, instead of showing it in raw chronological
 * order. This intentionally only reorders WITHIN a page rather than
 * across the whole follow graph, so the existing time-cursor pagination
 * (oldest-shown-item = next cursor) stays correct and nothing gets
 * skipped or duplicated at a page boundary.
 */
export function rankFeedPosts(candidates: PostWithProfile[], ctx: ViewerContext): PostWithProfile[] {
  const safe = candidates.filter((p) => !ctx.blockedUserIds.has(p.user_id) && !ctx.notInterestedPostIds.has(p.id))
  if (safe.length === 0) return candidates

  const scored = safe
    .map((post) => ({ post, score: scorePost(post, ctx.creatorAffinity, ctx.hashtagAffinity, FEED_WEIGHTS, 30) }))
    .sort((a, b) => b.score - a.score)
    .map((s) => s.post)

  return diversify(scored, 2)
}
