import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeQualityScore,
  diversify,
  engagementScore,
  extractHashtags,
  freshnessScore,
  personalizationScore,
  pickExplorationSlots,
  scorePost,
  FEED_WEIGHTS,
} from '../lib/recommendation/scoring.ts'

function post(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post-1',
    user_id: 'creator-a',
    content: 'Funny #Hindi #Comedy #hindi',
    created_at: new Date().toISOString(),
    media_type: 'video',
    views_count: 100,
    likes_count: 10,
    comments_count: 2,
    shares_count: 1,
    report_count: 0,
    ...overrides,
  } as any
}

const empty = new Map<string, number>()

test('hashtags are normalized and duplicates are removed', () => {
  assert.deepEqual(extractHashtags('#Hindi #Comedy #hindi'), ['hindi', 'comedy'])
  assert.deepEqual(extractHashtags(null), [])
})

test('freshness is highest for new posts and decays with age', () => {
  const now = Date.now()
  const fresh = freshnessScore(new Date(now).toISOString(), 48)
  const old = freshnessScore(new Date(now - 48 * 60 * 60 * 1000).toISOString(), 48)
  assert.ok(fresh > old)
  assert.ok(Math.abs(old - 0.5) < 0.02)
  assert.equal(freshnessScore('not-a-date'), 0)
})

test('engagement and quality scores remain finite for sparse/zero metrics', () => {
  const sparse = post({ views_count: 0, likes_count: 0, comments_count: 0, shares_count: 0 })
  assert.ok(Number.isFinite(engagementScore(sparse)))
  assert.ok(Number.isFinite(computeQualityScore(sparse)))
  assert.ok(Number.isFinite(scorePost(sparse, empty, empty, FEED_WEIGHTS)))
})

test('matching content affinity increases personalization', () => {
  const candidate = post({ recommendation_labels: [
    { label_type: 'topic', label_slug: 'comedy', relevance: 1 },
  ] })
  const affinity = new Map([['topic:comedy', 8]])
  assert.ok(personalizationScore(candidate, empty, empty, affinity) >
    personalizationScore(candidate, empty, empty, empty))
})

test('missing recommendation labels safely fall back to creator/hashtag signals', () => {
  const candidate = post({ recommendation_labels: undefined })
  const score = personalizationScore(candidate, new Map([['creator-a', 5]]), new Map([['hindi', 4]]))
  assert.ok(Number.isFinite(score))
  assert.ok(score > 0)
})

test('diversity interleaves creators without dropping candidates', () => {
  const ranked = [
    { id: '1', user_id: 'a' },
    { id: '2', user_id: 'a' },
    { id: '3', user_id: 'a' },
    { id: '4', user_id: 'b' },
  ]
  const result = diversify(ranked, 1)
  assert.equal(result.length, ranked.length)
  assert.deepEqual(result.map(x => x.id), ['1', '4', '2', '3'])
})

test('exploration only returns unchosen low-exposure candidates', () => {
  const candidates = [
    post({ id: 'chosen', views_count: 1 }),
    post({ id: 'fresh', views_count: 3, created_at: new Date(Date.now() - 1000).toISOString() }),
    post({ id: 'popular', views_count: 500 }),
  ]
  const result = pickExplorationSlots(candidates, new Set(['chosen']), 5)
  assert.deepEqual(result.map(x => x.id), ['fresh'])
})

test('ranking score stays finite for negative and unusually large counters', () => {
  const candidate = post({
    views_count: -4,
    likes_count: 1_000_000,
    comments_count: 1_000_000,
    shares_count: 1_000_000,
    report_count: 1_000_000,
  })
  assert.ok(Number.isFinite(scorePost(candidate, empty, empty, FEED_WEIGHTS)))
})
