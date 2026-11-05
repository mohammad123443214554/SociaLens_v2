import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/server/push'
import { canAccessByPrivacy } from '@/lib/utils/privacyAccess'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest, { params }: { params: Promise<{ groupCallId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { groupCallId } = await params
  if (!UUID_RE.test(groupCallId)) return NextResponse.json({ error: 'Invalid group call ID' }, { status: 400 })

  let body: { userIds?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const userIds = Array.isArray(body.userIds) ? body.userIds : []
  if (!userIds.length || userIds.length > 9 || userIds.some((id) => typeof id !== 'string' || !UUID_RE.test(id))) {
    return NextResponse.json({ error: 'Choose between 1 and 9 valid users' }, { status: 400 })
  }

  const { data: groupCall, error: groupCallError } = await supabase
    .from('group_calls').select('type,status').eq('id', groupCallId).maybeSingle()
  if (groupCallError || !groupCall) return NextResponse.json({ error: 'Group call not found' }, { status: 404 })
  if (groupCall.status !== 'active') return NextResponse.json({ error: 'This group call has ended' }, { status: 409 })

  const { data: inviteProfiles, error: inviteProfilesError } = await supabase
    .from('profiles').select('id,call_privacy').in('id', [...new Set(userIds as string[])])
  if (inviteProfilesError) return NextResponse.json({ error: 'Could not verify invite permissions' }, { status: 500 })
  const privacyById = new Map((inviteProfiles || []).map((profile) => [profile.id, profile.call_privacy]))
  for (const inviteeId of [...new Set(userIds as string[])]) {
    if (!privacyById.has(inviteeId) || !(await canAccessByPrivacy(supabase, user.id, inviteeId, privacyById.get(inviteeId), 'call'))) {
      return NextResponse.json({ error: 'One or more selected people are not accepting calls' }, { status: 403 })
    }
  }

  const { data: invitedCount, error } = await supabase.rpc('invite_group_voice_call_participants', {
    p_group_call_id: groupCallId,
    p_invited_user_ids: userIds,
  })
  if (error) {
    const status = error.code === '42501' ? 403 : error.code === '22023' ? 409 : error.code === 'P0002' ? 404 : 500
    return NextResponse.json({ error: error.message || 'Could not invite participants' }, { status })
  }
  // Deliver a distinct group-call invitation to every newly requested user.
  // Push delivery is best-effort: it must never roll back a successfully
  // persisted invitation or interrupt the active call.
  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('username, full_name')
    .eq('id', user.id)
    .maybeSingle()
  const callerName = callerProfile?.full_name || callerProfile?.username || 'Someone'
  const inviteTargets = [...new Set(userIds.filter((id): id is string => typeof id === 'string'))]
  await Promise.all(inviteTargets.map(async (inviteeId) => {
    try {
      await sendPushToUser(inviteeId, {
        title: groupCall.type === 'video' ? 'Incoming Group Video Call' : 'Incoming Group Voice Call',
        body: `${callerName} invited you to join a group ${groupCall.type === 'video' ? 'video' : 'voice'} call`,
        url: '/chat',
        kind: 'generic',
        tag: `group-call-${groupCallId}`,
      })
    } catch (pushError) {
      console.error('[group-calls/invite] push delivery failed', inviteeId, pushError)
    }
  }))

  return NextResponse.json({ ok: true, invitedCount })
}
