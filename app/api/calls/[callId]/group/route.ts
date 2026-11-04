import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/server/push'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest, { params }: { params: Promise<{ callId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { callId } = await params
  if (!UUID_RE.test(callId)) return NextResponse.json({ error: 'Invalid call ID' }, { status: 400 })

  let body: { userIds?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  if (!Array.isArray(body.userIds) || body.userIds.length < 1 || body.userIds.length > 8 ||
      body.userIds.some((id) => typeof id !== 'string' || !UUID_RE.test(id))) {
    return NextResponse.json({ error: 'Choose between 1 and 8 people from your message list' }, { status: 400 })
  }
  const userIds = [...new Set(body.userIds as string[])]
  if (userIds.length !== body.userIds.length || userIds.includes(user.id)) {
    return NextResponse.json({ error: 'The selected people list is invalid' }, { status: 400 })
  }

  const { data: call, error: callError } = await supabase
    .from('calls').select('id,caller_id,callee_id,type,status,provider,group_call_id')
    .eq('id', callId).maybeSingle()
  if (callError || !call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  if (user.id !== call.caller_id && user.id !== call.callee_id) return NextResponse.json({ error: 'You are not part of this call' }, { status: 403 })
  if (call.type !== 'audio' || call.status !== 'accepted') return NextResponse.json({ error: 'Only an active voice call can become a group call' }, { status: 409 })
  if (call.group_call_id) return NextResponse.json({ error: 'This call is already a group call' }, { status: 409 })
  if (call.provider !== 'agora') return NextResponse.json({ error: 'This call is using a provider that cannot be expanded without interrupting the conversation. Please try again on an Agora voice call.' }, { status: 409 })

  const { data: profiles, error: profileError } = await supabase
    .from('profiles').select('id,call_privacy').in('id', userIds)
  if (profileError) return NextResponse.json({ error: 'Could not verify invite permissions' }, { status: 500 })
  const allowedIds = new Set((profiles || []).filter((profile) => profile.call_privacy !== 'none').map((profile) => profile.id))
  if (userIds.some((id) => !allowedIds.has(id))) return NextResponse.json({ error: 'One or more selected people are not accepting calls' }, { status: 403 })

  const { data: groupCallId, error } = await supabase.rpc('convert_active_voice_call_to_group', {
    p_call_id: callId,
    p_invited_user_ids: userIds,
  })
  if (error) {
    const status = error.code === '42501' ? 403 : error.code === '22023' ? 409 : 500
    return NextResponse.json({ error: error.message || 'Could not add people to this call' }, { status })
  }

  const { data: callerProfile } = await supabase.from('profiles')
    .select('username,full_name').eq('id', user.id).maybeSingle()
  const callerName = callerProfile?.full_name || callerProfile?.username || 'Someone'
  await Promise.all(userIds.map(async (inviteeId) => {
    try {
      await sendPushToUser(inviteeId, {
        title: 'Incoming Group Voice Call',
        body: `${callerName} added you to an ongoing group voice call`,
        url: '/chat',
        kind: 'generic',
        tag: `group-call-${groupCallId}`,
      })
    } catch (pushError) {
      console.error('[calls/group] push delivery failed', inviteeId, pushError)
    }
  }))

  return NextResponse.json({ ok: true, groupCallId, invitedCount: userIds.length }, { status: 201 })
}
