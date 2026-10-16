import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { analyzeAndStorePostContent } from '@/lib/recommendation/contentUnderstanding'

export const runtime = 'nodejs'
export const maxDuration = 60

// Authenticated retry/backfill entry point. A user can request analysis only
// for their own post; generated labels are written by the server service role.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { post_id?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof body.post_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.post_id)) {
    return NextResponse.json({ error: 'A valid post_id is required' }, { status: 400 })
  }

  const { data: post, error } = await supabase
    .from('posts')
    .select('id, user_id, content, media_url, media_type')
    .eq('id', body.post_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    console.error('SociaLens content analysis post lookup failed', error.message)
    return NextResponse.json({ error: 'Could not load post' }, { status: 500 })
  }
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  try {
    const result = await analyzeAndStorePostContent(post)
    if (!result.ok) {
      const status = result.reason === 'missing_gemini_api_key' || result.reason === 'missing_supabase_service_role_key' ? 503 : 502
      return NextResponse.json({ error: result.reason || 'Analysis failed' }, { status })
    }
    return NextResponse.json({ ok: true, skipped: Boolean(result.skipped), analysis: result.analysis ?? null })
  } catch (error) {
    console.error('SociaLens content analysis failed', error)
    return NextResponse.json({ error: 'Content analysis failed' }, { status: 502 })
  }
}
