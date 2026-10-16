import { SupabaseClient } from '@supabase/supabase-js'

export interface ViewerContext {
  creatorAffinity: Map<string, number>
  hashtagAffinity: Map<string, number>
  contentAffinity: Map<string, number>
  blockedUserIds: Set<string>
  notInterestedPostIds: Set<string>
}

// Bounded, indexed lookups only (top-N affinity rows, not a full table
// scan) - this runs on every feed/reels page load, So it has to stay
// cheap on Supabase's free plan.
export async function getViewerContext(supabase: SupabaseClient, userId: string | undefined): Promise<ViewerContext> {
  const empty: ViewerContext = {
    creatorAffinity: new Map(),
    hashtagAffinity: new Map(),
    contentAffinity: new Map(),
    blockedUserIds: new Set(),
    notInterestedPostIds: new Set(),
  }
  if (!userId) return empty

  const [{ data: creatorRows }, { data: hashtagRows }, { data: contentRows }, { data: blockRows }, { data: notInterestedRows }] = await Promise.all([
    supabase.from('user_creator_affinity').select('creator_id, score').eq('user_id', userId).order('score', { ascending: false }).limit(200),
    supabase.from('user_hashtag_affinity').select('hashtag, score').eq('user_id', userId).order('score', { ascending: false }).limit(200),
    supabase.from('user_content_affinity').select('label_type, label_slug, score').eq('user_id', userId).order('score', { ascending: false }).limit(300),
    supabase.from('blocks').select('blocker_id, blocked_id').or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`),
    supabase.from('post_not_interested').select('post_id').eq('user_id', userId),
  ])

  return {
    creatorAffinity: new Map((creatorRows || []).map((r: any) => [r.creator_id, r.score])),
    hashtagAffinity: new Map((hashtagRows || []).map((r: any) => [r.hashtag, r.score])),
    contentAffinity: new Map((contentRows || []).map((r: any) => [`${r.label_type}:${r.label_slug}`, Number(r.score) || 0])),
    blockedUserIds: new Set((blockRows || []).flatMap((b: any) => [b.blocker_id, b.blocked_id]).filter((id: string) => id !== userId)),
    notInterestedPostIds: new Set((notInterestedRows || []).map((r: any) => r.post_id)),
  }
}
