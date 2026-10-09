import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Every admin-only API route needs the same two checks: is someone
// signed in, and is their own profile flagged is_admin. Once both pass,
// hand back the service-role client so the route can read across every
// account's data - including private ones - without fighting normal
// user-scoped RLS. Centralized here so each route is just a couple of
// lines instead of repeating this block everywhere.
//
// Returns a discriminated union tagged on `ok` - callers check
// `if (!auth.ok) return auth.error` before touching `auth.admin`.
export async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false as const, error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  }

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!callerProfile?.is_admin) {
    return { ok: false as const, error: NextResponse.json({ error: 'Not authorized' }, { status: 403 }) }
  }

  return { ok: true as const, admin: createAdminClient(), user }
}
