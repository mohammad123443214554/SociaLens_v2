import { SupabaseClient } from '@supabase/supabase-js'

export type PrivacyLevel = 'everyone' | 'followers' | 'following' | 'selected' | 'none'

/**
 * Checks a single owner's privacy setting against one viewer - used
 * wherever there's exactly one owner to check (a call, the comments on
 * one post/story). For filtering a whole list of different owners at
 * once (e.g. the stories ring), batch-fetch follows/selected-people
 * yourself instead of calling this in a loop.
 *
 * The owner can always access their own content regardless of the
 * setting, and a logged-out viewer only ever passes the 'everyone' level.
 */
export async function canAccessByPrivacy(
  supabase: SupabaseClient,
  viewerId: string | undefined,
  ownerId: string,
  level: PrivacyLevel | null | undefined,
  category: string
): Promise<boolean> {
  const lvl: PrivacyLevel = level ?? 'everyone'

  if (!viewerId) return lvl === 'everyone'
  if (viewerId === ownerId) return true
  if (lvl === 'everyone') return true
  if (lvl === 'none') return false

  if (lvl === 'followers') {
    const { data } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', viewerId)
      .eq('following_id', ownerId)
      .eq('status', 'accepted')
      .maybeSingle()
    return !!data
  }

  if (lvl === 'following') {
    const { data } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', ownerId)
      .eq('following_id', viewerId)
      .eq('status', 'accepted')
      .maybeSingle()
    return !!data
  }

  if (lvl === 'selected') {
    const { data } = await supabase
      .from('privacy_selected_users')
      .select('id')
      .eq('owner_id', ownerId)
      .eq('category', category)
      .eq('selected_user_id', viewerId)
      .maybeSingle()
    return !!data
  }

  return true
}
