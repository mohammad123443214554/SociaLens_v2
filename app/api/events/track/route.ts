import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const VALID_EVENT_TYPES = new Set([
  'view', 'watch_time', 'completion', 'rewatch', 'like', 'comment',
  'save', 'share', 'follow', 'profile_visit', 'skip', 'not_interested', 'report',
])
const VALID_TARGET_TYPES = new Set(['post', 'reel', 'story'])
const MAX_BATCH = 100

// Batch incoming behavior signals. Post/reel events go through the trusted
// personal-taste RPC, which also updates legacy creator/hashtag aggregates.
// Story events retain the existing event pipeline.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

    const raw = await request.text()
    const body = JSON.parse(raw)
    const events = Array.isArray(body?.events) ? body.events : []
    if (events.length === 0) return NextResponse.json({ ok: true, processed: 0 })

    const clean = events
      .filter((e: any) =>
        VALID_EVENT_TYPES.has(e?.event_type) &&
        VALID_TARGET_TYPES.has(e?.target_type) &&
        typeof e?.target_id === 'string'
      )
      .slice(0, MAX_BATCH)
      .map((e: any) => ({
        target_type: e.target_type,
        target_id: e.target_id,
        event_type: e.event_type,
        watch_seconds: typeof e.watch_seconds === 'number' && Number.isFinite(e.watch_seconds) ? Math.max(0, e.watch_seconds) : null,
        video_duration: typeof e.video_duration === 'number' && Number.isFinite(e.video_duration) ? Math.max(0, e.video_duration) : null,
      }))

    if (clean.length === 0) return NextResponse.json({ ok: true, processed: 0 })

    const contentEvents = clean.filter((event: any) => event.target_type === 'post' || event.target_type === 'reel')
    const storyEvents = clean.filter((event: any) => event.target_type === 'story')
    let processed = 0

    if (contentEvents.length > 0) {
      const { data, error } = await supabase.rpc('record_personal_taste_events_batch', {
        p_events: contentEvents,
      })
      if (error) throw error
      processed += Number(data) || 0
    }

    if (storyEvents.length > 0) {
      const legacyStoryEvents = storyEvents.map((event: any) => ({
        user_id: user.id,
        target_type: event.target_type,
        target_id: event.target_id,
        creator_id: null,
        event_type: event.event_type,
        watch_seconds: event.watch_seconds,
        video_duration: event.video_duration,
      }))
      const { error } = await supabase.rpc('record_content_events_batch', { p_events: legacyStoryEvents })
      if (error) throw error
      processed += storyEvents.length
    }

    return NextResponse.json({ ok: true, processed })
  } catch (err) {
    // Telemetry is best-effort; don't surface signal-collection failures as
    // user-facing errors for likes, comments, or playback.
    console.error('event track error', err)
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
