import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: chats, error: chatsError } = await supabase
    .from('chats')
    .select('participant1_id, participant2_id, deleted_by')
    .or(`participant1_id.eq.${user.id},participant2_id.eq.${user.id}`)

  if (chatsError) {
    console.error('[group-calls/contacts] chat lookup failed', chatsError)
    return NextResponse.json({ error: 'Could not load message contacts' }, { status: 500 })
  }

  const contactIds = [...new Set((chats || [])
    .filter((chat) => !Array.isArray(chat.deleted_by) || !chat.deleted_by.includes(user.id))
    .map((chat) => chat.participant1_id === user.id ? chat.participant2_id : chat.participant1_id)
    .filter((id): id is string => Boolean(id) && id !== user.id))]

  if (!contactIds.length) return NextResponse.json({ contacts: [] })

  const [{ data: blockedRows, error: blocksError }, { data: profiles, error: profilesError }] = await Promise.all([
    supabase.from('blocks').select('blocker_id, blocked_id')
      .or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`),
    supabase.from('profiles').select('id, username, full_name, avatar_url, call_privacy')
      .in('id', contactIds),
  ])

  if (blocksError || profilesError) {
    console.error('[group-calls/contacts] profile/block lookup failed', blocksError || profilesError)
    return NextResponse.json({ error: 'Could not load message contacts' }, { status: 500 })
  }

  const blockedIds = new Set((blockedRows || []).map((row) =>
    row.blocker_id === user.id ? row.blocked_id : row.blocker_id
  ))

  const contacts = (profiles || [])
    .filter((profile) => !blockedIds.has(profile.id) && profile.call_privacy !== 'none')
    .map((profile) => ({
      id: profile.id,
      username: profile.username,
      fullName: profile.full_name,
      avatarUrl: profile.avatar_url,
    }))
    .sort((a, b) => (a.fullName || a.username).localeCompare(b.fullName || b.username))

  return NextResponse.json({ contacts })
}
