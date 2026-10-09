import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { deleteAccountCompletely } from '@/lib/server/deleteAccount'

// Called on a schedule by Vercel Cron (see vercel.json - runs hourly).
// Anyone whose 24h suspension deadline has passed without their appeal
// being approved gets permanently deleted - account, posts, messages,
// everything. An appeal still pending review at the deadline does NOT
// Save them; only an *approved* appeal (which clears is_suspended)
// keeps this from happening.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const expected = process.env.CRON_SECRET
  if (expected && authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  const { data: expired, error } = await admin
    .from('profiles')
    .select('id, username')
    .eq('is_suspended', true)
    .lte('suspension_deadline', new Date().toISOString())

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results: { username: string; ok: boolean }[] = []
  for (const account of expired ?? []) {
    try {
      await deleteAccountCompletely(account.id)
      results.push({ username: account.username, ok: true })
    } catch (err) {
      console.error(`[cleanup-suspended] failed to delete ${account.username}:`, err)
      results.push({ username: account.username, ok: false })
    }
  }

  // Tidy up expired restrictions too, while this job is already running -
  // enforcement already checks the deadline directly wherever it matters,
  // so this is just housekeeping, not load-bearing. Runs every time,
  // regardless of whether any suspended account was also found above.
  const now = new Date().toISOString()
  await admin.from('profiles').update({ restrict_post_until: null }).lte('restrict_post_until', now)
  await admin.from('profiles').update({ restrict_comment_until: null }).lte('restrict_comment_until', now)
  await admin.from('profiles').update({ restrict_message_until: null }).lte('restrict_message_until', now)
  await admin.from('profiles').update({ restrict_story_until: null }).lte('restrict_story_until', now)

  return NextResponse.json({ deleted: results.filter(r => r.ok).length, results })
}
