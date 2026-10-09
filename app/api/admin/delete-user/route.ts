import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { deleteAccountCompletely } from '@/lib/server/deleteAccount'

// Lets an admin permanently delete someone else's account - used when an
// appeal doesn't look genuine, or straight from a report. Two identity
// checks happen here: the caller must be signed in AND have is_admin =
// true on their own profile (checked with the normal cookie-scoped
// client, so RLS is doing real work). Only once that's confirmed do we
// reach for the service-role client to actually perform the deletion
// (deleting someone else's rows and their auth.users login isn't
// something a normal user-scoped client can do at all).
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!callerProfile?.is_admin) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const targetUserId: string | undefined = body?.targetUserId
  const reason: string | undefined = body?.reason
  const appealId: string | undefined = body?.appealId
  const reportId: string | undefined = body?.reportId

  if (!targetUserId) {
    return NextResponse.json({ error: 'targetUserId is required' }, { status: 400 })
  }
  if (targetUserId === user.id) {
    return NextResponse.json({ error: "You can't delete your own account from here." }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: targetProfile } = await admin
    .from('profiles')
    .select('username, is_admin')
    .eq('id', targetUserId)
    .single()

  if (!targetProfile) {
    return NextResponse.json({ error: 'That account no longer exists.' }, { status: 404 })
  }
  if (targetProfile.is_admin) {
    return NextResponse.json({ error: "Admin accounts can't be deleted from here." }, { status: 400 })
  }

  try {
    // Log first, while the account still exists to reference - if the
    // delete below throws partway through, we still know an attempt was
    // made rather than silently losing the audit trail.
    await admin.from('moderation_logs').insert({
      admin_id: user.id,
      target_user_id: targetUserId,
      target_username: targetProfile.username,
      action: 'delete_account',
      reason: reason || 'Permanently deleted by admin',
      report_id: reportId ?? null,
    })

    // An appeal for this user is deleted along with everything else in
    // deleteAccountCompletely, so there's no separate status update needed
    // here - it simply won't exist to show up as pending anymore.
    void appealId

    await deleteAccountCompletely(targetUserId)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Admin delete-user error:', err)
    return NextResponse.json({ error: 'Something went wrong deleting that account.' }, { status: 500 })
  }
}
