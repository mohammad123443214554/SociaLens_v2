import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: invitations, error } = await supabase
    .from('group_call_participants')
    .select('group_call_id, invited_by, invited_at')
    .eq('user_id', user.id)
    .in('status', ['invited', 'ringing'])
    .order('invited_at', { ascending: false })
    .limit(5)

  if (error) {
    console.error('[group-calls/incoming] invitation lookup failed', error)
    return NextResponse.json({ error: 'Could not load group call invitations' }, { status: 500 })
  }
  if (!invitations?.length) return NextResponse.json({ invitations: [] })

  const callIds = [...new Set(invitations.map((item) => item.group_call_id))]
  const [{ data: calls, error: callsError }, { data: joined, error: joinedError }] = await Promise.all([
    supabase.from('group_calls').select('id,status,created_at').in('id', callIds).eq('status', 'active'),
    supabase.from('group_call_participants')
      .select('group_call_id,user_id,status')
      .in('group_call_id', callIds)
      .eq('status', 'joined'),
  ])
  if (callsError || joinedError) {
    console.error('[group-calls/incoming] group details lookup failed', callsError || joinedError)
    return NextResponse.json({ error: 'Could not load group call details' }, { status: 500 })
  }

  const activeIds = new Set((calls || []).map((call) => call.id))
  const filteredInvites = invitations.filter((item) => activeIds.has(item.group_call_id))
  const participantIds = [...new Set((joined || []).map((item) => item.user_id))]
  const { data: profiles, error: profilesError } = participantIds.length
    ? await supabase.from('profiles').select('id,username,full_name,avatar_url').in('id', participantIds)
    : { data: [], error: null }
  if (profilesError) {
    console.error('[group-calls/incoming] participant profile lookup failed', profilesError)
    return NextResponse.json({ error: 'Could not load participant profiles' }, { status: 500 })
  }

  const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]))
  const callMap = new Map((calls || []).map((call) => [call.id, call]))
  const invitationsWithDetails = filteredInvites.map((invite) => ({
    groupCallId: invite.group_call_id,
    invitedBy: invite.invited_by,
    createdAt: callMap.get(invite.group_call_id)?.created_at,
    participants: (joined || [])
      .filter((item) => item.group_call_id === invite.group_call_id)
      .map((item) => profileMap.get(item.user_id))
      .filter(Boolean)
      .map((profile) => ({
        id: profile!.id,
        username: profile!.username,
        fullName: profile!.full_name,
        avatarUrl: profile!.avatar_url,
      })),
  }))

  return NextResponse.json({ invitations: invitationsWithDetails })
}
