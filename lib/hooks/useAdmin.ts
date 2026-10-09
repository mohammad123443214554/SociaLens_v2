'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { ReportWithProfiles, AccountAppeal, ModerationLog, Profile, ContactSubmission } from '@/lib/types/database.types'

const RESTRICTION_DAYS = 10
const SUSPENSION_HOURS = 24

export type ReportStatusFilter = 'pending' | 'actioned' | 'dismissed'

export function useReports(status: ReportStatusFilter) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['admin-reports', status],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reports')
        .select('*, reporter:profiles!reports_reporter_id_fkey(*), reported_user:profiles!reports_reported_user_id_fkey(*)')
        .eq('status', status)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as ReportWithProfiles[]
    },
  })
}

// Small helper used by the Reports hub to show a live pending-reports
// Badge without pulling the whole list down.
export function usePendingReportsCount() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['admin-reports-count', 'pending'],
    queryFn: async () => {
      const { count, error } = await supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending')
      if (error) throw error
      return count ?? 0
    },
  })
}

// A small extra detail line for the report - the actual comment/message
// Text, when the target still exists, so the admin doesn't have to go
// Hunting for context on their own.
export function useReportTargetPreview(report?: ReportWithProfiles) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['report-target-preview', report?.id],
    queryFn: async () => {
      if (!report) return null
      if (report.target_type === 'post' && report.post_id) {
        const { data } = await supabase.from('posts').select('content, media_url').eq('id', report.post_id).maybeSingle()
        return data?.content || (data?.media_url ? '(media post)' : null)
      }
      if (report.target_type === 'comment' && report.comment_id) {
        const { data } = await supabase.from('comments').select('content').eq('id', report.comment_id).maybeSingle()
        return data?.content ?? null
      }
      if (report.target_type === 'story_comment' && report.story_comment_id) {
        const { data } = await supabase.from('story_comments').select('content').eq('id', report.story_comment_id).maybeSingle()
        return data?.content ?? null
      }
      if (report.target_type === 'message' && report.message_id) {
        const { data } = await supabase.from('messages').select('content').eq('id', report.message_id).maybeSingle()
        return data?.content ?? null
      }
      return null
    },
    enabled: !!report,
  })
}

function reportStatusUpdate(supabase: ReturnType<typeof createClient>, reportId: string, status: 'actioned' | 'dismissed') {
  return supabase.from('reports').update({ status, reviewed_at: new Date().toISOString() }).eq('id', reportId)
}

// Every admin action gets one row here, best-effort - if this insert ever
// fails, we don't want that to take down the actual moderation action,
// so callers fire-and-log rather than treating this as critical-path.
async function logModerationAction(
  supabase: ReturnType<typeof createClient>,
  entry: {
    targetUserId: string
    targetUsername: string
    action: ModerationLog['action']
    feature?: ModerationLog['feature']
    reason?: string | null
    reportId?: string | null
  }
) {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('moderation_logs').insert({
    admin_id: user?.id ?? null,
    target_user_id: entry.targetUserId,
    target_username: entry.targetUsername,
    action: entry.action,
    feature: entry.feature ?? null,
    reason: entry.reason ?? null,
    report_id: entry.reportId ?? null,
  })
  if (error) console.error('[moderation log] failed to record action:', error)
}

export function useDismissReport() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ reportId }: { reportId: string }) => {
      const { error } = await reportStatusUpdate(supabase, reportId, 'dismissed')
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-reports'] }),
  })
}

export function useSuspendUser() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ userId, username, reason, reportId }: { userId: string; username: string; reason: string; reportId?: string }) => {
      const now = new Date()
      const deadline = new Date(now.getTime() + SUSPENSION_HOURS * 60 * 60 * 1000)
      const { error } = await supabase
        .from('profiles')
        .update({
          is_suspended: true,
          suspended_at: now.toISOString(),
          suspension_deadline: deadline.toISOString(),
          suspension_reason: reason,
        })
        .eq('id', userId)
      if (error) throw error
      if (reportId) {
        const { error: reportErr } = await reportStatusUpdate(supabase, reportId, 'actioned')
        if (reportErr) throw reportErr
      }
      await logModerationAction(supabase, { targetUserId: userId, targetUsername: username, action: 'suspend', reason, reportId })
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-reports'] })
      queryClient.invalidateQueries({ queryKey: ['admin-reports-count'] })
      queryClient.invalidateQueries({ queryKey: ['admin-suspended'] })
      queryClient.invalidateQueries({ queryKey: ['admin-account', variables.userId] })
      queryClient.invalidateQueries({ queryKey: ['admin-accounts'] })
    },
  })
}

