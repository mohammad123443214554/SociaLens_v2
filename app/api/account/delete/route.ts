import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { deleteAccountCompletely } from '@/lib/server/deleteAccount'

// Being logged in already proves who you are - Supabase's session cookie is
// The identity check here, so no separate password step is needed (and
// Google/OAuth accounts never had a password to check in the first place).
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  try {
    await deleteAccountCompletely(user.id)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Account deletion error:', err)
    return NextResponse.json({ error: 'Something went wrong deleting your account.' }, { status: 500 })
  }
}
