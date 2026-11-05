import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isCallReactionId } from '@/lib/call-reactions'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type RequestBody = { reaction?: unknown; recipientIds?: unknown }

export async function POST(request: NextRequest, { params }: { params: Promise<{ groupCallId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { groupCallId } = await params
  if (!UUID_RE.test(groupCallId)) return NextResponse.json({ error: 'Invalid group call ID' }, { status: 400 })

  let body: RequestBody
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!isCallReactionId(body.reaction)) {
    return NextResponse.json({ error: 'Choose a valid call reaction' }, { status: 400 })
  }
  if (!Array.isArray(body.recipientIds) || body.recipientIds.length < 1 || body.recipientIds.length > 9 ||
      body.recipientIds.some((id) => typeof id !== 'string' || !UUID_RE.test(id))) {
    return NextResponse.json({ error: 'Select at least one and no more than nine recipients' }, { status: 400 })
  }

  const recipientIds = [...new Set(body.recipientIds as string[])]
  if (recipientIds.length !== body.recipientIds.length || recipientIds.includes(user.id)) {
    return NextResponse.json({ error: 'Recipient selection is invalid' }, { status: 400 })
  }

  const [{ data: call, error: callError }, { data: senderMembership, error: senderError }, { data: memberships, error: recipientsError }] = await Promise.all([
    supabase.from('group_calls').select('id,status').eq('id', groupCallId).maybeSingle(),
    supabase.from('group_call_participants').select('status').eq('group_call_id', groupCallId).eq('user_id', user.id).maybeSingle(),
    supabase.from('group_call_participants').select('user_id,status').eq('group_call_id', groupCallId).in('user_id', recipientIds),
  ])

  if (callError || senderError || recipientsError) {
    console.error('[group-calls/reactions] membership validation failed', callError || senderError || recipientsError)
    return NextResponse.json({ error: 'Could not verify group call participants' }, { status: 500 })
  }
  if (!call || call.status !== 'active') return NextResponse.json({ error: 'This group call is no longer active' }, { status: 409 })
  if (senderMembership?.status !== 'joined') {
    return NextResponse.json({ error: 'Only joined participants can send group-call reactions' }, { status: 403 })
  }

  const joinedRecipientIds = new Set((memberships || []).filter((item) => item.status === 'joined').map((item) => item.user_id))
  if (recipientIds.some((id) => !joinedRecipientIds.has(id))) {
    return NextResponse.json({ error: 'Every selected recipient must still be in this group call' }, { status: 409 })
  }

  const [{ data: senderProfile }, adminConfig] = await Promise.all([
    supabase.from('profiles').select('username,full_name,avatar_url').eq('id', user.id).maybeSingle(),
    Promise.resolve({
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    }),
  ])
  if (!adminConfig.url || !adminConfig.key) {
    console.error('[group-calls/reactions] server-side Supabase credentials are missing')
    return NextResponse.json({ error: 'Reaction delivery is temporarily unavailable' }, { status: 503 })
  }

  const eventId = crypto.randomUUID()
  const senderName = senderProfile?.full_name || senderProfile?.username || 'Participant'
  const deliveries = await Promise.all(recipientIds.map(async (recipientId) => {
    const topic = `group-call-reactions:${groupCallId}:${recipientId}`
    try {
      // Private channels require the REST endpoint's private=true flag.
      // The batch endpoint does not expose that flag, so it silently sends
      // a public broadcast that private subscribers will never receive.
      const response = await fetch(
        `${adminConfig.url}/realtime/v1/api/broadcast/${encodeURIComponent(topic)}/events/call-reaction?private=true`,
        {
          method: 'POST',
          cache: 'no-store',
          headers: {
            apikey: adminConfig.key,
            Authorization: `Bearer ${adminConfig.key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: eventId,
            callId: groupCallId,
            reaction: body.reaction,
            senderId: user.id,
            senderName,
            senderAvatar: senderProfile?.avatar_url || null,
            recipientId,
          }),
        },
      )
      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        console.error('[group-calls/reactions] private broadcast failed', recipientId, response.status, detail)
        return { recipientId, ok: false }
      }
      return { recipientId, ok: true }
    } catch (error) {
      console.error('[group-calls/reactions] private broadcast request failed', recipientId, error)
      return { recipientId, ok: false }
    }
  }))

  const failed = deliveries.filter((item) => !item.ok)
  if (failed.length) {
    return NextResponse.json({
      error: 'Some reactions could not be delivered. Please try again.',
      deliveredCount: deliveries.length - failed.length,
      failedCount: failed.length,
    }, { status: 502 })
  }

  return NextResponse.json({ ok: true, eventId, deliveredCount: deliveries.length })
}
