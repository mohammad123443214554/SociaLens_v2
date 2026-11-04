import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest, { params }: { params: Promise<{ groupCallId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { groupCallId } = await params
  if (!UUID_RE.test(groupCallId)) return NextResponse.json({ error: 'Invalid group call ID' }, { status: 400 })

  let body: { accept?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  if (typeof body.accept !== 'boolean') return NextResponse.json({ error: 'accept must be a boolean' }, { status: 400 })

  const { data: result, error } = await supabase.rpc('respond_group_voice_call_invitation', {
    p_group_call_id: groupCallId,
    p_accept: body.accept,
  })
  if (error) {
    const status = error.code === '42501' ? 403 : error.code === '22023' ? 409 : error.code === 'P0002' ? 404 : 500
    return NextResponse.json({ error: error.message || 'Could not respond to invitation' }, { status })
  }
  return NextResponse.json({ ok: true, result })
}
