import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { RtcRole, RtcTokenBuilder } from 'agora-token'

const TOKEN_TTL_SECONDS = 2 * 60 * 60
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function buildUid(userId: string, attempt: unknown) {
  let hash = 0
  for (const ch of userId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  const base = (hash % 900_000_000) + 1
  const retry = Math.min(Math.max(Math.trunc(Number(attempt)) || 0, 0), 3)
  return base + retry * 1_000_000_000
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ groupCallId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { groupCallId } = await params
  if (!UUID_RE.test(groupCallId)) return NextResponse.json({ error: 'Invalid group call ID' }, { status: 400 })

  let body: { attempt?: unknown } = {}
  try { body = await request.json() } catch { /* optional retry body */ }

  const { data: membership, error: membershipError } = await supabase
    .from('group_call_participants')
    .select('status')
    .eq('group_call_id', groupCallId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (membershipError) {
    console.error('[group-calls/connect] membership lookup failed', membershipError)
    return NextResponse.json({ error: 'Could not verify group-call membership' }, { status: 500 })
  }
  if (membership?.status !== 'joined') {
    return NextResponse.json({ error: 'Only joined participants can connect to this group call' }, { status: 403 })
  }

  const { data: call, error: callError } = await supabase
    .from('group_calls')
    .select('id,status,provider,room_name')
    .eq('id', groupCallId)
    .maybeSingle()

  if (callError || !call) return NextResponse.json({ error: 'Group call not found' }, { status: 404 })
  if (call.status !== 'active') return NextResponse.json({ error: 'This group call is no longer active' }, { status: 409 })

  const appId = process.env.AGORA_APP_ID
  const appCertificate = process.env.AGORA_APP_CERTIFICATE
  if (!appId || !appCertificate) {
    return NextResponse.json({ error: 'Group voice calling is not configured: Agora server credentials are missing.' }, { status: 503 })
  }

  const roomName = call.room_name || `socialens-group-${groupCallId}`
  const admin = createAdminClient()
  if (!call.room_name || call.provider !== 'agora') {
    const { error: updateError } = await admin.from('group_calls')
      .update({ provider: 'agora', room_name: roomName, updated_at: new Date().toISOString() })
      .eq('id', groupCallId)
      .eq('status', 'active')
    if (updateError) {
      console.error('[group-calls/connect] failed to persist Agora room', updateError)
      return NextResponse.json({ error: 'Could not prepare the group voice room' }, { status: 500 })
    }
  }

  const uid = buildUid(user.id, body.attempt)
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
  const token = RtcTokenBuilder.buildTokenWithUid(
    appId, appCertificate, roomName, uid, RtcRole.PUBLISHER, expiresAt, expiresAt
  )

  return NextResponse.json({
    provider: 'agora',
    appId,
    channel: roomName,
    token,
    uid,
    expiresAt,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
