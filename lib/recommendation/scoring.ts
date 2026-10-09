import { PostWithProfile } from '@/lib/types/database.types'

// ---- Freshness -------------------------------------------------------
// Exponential decay - a brand-new post starts at 1.0 and fades toward 0
// over `halfLifeHours`, so recency matters without a hard cliff.
export function freshnessScore(createdAt: string, halfLifeHours = 48): number {
  const ageHours = (Date.now() - new Date(createdAt).getTime()) / 3_600_000
  return Math.pow(0.5, ageHours / halfLifeHours)
}

// ---- Engagement --------------------------------------------------------
// Deliberately NOT likes-dominated: comments/shares/saves take real
// intent (typing, choosing someone to send to, coming back to it later)
// and outweigh a like, which costs nothing. Watch behavior counts too,
// For video.
export function engagementScore(post: PostWithProfile): number {
  const views = Math.max(post.views_count || 0, 1)
  const likeRate = (post.likes_count || 0) / views
  const commentRate = (post.comments_count || 0) / views
  const shareRate = (post.shares_count || 0) / views
  const savedCount = (post as any).saved_count || 0
  const saveRate = savedCount / views

  const watchSessions = (post as any).watch_sessions || 0
  const avgWatchSeconds = watchSessions > 0 ? ((post as any).total_watch_seconds || 0) / watchSessions : 0
  const completionRate = watchSessions > 0 ? ((post as any).completion_count || 0) / watchSessions : 0
  const rewatchRate = watchSessions > 0 ? ((post as any).rewatch_count || 0) / watchSessions : 0

  // Negative feedback pulls the score down hard - a handful of
  // Not-Interested/skips on a small-reach post should matter a lot more
  // than the same count on something with huge reach.
  const negativeRate = (((post as any).not_interested_count || 0) * 3 + ((post as any).skip_count || 0)) / views

  return (
    likeRate * 1.0 +
    commentRate * 2.5 +
    shareRate * 3.0 +
    saveRate * 3.0 +
    Math.min(completionRate, 1) * 2.5 +
    Math.min(rewatchRate, 1) * 2.0 +
    Math.min(avgWatchSeconds / 15, 1) * 1.5 -
    Math.min(negativeRate, 1) * 4.0
  )
}

// ---- Quality / spam -----------------------------------------------------
// quality_score lives on the post row (0-1, defaults to 0.5) - lowered
// by report volume relative to reach, and by extremely low completion on
// a video that's had real exposure (a common bot/spam fingerprint:
// lots of raw views, ~nobody actually watches).
export function computeQualityScore(post: PostWithProfile): number {
  const views = Math.max(post.views_count || 0, 1)
  const reportRate = (post.report_count || 0) / views
  const watchSessions = (post as any).watch_sessions || 0
  const completionRate = watchSessions > 5 ? ((post as any).completion_count || 0) / watchSessions : 0.5

  let score = 0.5 + completionRate * 0.3 - reportRate * 5
  if (post.media_type !== 'video') score = 0.5 // completion doesn't apply to photos/text
  return Math.max(0, Math.min(1, score))
}

// ---- Personalization -----------------------------------------------------
export function personalizationScore(
  post: PostWithProfile,
  creatorAffinity: Map<string, number>,
  hashtagAffinity: Map<string, number>
): number {
  const creatorScore = creatorAffinity.get(post.user_id) ?? 0
  const tags = extractHashtags(post.content)
  const tagScore = tags.length
    ? tags.reduce((sum, t) => sum + (hashtagAffinity.get(t) ?? 0), 0) / tags.length
    : 0
  // Squash with tanh so one extreme outlier (e.g. a single mega-share)
  // can't dominate the whole ranking on its own.
  return Math.tanh(creatorScore / 10) * 3 + Math.tanh(tagScore / 10) * 2
}

export function extractHashtags(content: string | null): string[] {
  if (!content) return []
  const matches = content.match(/#([A-Za-z0-9_]{2,30})/g) || []
  return Array.from(new Set(matches.map((m) => m.slice(1).toLowerCase())))
}

// ---- Final blended score --------------------------------------------
export interface ScoreWeights {
  engagement: number
  personalization: number
  freshness: number
  quality: number
}

export const REELS_WEIGHTS: ScoreWeights = { engagement: 1.0, personalization: 1.4, freshness: 0.8, quality: 1.2 }
export const FEED_WEIGHTS: ScoreWeights = { engagement: 1.2, personalization: 1.0, freshness: 1.3, quality: 1.0 }

export function scorePost(
  post: PostWithProfile,
  creatorAffinity: Map<string, number>,
  hashtagAffinity: Map<string, number>,
  weights: ScoreWeights,
  halfLifeHours = 48
): number {
  const quality = (post as any).quality_score ?? computeQualityScore(post)
  return (
    engagementScore(post) * weights.engagement +
    personalizationScore(post, creatorAffinity, hashtagAffinity) * weights.personalization +
    freshnessScore(post.created_at, halfLifeHours) * weights.freshness +
    quality * weights.quality
  )
}

// ---- Diversity ------------------------------------------------------
// Re-orders an already-ranked list so the same creator never appears
// twice in a row (bumped a little further down instead of dropped), the
// same lightweight interleaving Instagram/TikTok use so one prolific
// creator can't fill an entire session.
export function diversify<T extends { user_id: string }>(ranked: T[], maxConsecutive = 1): T[] {
  const result: T[] = []
  const remaining = [...ranked]
  let lastCreator: string | null = null
  let streak = 0

  while (remaining.length > 0) {
    let idx = remaining.findIndex((p) => p.user_id !== lastCreator || streak < maxConsecutive)
    if (idx === -1) idx = 0
    const [picked] = remaining.splice(idx, 1)
    if (picked.user_id === lastCreator) streak++
    else { lastCreator = picked.user_id; streak = 1 }
    result.push(picked)
  }
  return result
}

// ---- Exploration ------------------------------------------------------
// Reserves a slice of the final list for fair discovery: very-new posts
// (little or no engagement data yet) and posts from creators the viewer
// has no history with. This is what gives a brand-new account/reel real
// exposure instead of a chronic cold start - not a "new account" bonus,
// just guaranteed slots to actually be seen and judged on their own
// merit before the algorithm has an opinion about them.
export function pickExplorationSlots<T extends PostWithProfile>(
  candidates: T[],
  alreadyChosenIds: Set<string>,
  count: number
): T[] {
  const fresh = candidates.filter((p) => !alreadyChosenIds.has(p.id) && (p.views_count || 0) < 20)
  // Newest-first among the low-exposure pool, then a light shuffle so
  // it's not always the exact same handful in the exact same order.
  const sorted = fresh.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  const pool = sorted.slice(0, count * 4)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, count)
}
