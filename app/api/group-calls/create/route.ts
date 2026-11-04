import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/server/push'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { userIds?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const userIds = Array.isArray(body.userIds) ? body.userIds : []
  if (userIds.length > 9 || userIds.some((id) => typeof id !== 'string' || !UUID_RE.test(id))) {
    return NextResponse.json({ error: 'Choose up to 9 valid users. You count as participant 1.' }, { status: 400 })
  }

  const { data: groupCallId, error } = await supabase.rpc('create_group_voice_call', { p_invited_user_ids: userIds })
  if (error) {
    const status = error.code === '42501' ? 403 : error.code === '22023' ? 400 : 500
    return NextResponse.json({ error: error.message || 'Could not create group call' }, { status })
  }
  if (userIds.length) {
    const { data: callerProfile } = await supabase.from('profiles')
      .select('username, full_name').eq('id', user.id).maybeSingle()
    const callerName = callerProfile?.full_name || callerProfile?.username || 'Someone'
    await Promise.all(userIds.map(async (inviteeId) => {
      try {
        await sendPushToUser(inviteeId as string, {
          title: 'Incoming Group Voice Call',
          body: `${callerName} invited you to join a group voice call`,
          url: '/chat',
          kind: 'generic',
          tag: `group-call-${groupCallId}`,
        })
      } catch (pushError) {
        console.error('[group-calls/create] push delivery failed', inviteeId, pushError)
      }
    }))
  }

  return NextResponse.json({ ok: true, groupCallId }, { status: 201 })
}
