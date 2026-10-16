import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const ALLOWED_EVENTS = new Set([
  'view',
  'watch_time',
  'completion',
  'rewatch',
  'like',
  'comment',
  'save',
  'share',
  'skip',
  'not_interested',
  'report',
])

// Return only the signed-in user's durable content taste profile.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('user_content_affinity')
    .select('label_type, label_slug, score, positive_signals, negative_signals, last_signal_at')
    .eq('user_id', user.id)
    .order('score', { ascending: false })
    .limit(100)

  if (error) {
    console.error('SociaLens personal taste profile lookup failed', error.message)
    return NextResponse.json({ error: 'Could not load personal taste profile' }, { status: 500 })
  }

  return NextResponse.json({ preferences: data ?? [] })
}

// The RPC derives user/creator identity and labels server-side; callers may
// submit only the target post and the interaction they actually performed.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: {
    post_id?: unknown
    event_type?: unknown
    watch_seconds?: unknown
    video_duration?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof body.post_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.post_id)) {
    return NextResponse.json({ error: 'A valid post_id is required' }, { status: 400 })
  }
  if (typeof body.event_type !== 'string' || !ALLOWED_EVENTS.has(body.event_type)) {
    return NextResponse.json({ error: 'Unsupported event_type' }, { status: 400 })
  }

  const numericOrNull = (value: unknown) => {
    if (value === undefined || value === null) return null
    const number = Number(value)
    return Number.isFinite(number) && number >= 0 ? number : null
  }
  const watchSeconds = numericOrNull(body.watch_seconds)
  const videoDuration = numericOrNull(body.video_duration)
  if (body.watch_seconds !== undefined && body.watch_seconds !== null && watchSeconds === null) {
    return NextResponse.json({ error: 'watch_seconds must be a non-negative number' }, { status: 400 })
  }
  if (body.video_duration !== undefined && body.video_duration !== null && videoDuration === null) {
    return NextResponse.json({ error: 'video_duration must be a non-negative number' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('record_personal_taste_signal', {
    p_post_id: body.post_id,
    p_event_type: body.event_type,
    p_watch_seconds: watchSeconds,
    p_video_duration: videoDuration,
  })

  if (error) {
    console.error('SociaLens personal taste signal failed', error.message)
    const status = error.code === 'P0002' ? 404 : error.code === '42501' ? 403 : 500
    return NextResponse.json({ error: 'Could not record personal taste signal' }, { status })
  }

  return NextResponse.json(data ?? { ok: true })
}
