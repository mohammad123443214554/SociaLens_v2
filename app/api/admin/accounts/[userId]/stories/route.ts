import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server/requireAdmin'

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error
  const { admin } = auth
  const { userId } = await params

  // Only stories that haven't expired yet - "the stories that exist for
  // this account right now", same as the rest of the app treats stories.
  const { data, error } = await admin
    .from('stories')
    .select('*')
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ stories: data })
}
