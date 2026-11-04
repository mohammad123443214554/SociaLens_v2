import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(_request: NextRequest, { params }: { params: Promise<{ groupCallId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { groupCallId } = await params
  if (!UUID_RE.test(groupCallId)) return NextResponse.json({ error: 'Invalid group call ID' }, { status: 400 })

  const { data: result, error } = await supabase.rpc('leave_group_voice_call', { p_group_call_id: groupCallId })
  if (error) {
    const status = error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 500
    return NextResponse.json({ error: error.message || 'Could not leave group call' }, { status })
  }
  return NextResponse.json({ ok: true, result })
}
