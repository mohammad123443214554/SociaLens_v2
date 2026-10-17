import { PostWithProfile } from '@/lib/types/database.types'
import { ViewerContext } from './viewerContext'
import { diversify, pickExplorationSlots } from './scoring'
import { rankFeedPosts } from './rankFeedPosts'
import { dedupeById } from '@/lib/utils/adInsertion'

// Keep some room for discovery, while letting recent interests guide most slots.
const EXPLORE_DISCOVERY_RATIO = 0.1

/**
 * Explore ranking balances known interests with discovery.
 * Hard exclusions are applied before both ranking and discovery, so blocked
 * and explicitly hidden content can never leak back into exploration slots.
 */
export function rankExplorePosts(
  candidates: PostWithProfile[],
  ctx: ViewerContext,
  pageSize: number
): PostWithProfile[] {
  const safe = dedupeById(candidates).filter(post =>
    !ctx.blockedUserIds.has(post.user_id) &&
    !ctx.notInterestedPostIds.has(post.id)
  )
  if (!safe.length) return []

  const ranked = rankFeedPosts(safe, ctx)
  const discoveryCount = Math.min(
    Math.max(0, Math.round(pageSize * EXPLORE_DISCOVERY_RATIO)),
    Math.max(0, safe.length - 1)
  )
  if (discoveryCount === 0) return ranked.slice(0, pageSize)

  const chosen = ranked.slice(0, Math.max(1, pageSize - discoveryCount))
  const chosenIds = new Set(chosen.map(post => post.id))
  const discovery = pickExplorationSlots(safe, chosenIds, discoveryCount)
    .filter(post => !chosenIds.has(post.id))
  const includedIds = new Set([...chosen, ...discovery].map(post => post.id))
  const fill = ranked.filter(post => !includedIds.has(post.id))
  return diversify([...chosen, ...discovery, ...fill], 1).slice(0, pageSize)
}
