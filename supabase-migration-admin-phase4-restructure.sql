-- ============================================================
-- SociaLens - Admin Panel Phase 4: Restructure (Reports hub +
-- Suspended/Restricted pages + permanent delete + audit log)
-- Safe to run more than once.
-- ============================================================

-- ------------------------------------------------------------
-- IMPORTANT FIX: admins were never actually allowed to UPDATE
-- other people's profiles rows. "Users can update own profile"
-- only allows auth.uid() = id, so every existing suspend/restrict/
-- unsuspend action from the admin panel was silently failing
-- against a non-admin target account. This adds the missing policy.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile" ON public.profiles FOR UPDATE USING (
    auth.uid() = id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
);

-- ------------------------------------------------------------
-- Moderation log - one row per admin action taken. Powers the
-- "History" tab on the Suspended Accounts and Restrictions pages,
-- and the running record of what happened to a report.
-- target_username is stored directly (not just a FK) so the log
-- still reads fine even after an account is permanently deleted.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.moderation_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    target_user_id UUID, -- Intentionally no FK / no CASCADE: must survive the target account being deleted.
    target_username TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('suspend', 'unsuspend', 'restrict', 'unrestrict', 'delete_account', 'appeal_approved', 'appeal_rejected')),
    feature TEXT CHECK (feature IN ('post', 'comment', 'message', 'story')), -- only set for restrict/unrestrict
    reason TEXT,
    report_id UUID REFERENCES public.reports(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moderation_logs_action ON public.moderation_logs(action);
CREATE INDEX IF NOT EXISTS idx_moderation_logs_target ON public.moderation_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_moderation_logs_created ON public.moderation_logs(created_at DESC);

ALTER TABLE public.moderation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view moderation logs" ON public.moderation_logs;
CREATE POLICY "Admins can view moderation logs" ON public.moderation_logs FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
);

DROP POLICY IF EXISTS "Admins can insert moderation logs" ON public.moderation_logs;
CREATE POLICY "Admins can insert moderation logs" ON public.moderation_logs FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
);
