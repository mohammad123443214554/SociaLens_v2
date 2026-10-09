import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// SERVER-ONLY. Uses the service role key, which bypasses Row Level Security.
// Never import this in a Client Component or expose it to the browser.
// Only used by the /api/stories/cleanup cron route to delete expired stories
// (and their storage files) on behalf of every user, which a normal
// user-scoped client can't do since RLS only lets people delete their own.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var')
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
