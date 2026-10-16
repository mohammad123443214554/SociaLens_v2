import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { analyzeAndStorePostContent } from '@/lib/recommendation/contentUnderstanding'

export const runtime = 'nodejs'
export const maxDuration = 60

// Existing reels created before content analysis was introduced need the same
// trusted labels as newly uploaded reels. Only authenticated requests can start
// a small bounded batch; the server chooses public video posts and uses service
// role only for reading missing labels/writing analysis.
export async function POST() {
  const sessionClient = await createClient()
  const { data: { user } } = await sessionClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey || !process.env.SOCIALENS_ALGORITHM_GEMINI_API_KEY) {
    return NextResponse.json({ ok: false, reason: 'content_analysis_not_configured' }, { status: 503 })
  }

  const admin = createSupabaseClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: labelledRows, error: labelsError } = await admin
    .from('post_content_analysis_labels')
    .select('post_id')
  if (labelsError) {
    console.error('Recommendation backfill label lookup failed', labelsError.message)
    return NextResponse.json({ error: 'Could not inspect existing reel labels' }, { status: 500 })
  }

  const labelledIds = new Set((labelledRows ?? []).map((row: { post_id: string }) => row.post_id))
  const { data: videos, error: videosError } = await admin
    .from('posts')
    .select('id, user_id, content, media_url, media_type, created_at')
    .eq('media_type', 'video')
    .not('media_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(100)

  if (videosError) {
    console.error('Recommendation backfill video lookup failed', videosError.message)
    return NextResponse.json({ error: 'Could not load reels for analysis' }, { status: 500 })
  }

  const missing = (videos ?? [])
    .filter((post: { id: string }) => !labelledIds.has(post.id))
    .slice(0, 4)

  if (missing.length === 0) return NextResponse.json({ ok: true, processed: 0, remaining: 0 })

  const results = await Promise.all(missing.map(async (post: any) => {
    try {
      const result = await analyzeAndStorePostContent(post)
      return { ok: result.ok, reason: result.reason }
    } catch (error) {
      console.error('Recommendation backfill analysis failed', post.id, error)
      return { ok: false, reason: 'analysis_failed' }
    }
  }))

  const processed = results.filter(result => result.ok).length
  const { count: remaining } = await admin
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('media_type', 'video')
    .not('media_url', 'is', null)

  const remainingUnlabelled = Math.max(0, (remaining ?? 0) - labelledIds.size - processed)
  return NextResponse.json({
    ok: true,
    processed,
    failed: results.length - processed,
    remaining: remainingUnlabelled,
  })
}
