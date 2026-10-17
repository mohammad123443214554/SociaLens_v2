import { PostWithProfile } from '@/lib/types/database.types'
import { ViewerContext } from './viewerContext'
import { dedupeById } from '@/lib/utils/adInsertion'
import { scorePost, diversify, pickExplorationSlots, REELS_WEIGHTS } from './scoring'

const HARD_HIDE_REPORT_COUNT = 8 // heavily-reported content is hidden pending moderation, regardless of score
const EXPLORATION_RATIO = 0.2 // ~1 in 5 slots reserved for fair discovery of new/low-exposure reels

/**
 * Candidates: a chronologically-fetched window of reels (bigger than one
 * page - see useReelsPosts) already scoped to what RLS/privacy allows.
 * Runs: Safety/Spam Filter -> Feature Calc (already on each row) ->
 * Personalization -> Ranking -> Freshness/Exploration -> Diversity.
 */
export function rankReels(candidates: PostWithProfile[], ctx: ViewerContext, pageSize: number): PostWithProfile[] {
  const safe = dedupeById(candidates).filter((p) =>
    !ctx.blockedUserIds.has(p.user_id) &&
    !ctx.notInterestedPostIds.has(p.id) &&
    ((p as any).report_count || 0) < HARD_HIDE_REPORT_COUNT
  )
  if (safe.length === 0) return []

  const scored = safe
    .map((post) => ({ post, score: scorePost(post, ctx.creatorAffinity, ctx.hashtagAffinity, REELS_WEIGHTS, ctx.contentAffinity, 36) }))
    .sort((a, b) => b.score - a.score)
    .map((s) => s.post)

  const explorationCount = Math.max(1, Math.round(pageSize * EXPLORATION_RATIO))
  const topRanked = scored.slice(0, Math.max(pageSize - explorationCount, 1))
  const chosenIds = new Set(topRanked.map((p) => p.id))
  const exploration = pickExplorationSlots(safe, chosenIds, explorationCount).filter((p) => !chosenIds.has(p.id))

  const includedIds = new Set([...topRanked, ...exploration].map(post => post.id))
  const fill = scored.filter(post => !includedIds.has(post.id))
  const combined = diversify([...topRanked, ...exploration, ...fill], 1)
  return combined.slice(0, pageSize)
}
