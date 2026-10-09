import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { recordCallUsage, type CallProviderName } from '@/lib/server/callProvider'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { callId, durationSeconds } = await request.json()
  if (!callId) return NextResponse.json({ error: 'callId is required' }, { status: 400 })

  const { data: call } = await supabase
    .from('calls')
    .select('id, caller_id, callee_id, provider')
    .eq('id', callId)
    .single()

  if (!call || (call.caller_id !== user.id && call.callee_id !== user.id)) {
    return NextResponse.json({ error: 'Not a participant in this call' }, { status: 403 })
  }

  // Both participants call this on hangup - only the caller's report counts
  // Toward the ledger so a 3-minute call doesn't get logged as 6.
  if (call.provider && call.caller_id === user.id) {
    await recordCallUsage(call.provider as CallProviderName, Number(durationSeconds) || 0)
  }

  return NextResponse.json({ ok: true })
}
