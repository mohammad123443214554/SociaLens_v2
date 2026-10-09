import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Deletes a user's entire footprint - every table row, every storage
 * file this app can find a path for, and finally the auth.users login
 * itself. Used both when someone deletes their own account and by the
 * Cron job that removes a suspended account once its 24h appeal window
 * has passed with no approved appeal.
 */
export async function deleteAccountCompletely(userId: string) {
  const admin = createAdminClient()

  await admin.from('notifications').delete().or(`user_id.eq.${userId},actor_id.eq.${userId}`)
  await admin.from('messages').delete().eq('sender_id', userId)
  await admin.from('chats').delete().or(`participant1_id.eq.${userId},participant2_id.eq.${userId}`)
  await admin.from('comments').delete().eq('user_id', userId)
  await admin.from('likes').delete().eq('user_id', userId)
  await admin.from('follows').delete().or(`follower_id.eq.${userId},following_id.eq.${userId}`)
  await admin.from('stories').delete().eq('user_id', userId)
  await admin.from('reports').delete().or(`reporter_id.eq.${userId},reported_user_id.eq.${userId}`)
  await admin.from('account_appeals').delete().eq('user_id', userId)

  const { data: posts } = await admin.from('posts').select('media_url').eq('user_id', userId)
  if (posts) {
    for (const post of posts) {
      if (post.media_url) {
        const path = post.media_url.split('/storage/v1/object/public/posts/')[1]
        if (path) await admin.storage.from('posts').remove([path])
      }
    }
  }
  await admin.from('posts').delete().eq('user_id', userId)

  await admin.from('profiles').delete().eq('id', userId)

  // Finally, remove the actual login account, freeing up the email/Google
  // account to be used again for a fresh signup.
  const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId)
  if (authDeleteError) throw new Error(authDeleteError.message)
}
