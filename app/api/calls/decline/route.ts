import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Lets the callee decline a call straight from the system notification's
 * "Decline" button, without needing to open the app. The caller's own
 * Client (via realtime + its polling backstop) picks up the status change
 * and logs "Declined call" into the chat, same as an in-app decline.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { callId } = await request.json()
  if (!callId) return NextResponse.json({ error: 'callId is required' }, { status: 400 })

  const { data: call } = await supabase.from('calls').select('id, callee_id, status').eq('id', callId).single()
  if (!call || call.callee_id !== user.id) {
    return NextResponse.json({ error: 'Not a participant in this call' }, { status: 403 })
  }
  if (call.status !== 'ringing') return NextResponse.json({ ok: true })

  await supabase.from('calls').update({ status: 'rejected', ended_at: new Date().toISOString() }).eq('id', callId)
  return NextResponse.json({ ok: true })
}
