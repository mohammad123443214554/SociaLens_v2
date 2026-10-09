import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server/requireAdmin'

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error
  const { admin } = auth
  const { userId } = await params

  // Comments live on the story, not the account, so first find which
  // stories are currently active for this account, then pull every
  // Comment left on any of them.
  const { data: stories, error: storiesErr } = await admin
    .from('stories')
    .select('id')
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())

  if (storiesErr) return NextResponse.json({ error: storiesErr.message }, { status: 500 })

  const storyIds = (stories ?? []).map(s => s.id)
  if (storyIds.length === 0) return NextResponse.json({ storyComments: [] })

  const { data, error } = await admin
    .from('story_comments')
    .select('*, profiles(username, avatar_url), stories(id, story_type, media_url, text_content)')
    .in('story_id', storyIds)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ storyComments: data })
}