export function useUnsuspendUser() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ userId, username }: { userId: string; username: string }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ is_suspended: false, suspended_at: null, suspension_deadline: null, suspension_reason: null })
        .eq('id', userId)
      if (error) throw error
      await logModerationAction(supabase, { targetUserId: userId, targetUsername: username, action: 'unsuspend' })
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-reports'] })
      queryClient.invalidateQueries({ queryKey: ['admin-suspended'] })
      queryClient.invalidateQueries({ queryKey: ['admin-account', variables.userId] })
      queryClient.invalidateQueries({ queryKey: ['admin-accounts'] })
    },
  })
}

export type RestrictionFeature = 'post' | 'comment' | 'message' | 'story'

export function useRestrictUser() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ userId, username, feature, reportId }: { userId: string; username: string; feature: RestrictionFeature; reportId?: string }) => {
      const until = new Date(Date.now() + RESTRICTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
      const column = `restrict_${feature}_until`
      const { error } = await supabase.from('profiles').update({ [column]: until }).eq('id', userId)
      if (error) throw error
      if (reportId) {
        const { error: reportErr } = await reportStatusUpdate(supabase, reportId, 'actioned')
        if (reportErr) throw reportErr
      }
      await logModerationAction(supabase, { targetUserId: userId, targetUsername: username, action: 'restrict', feature, reportId })
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-reports'] })
      queryClient.invalidateQueries({ queryKey: ['admin-reports-count'] })
      queryClient.invalidateQueries({ queryKey: ['admin-restricted'] })
      queryClient.invalidateQueries({ queryKey: ['admin-account', variables.userId] })
      queryClient.invalidateQueries({ queryKey: ['admin-accounts'] })
    },
  })
}

// Admin lifting a restriction early, before its 10-day deadline - from
// the Restrictions page rather than from a fresh report.
export function useLiftRestriction() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ userId, username, feature }: { userId: string; username: string; feature: RestrictionFeature }) => {
      const column = `restrict_${feature}_until`
      const { error } = await supabase.from('profiles').update({ [column]: null }).eq('id', userId)
      if (error) throw error
      await logModerationAction(supabase, { targetUserId: userId, targetUsername: username, action: 'unrestrict', feature })
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-restricted'] })
      queryClient.invalidateQueries({ queryKey: ['admin-account', variables.userId] })
      queryClient.invalidateQueries({ queryKey: ['admin-accounts'] })
    },
  })
}

// ------------------------------------------------------------------
// Suspended Accounts page - "Active" (currently suspended) reads
// straight off profiles; "History" reads the audit log, which is the
// only place that still has a record once an unsuspend/permanent
// delete has happened.
// ------------------------------------------------------------------
export function useActiveSuspensions() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['admin-suspended', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('is_suspended', true)
        .order('suspended_at', { ascending: false })
      if (error) throw error
      return data as unknown as Profile[]
    },
  })
}

export function useSuspensionHistory() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['admin-suspended', 'history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('moderation_logs')
        .select('*')
        .in('action', ['unsuspend', 'delete_account'])
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data as unknown as ModerationLog[]
    },
  })
}

// ------------------------------------------------------------------
// Restrictions page - "Active" pulls every profile with at least one
// restrict_*_until still in the future (one row per user, but a user
// can carry more than one active feature restriction at once so we
// expand those into one card per feature client-side). "History" is
// the log of restrict/unrestrict actions.
// ------------------------------------------------------------------
export function useActiveRestrictions() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['admin-restricted', 'active'],
    queryFn: async () => {
      const now = new Date().toISOString()
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .or(`restrict_post_until.gt.${now},restrict_comment_until.gt.${now},restrict_message_until.gt.${now},restrict_story_until.gt.${now}`)
      if (error) throw error
      return data as unknown as Profile[]
    },
  })
}

export function useRestrictionHistory() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['admin-restricted', 'history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('moderation_logs')
        .select('*')
        .in('action', ['restrict', 'unrestrict'])
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data as unknown as ModerationLog[]
    },
  })
}

// ------------------------------------------------------------------
// Account appeals - reviewed by an admin. Approving one lifts the
// suspension immediately; rejecting just leaves it as-is (the 24h
// countdown on the suspension screen keeps running either way).
// A rejected appeal can now optionally be followed by permanently
// deleting the account outright, when the admin decides it isn't
// genuine (see usePermanentlyDeleteAppealUser below).
// ------------------------------------------------------------------
export type AppealWithProfile = AccountAppeal & { profiles: any }

export function usePendingAppeals() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['admin-appeals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('account_appeals')
        .select('*, profiles(*)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as unknown as AppealWithProfile[]
    },
  })
}

