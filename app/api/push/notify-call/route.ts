import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/server/push'

/**
 * Called right after a call row is inserted (client-side) to notify the
 * callee even if they don't have SociaLens open in a tab right now.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { callId } = await request.json()
  if (!callId) return NextResponse.json({ error: 'callId is required' }, { status: 400 })

  const { data: call } = await supabase
    .from('calls')
    .select('id, caller_id, callee_id, chat_id, status')
    .eq('id', callId)
    .single()

  if (!call || call.caller_id !== user.id) {
    return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  }
  if (call.status !== 'ringing') return NextResponse.json({ ok: true }) // already picked up/ended

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('username, full_name')
    .eq('id', user.id)
    .single()

  const callerName = callerProfile?.full_name || callerProfile?.username || 'Someone'

  await sendPushToUser(call.callee_id, {
    title: `Incoming call`,
    body: `${callerName} is calling you`,
    url: call.chat_id ? `/chat/${call.chat_id}` : '/chat',
    kind: 'call',
    tag: `call-${call.id}`,
    callId: call.id,
    chatId: call.chat_id || undefined,
  })

  return NextResponse.json({ ok: true })
}
