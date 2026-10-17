import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { analyzeAndStorePostContent } from '@/lib/recommendation/contentUnderstanding'

export const runtime = 'nodejs'
export const maxDuration = 60

// Process exactly one unanalysed video per request. Concurrent Gemini calls
// were exceeding the free-tier requests-per-minute quota.
export async function POST(request: Request) {
  const sessionClient = await createClient()
  const { data: { user } } = await sessionClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey || !process.env.SOCIALENS_ALGORITHM_GEMINI_API_KEY) {
    return NextResponse.json({ ok: false, reason: 'content_analysis_not_configured' }, { status: 503 })
  }

  let interactionId: string | undefined
  try {
    const body = await request.json()
    if (typeof body?.interactionId === 'string' && /^v1_[A-Za-z0-9_-]+$/.test(body.interactionId)) {
      interactionId = body.interactionId
    }
  } catch {
    // Initial request has no body; start a new background interaction.
  }

  const admin = createSupabaseClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: analysedRows, error: analysisLookupError } = await admin
    .from('post_content_analysis')
    .select('post_id')
  if (analysisLookupError) {
    console.error('Recommendation backfill analysis lookup failed', analysisLookupError.message)
    return NextResponse.json({ error: 'Could not inspect existing video analyses' }, { status: 500 })
  }

  const analysedIds = new Set((analysedRows ?? []).map((row: { post_id: string }) => row.post_id))
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

  const missing = (videos ?? []).filter((post: { id: string }) => !analysedIds.has(post.id))
  if (missing.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, failed: 0, remaining: 0 })
  }

  // One request = one Gemini analysis. Do not use Promise.all here.
  const post = missing[0]
  let result: Awaited<ReturnType<typeof analyzeAndStorePostContent>>
  try {
    result = await analyzeAndStorePostContent(post, interactionId)
  } catch (error) {
    console.error('Recommendation backfill analysis failed', post.id, error)
    return NextResponse.json({ ok: false, processed: 0, failed: 1, remaining: missing.length, reason: 'analysis_failed' }, { status: 502 })
  }

  if (result.pending && result.interactionId) {
    return NextResponse.json({ ok: true, pending: true, interactionId: result.interactionId, remaining: missing.length }, { status: 202 })
  }

  if (!result.ok) {
    console.error('Recommendation backfill analysis returned failure', post.id, result.reason)
    if (result.retryable) {
      return NextResponse.json({
        ok: false,
        retryable: true,
        retryAfterMs: result.retryAfterMs,
        processed: 0,
        failed: 0,
        remaining: missing.length,
        reason: result.reason || 'gemini_temporarily_unavailable',
      }, { status: 503 })
    }
    return NextResponse.json({
      ok: false,
      processed: 0,
      failed: 1,
      remaining: missing.length,
      reason: result.reason || 'analysis_failed',
    }, { status: 502 })
  }

  const processed = result.skipped ? 0 : 1
  const { data: latestAnalysisRows, error: latestAnalysisError } = await admin
    .from('post_content_analysis')
    .select('post_id')
  if (latestAnalysisError) {
    console.error('Recommendation backfill progress lookup failed', latestAnalysisError.message)
    return NextResponse.json({ ok: true, processed, failed: 0, remaining: null })
  }
  const latestAnalysedIds = new Set((latestAnalysisRows ?? []).map((row: { post_id: string }) => row.post_id))
  const remaining = (videos ?? []).filter((video: { id: string }) => !latestAnalysedIds.has(video.id)).length

  return NextResponse.json({ ok: true, processed, failed: 0, remaining })
}