export function useReviewAppeal() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ appealId, userId, username, approve }: { appealId: string; userId: string; username: string; approve: boolean }) => {
      const { error: appealErr } = await supabase
        .from('account_appeals')
        .update({ status: approve ? 'approved' : 'rejected', reviewed_at: new Date().toISOString() })
        .eq('id', appealId)
      if (appealErr) throw appealErr

      if (approve) {
        const { error: profileErr } = await supabase
          .from('profiles')
          .update({ is_suspended: false, suspended_at: null, suspension_deadline: null, suspension_reason: null })
          .eq('id', userId)
        if (profileErr) throw profileErr
      }

      await logModerationAction(supabase, {
        targetUserId: userId,
        targetUsername: username,
        action: approve ? 'appeal_approved' : 'appeal_rejected',
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-appeals'] })
      queryClient.invalidateQueries({ queryKey: ['admin-reports'] })
      queryClient.invalidateQueries({ queryKey: ['admin-suspended'] })
    },
  })
}

// Permanently deletes any account outright, straight from the Action
// page - not tied to an appeal at all (appealId is optional and only
// passed when this happens to originate from one).
export function useAdminPermanentlyDeleteAccount() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason?: string }) => {
      const res = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: userId, reason: reason || 'Permanently deleted by admin' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not delete that account.')
      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-accounts'] })
      queryClient.invalidateQueries({ queryKey: ['admin-account', variables.userId] })
      queryClient.invalidateQueries({ queryKey: ['admin-appeals'] })
      queryClient.invalidateQueries({ queryKey: ['admin-reports'] })
      queryClient.invalidateQueries({ queryKey: ['admin-suspended'] })
    },
  })
}

// Permanently deletes the appealing user's entire account - for when the
// admin looks at the appeal and decides it isn't genuine. Goes through
// the server route since deleting someone else's auth login needs the
// service role key, which never runs in the browser.
export function usePermanentlyDeleteAppealUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ userId, appealId, reason }: { userId: string; appealId: string; reason?: string }) => {
      const res = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: userId, appealId, reason: reason || 'Appeal rejected - account permanently deleted' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not delete that account.')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-appeals'] })
      queryClient.invalidateQueries({ queryKey: ['admin-reports'] })
      queryClient.invalidateQueries({ queryKey: ['admin-suspended'] })
    },
  })
}

// ------------------------------------------------------------------
// Verification tick - grants or revokes the *blue* tick only. The
// yellow tick belongs to SociaLensOfficial alone and is set directly in
// the database (see supabase-migration-verification-tick.sql); there is
// intentionally no code path here that can produce a second yellow tick.
// Granting sends the recipient a congratulations notification that
// appears to come from SociaLensOfficial specifically, regardless of
// which admin account performed the action.
// ------------------------------------------------------------------
export function useSetVerification() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ userId, grant }: { userId: string; grant: boolean }) => {
      if (grant) {
        const { error } = await supabase.from('profiles').update({ verification_type: 'blue', is_verified: true }).eq('id', userId)
        if (error) throw error

        const { data: official } = await supabase.from('profiles').select('id').eq('username', 'SociaLensOfficial').maybeSingle()
        if (official?.id) {
          await supabase.from('notifications').insert({ user_id: userId, actor_id: official.id, type: 'verified' })
        }
      } else {
        const { error } = await supabase.from('profiles').update({ verification_type: null, is_verified: false }).eq('id', userId)
        if (error) throw error
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-account', variables.userId] })
      queryClient.invalidateQueries({ queryKey: ['admin-accounts'] })
    },
  })
}

// ------------------------------------------------------------------
// Contact Support - submissions from Settings -> Support -> Contact
// Support (name + message + optional photo/video). Admin-only, same
// as everything else in the Admin Panel.
// ------------------------------------------------------------------
export type ContactSubmissionWithProfile = ContactSubmission & { profiles: any }

export function useContactSubmissions(status: 'pending' | 'resolved') {
  const supabase = createClient()

  return useQuery({
    queryKey: ['admin-contact', status],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_submissions')
        .select('*, profiles(*)')
        .eq('status', status)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as ContactSubmissionWithProfile[]
    },
  })
}

export function usePendingContactCount() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['admin-contact-count', 'pending'],
    queryFn: async () => {
      const { count, error } = await supabase.from('contact_submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending')
      if (error) throw error
      return count ?? 0
    },
  })
}

export function useResolveContactSubmission() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, resolved }: { id: string; resolved: boolean }) => {
      const { error } = await supabase
        .from('contact_submissions')
        .update({ status: resolved ? 'resolved' : 'pending', reviewed_at: resolved ? new Date().toISOString() : null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-contact'] })
      queryClient.invalidateQueries({ queryKey: ['admin-contact-count'] })
    },
  })
}
