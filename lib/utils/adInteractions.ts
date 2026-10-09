'use client'

/**
 * Local-only "engagement" for sponsored ad slots (AdPostSlot, AdReelSlot,
 * AdStoryViewer). An ad isn't a real row in `posts`/`stories` - there's
 * nothing to like/comment/save server-side - but product-wise it should
 * still *feel* exactly like liking/commenting/saving a real post, purely
 * for the person's own device. So every read/write here goes straight to
 * `window.localStorage` and NEVER touches Supabase:
 *   - it never lands in the real `likes` table, so it can't show up on
 *     anyone's Liked list or trigger a real notification
 *   - it never lands in `saved_posts`, so it can't show up on the Saved
 *     page/folders
 *   - it never lands in `comments`, so nobody else ever sees it
 *
 * Each ad slot gets a stable id (pass a React `useId()`-derived string in)
 * so its state survives re-renders of that same mounted slot, without
 * being shared across different ad slots or synced anywhere else.
 */

export interface LocalAdComment {
  id: string
  content: string
  createdAt: string
  authorName: string
  authorAvatar?: string | null
}

export interface AdInteractionState {
  liked: boolean
  likesCount: number
  saved: boolean
  reaction: string | null
  comments: LocalAdComment[]
}

const STORAGE_KEY = 'socialens_ad_interactions_v1'
type StoreShape = Record<string, AdInteractionState>

function readStore(): StoreShape {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoreShape) : {}
  } catch {
    return {}
  }
}

function writeStore(store: StoreShape) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // Storage full/unavailable/disabled (private browsing, etc.) - ad
    // engagement is cosmetic only, so just drop it silently rather than
    // breaking the ad slot over it.
  }
}

// Deterministic starting "N likes" per ad id, so a freshly-mounted ad
// slot doesn't show 0 likes (which would look dead/broken) but also
// doesn't reshuffle to a different number on every re-render.
function baseLikesForId(adId: string): number {
  let hash = 0
  for (let i = 0; i < adId.length; i++) hash = (hash * 31 + adId.charCodeAt(i)) >>> 0
  return 6 + (hash % 40) // feels like a normal small/medium post: 6-45
}

function defaultStateFor(adId: string): AdInteractionState {
  return { liked: false, likesCount: baseLikesForId(adId), saved: false, reaction: null, comments: [] }
}

export function getAdState(adId: string): AdInteractionState {
  const store = readStore()
  return store[adId] ?? defaultStateFor(adId)
}

function updateState(adId: string, updater: (current: AdInteractionState) => AdInteractionState): AdInteractionState {
  const store = readStore()
  const current = store[adId] ?? defaultStateFor(adId)
  const next = updater(current)
  store[adId] = next
  writeStore(store)
  return next
}

export function toggleAdLike(adId: string): AdInteractionState {
  return updateState(adId, (current) => {
    const liked = !current.liked
    return { ...current, liked, likesCount: Math.max(0, current.likesCount + (liked ? 1 : -1)) }
  })
}

export function toggleAdSave(adId: string): AdInteractionState {
  return updateState(adId, (current) => ({ ...current, saved: !current.saved }))
}

/** Sets (or clears, by passing the same emoji again) a story-style quick reaction. */
export function setAdReaction(adId: string, emoji: string): AdInteractionState {
  return updateState(adId, (current) => ({ ...current, reaction: current.reaction === emoji ? null : emoji }))
}

export function addAdComment(adId: string, content: string, author: { name: string; avatar?: string | null }): AdInteractionState {
  return updateState(adId, (current) => {
    const comment: LocalAdComment = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      content,
      createdAt: new Date().toISOString(),
      authorName: author.name,
      authorAvatar: author.avatar ?? null,
    }
    return { ...current, comments: [...current.comments, comment] }
  })
}
