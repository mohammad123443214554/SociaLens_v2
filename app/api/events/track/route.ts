import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const VALID_EVENT_TYPES = new Set([
  'view', 'watch_time', 'completion', 'rewatch', 'like', 'comment',
  'save', 'share', 'follow', 'profile_visit', 'skip', 'not_interested', 'report',
])
const VALID_TARGET_TYPES = new Set(['post', 'reel', 'story'])
const MAX_BATCH = 100

// Receives a batch of recommendation-signal events from useTrackEvent and
// folds them into the ranking aggregates via one database round trip
// (record_content_events_batch). sendBeacon posts a Blob with no
// Content-Type header control, so this reads the raw body as text rather
// than trusting request.json()'s content-type sniffing.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

    const raw = await request.text()
    const body = JSON.parse(raw)
    const events = Array.isArray(body?.events) ? body.events : []
    if (events.length === 0) return NextResponse.json({ ok: true, processed: 0 })

    // Never trust the client for whose event this is, or for anything
    // outside the known event/target vocab.
    const clean = events
      .filter((e: any) =>
        VALID_EVENT_TYPES.has(e?.event_type) &&
        VALID_TARGET_TYPES.has(e?.target_type) &&
        typeof e?.target_id === 'string'
      )
      .slice(0, MAX_BATCH)
      .map((e: any) => ({
        user_id: user.id,
        target_type: e.target_type,
        target_id: e.target_id,
        creator_id: e.creator_id || null,
        event_type: e.event_type,
        watch_seconds: typeof e.watch_seconds === 'number' ? e.watch_seconds : null,
        video_duration: typeof e.video_duration === 'number' ? e.video_duration : null,
      }))

    if (clean.length === 0) return NextResponse.json({ ok: true, processed: 0 })

    const { error } = await supabase.rpc('record_content_events_batch', { p_events: clean })
    if (error) throw error

    return NextResponse.json({ ok: true, processed: clean.length })
  } catch (err) {
    // Best-effort telemetry - never let a broken batch surface as a user-
    // facing error (a like/save/share elsewhere already has its own
    // direct write; this is only the ranking signal on top of that).
    console.error('event track error', err)
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
