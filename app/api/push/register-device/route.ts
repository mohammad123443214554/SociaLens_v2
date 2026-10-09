import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Mirrors app/api/push/subscribe/route.ts, but for the native Android
// app's FCM token instead of a browser's Web Push subscription - see
// Supabase-migration-device-push-tokens.sql for the table this writes to.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { token, platform } = await request.json()
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'token is required' }, { status: 400 })
  }

  const { error } = await supabase.from('device_push_tokens').upsert(
    {
      user_id: user.id,
      token,
      platform: platform === 'ios' ? 'ios' : 'android',
    },
    { onConflict: 'token' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { token } = await request.json()
  if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 })

  await supabase.from('device_push_tokens').delete().eq('user_id', user.id).eq('token', token)
  return NextResponse.json({ ok: true })
}
