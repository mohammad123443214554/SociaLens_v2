import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Deletes a user's app data and Auth identity.
 *
 * This function is server-only: callers must derive userId from a verified
 * Supabase session or a separately authorized administrative workflow.
 * Every Supabase result is checked so a failed cleanup step cannot be silently
 * followed by Auth deletion.
 */
export async function deleteAccountCompletely(userId: string) {
  if (!userId) throw new Error('Missing user ID for account deletion')

  const admin = createAdminClient()

  const assertOk = (step: string, error: { message: string } | null) => {
    if (error) {
      // Keep details in trusted server logs only; the API route returns a
      // generic error to the client.
      console.error(`Account deletion failed at ${step}:`, error.message)
      throw new Error(`Account deletion failed at ${step}`)
    }
  }

  // Capture the user's post media paths before deleting database rows.
  const { data: posts, error: postsReadError } = await admin
    .from('posts')
    .select('media_url')
    .eq('user_id', userId)
  assertOk('read post media', postsReadError)

  // Delete media before database records. A storage failure aborts the workflow
  // before Auth deletion, allowing a retry instead of silently orphaning files.
  const postPaths = (posts ?? [])
    .map((post) => {
      if (!post.media_url) return null
      try {
        const url = new URL(post.media_url)
        const marker = '/storage/v1/object/public/posts/'
        const index = url.pathname.indexOf(marker)
        if (index < 0) return null
        const path = decodeURIComponent(url.pathname.slice(index + marker.length))
        return path && !path.split('/').includes('..') ? path : null
      } catch {
        return null
      }
    })
    .filter((path): path is string => Boolean(path))

  // Renditions live beside public post media but are stored under a
  // dedicated owner-prefixed folder. Remove them before deleting the Auth
  // identity so account deletion cannot leave public converted copies behind.
  const renditionPaths: string[] = []
  let renditionOffset = 0
  while (true) {
    const { data: renditionFiles, error: renditionListError } = await admin.storage
      .from('posts')
      .list('video-renditions/' + userId, { limit: 1000, offset: renditionOffset })
    assertOk('list post video renditions', renditionListError)
    const page = renditionFiles ?? []
    renditionPaths.push(
      ...page
        .filter(file => file.name.toLowerCase().endsWith('.mp4'))
        .map(file => 'video-renditions/' + userId + '/' + file.name)
    )
    if (page.length < 1000) break
    renditionOffset += page.length
  }

  const allPostMediaPaths = [...new Set([...postPaths, ...renditionPaths])]
  if (allPostMediaPaths.length) {
    const { error } = await admin.storage.from('posts').remove(allPostMediaPaths)
    assertOk('remove post media and video renditions', error)
  }

  // These are explicit user-footprint records. The schema also has cascading
  // foreign keys for the remaining profile-owned rows; we do not grant client
  // roles extra permissions to perform this cleanup.
  const operations = [
    ['delete notifications', () =>
      admin.from('notifications').delete().or(`user_id.eq.${userId},actor_id.eq.${userId}`)],
    ['delete sent messages', () =>
      admin.from('messages').delete().eq('sender_id', userId)],
    ['delete chats', () =>
      admin.from('chats').delete().or(`participant1_id.eq.${userId},participant2_id.eq.${userId}`)],
    ['delete comments', () =>
      admin.from('comments').delete().eq('user_id', userId)],
    ['delete likes', () =>
      admin.from('likes').delete().eq('user_id', userId)],
    ['delete follows', () =>
      admin.from('follows').delete().or(`follower_id.eq.${userId},following_id.eq.${userId}`)],
    ['delete stories', () =>
      admin.from('stories').delete().eq('user_id', userId)],
    ['delete reports', () =>
      admin.from('reports').delete().or(`reporter_id.eq.${userId},reported_user_id.eq.${userId}`)],
    ['delete account appeals', () =>
      admin.from('account_appeals').delete().eq('user_id', userId)],
    ['delete posts', () =>
      admin.from('posts').delete().eq('user_id', userId)],
  ] as const

  for (const [step, run] of operations) {
    const result = await run()
    assertOk(step, result.error)
  }

  // Verify profile removal before deleting the Auth identity. This is the row
  // referenced by profiles_id_fkey and was the blocker seen in production logs.
  const { data: deletedProfiles, error: profileDeleteError } = await admin
    .from('profiles')
    .delete()
    .eq('id', userId)
    .select('id')
  assertOk('delete profile', profileDeleteError)
  if (!deletedProfiles || deletedProfiles.length === 0) {
    throw new Error('Account deletion failed at delete profile: profile row was not deleted')
  }

  // Only remove the Auth identity after database cleanup is confirmed.
  const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId)
  assertOk('delete Auth user', authDeleteError)
}
