import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server/requireAdmin'

// Every account shows up here regardless of is_private - privacy controls
// who else on the platform can see someone's content, it was never meant
// To hide people from moderation. Search matches username or full name.
export async function GET(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error
  const { admin } = auth

  const q = request.nextUrl.searchParams.get('q')?.trim()

  let query = admin
    .from('profiles')
    .select('id, username, full_name, avatar_url, is_private, is_admin, is_suspended, is_verified, verification_type, posts_count, followers_count, created_at')
    .order('username', { ascending: true })
    .limit(100)

  if (q) {
    query = query.or(`username.ilike.%${q}%,full_name.ilike.%${q}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ accounts: data })
}
