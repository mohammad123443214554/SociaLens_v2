-- ============================================================
-- SociaLens - Admin Panel Phase 1: Reports + Moderation Schema
-- Safe to run more than once.
-- ============================================================

-- ------------------------------------------------------------
-- Reports - one row per report, whatever it was made against.
-- Exactly one of post_id / story_id / comment_id / story_comment_id /
-- message_id / reported_user_id is set, matching `target_type`.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    reporter_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    -- Who the report is ultimately about - always set, regardless of
    -- target_type, so the admin panel can filter/act "on this account"
    -- without having to look up the owner of a post/comment/etc first.
    reported_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    target_type TEXT NOT NULL CHECK (target_type IN ('post', 'story', 'comment', 'story_comment', 'message', 'user')),
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
    story_id UUID,
    comment_id UUID,
    story_comment_id UUID,
    message_id UUID,
    reason TEXT NOT NULL CHECK (reason IN ('spam', 'nudity', 'harassment', 'fake_account', 'hate_speech', 'other')),
    -- Required when reason = 'other', optional extra context otherwise.
    details TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'actioned', 'dismissed')),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_reported_user ON public.reports(reported_user_id);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can file reports" ON public.reports;
CREATE POLICY "Users can file reports" ON public.reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Users can see their own filed reports" ON public.reports;
CREATE POLICY "Users can see their own filed reports" ON public.reports FOR SELECT USING (
    auth.uid() = reporter_id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
);

DROP POLICY IF EXISTS "Admins can update reports" ON public.reports;
CREATE POLICY "Admins can update reports" ON public.reports FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
);

-- ------------------------------------------------------------
-- Moderation fields on profiles.
-- is_admin is NEVER settable from the app itself - only ever flipped
-- by hand in the Supabase dashboard/SQL editor, which is exactly why it
-- doubles as the "who can even see the admin panel" check everywhere.
-- ------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
-- Fixed 24h from suspended_at - stored anyway so it survives clock drift
-- and makes the appeal countdown a simple read instead of a calculation
-- that has to stay in sync between client and server.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspension_deadline TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspension_reason TEXT;

-- Restrictions - each is a deadline; NULL/past = not restricted. Checked
-- at the point of use (posting, commenting, messaging, story upload) as
-- well as being cleared by a periodic cleanup job, so it's correct even
-- if that job is ever late or hasn't run yet.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS restrict_post_until TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS restrict_comment_until TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS restrict_message_until TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS restrict_story_until TIMESTAMPTZ;

-- One admin account for now (SociaLensOfficial) - flip it by hand:
-- UPDATE public.profiles SET is_admin = true WHERE username = 'SociaLensOfficial';

-- ------------------------------------------------------------
-- Account appeals - filed once per suspension, reviewed by an admin
-- (Phase 3 wires up the actual submission form + photo/face check).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.account_appeals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    photo_url TEXT NOT NULL,
    letter TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
);

ALTER TABLE public.account_appeals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can file their own appeal" ON public.account_appeals;
CREATE POLICY "Users can file their own appeal" ON public.account_appeals FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can see their own appeal" ON public.account_appeals;
CREATE POLICY "Users can see their own appeal" ON public.account_appeals FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
);

DROP POLICY IF EXISTS "Admins can update appeals" ON public.account_appeals;
CREATE POLICY "Admins can update appeals" ON public.account_appeals FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
);

-- ------------------------------------------------------------
-- Auto-follow SociaLensOfficial
-- Every account - new or existing, even ones that get suspended later -
-- follows this one account automatically, so it always has a way to
-- reach everyone (announcements, etc).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION auto_follow_official_account()
RETURNS TRIGGER AS $$
DECLARE
  official_id UUID;
BEGIN
  SELECT id INTO official_id FROM public.profiles WHERE username = 'SociaLensOfficial' LIMIT 1;
  IF official_id IS NOT NULL AND official_id != NEW.id THEN
    INSERT INTO public.follows (follower_id, following_id, status)
    VALUES (NEW.id, official_id, 'accepted')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_follow_official ON public.profiles;
CREATE TRIGGER trg_auto_follow_official
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION auto_follow_official_account();

-- One-time backfill for every account that already exists.
DO $$
DECLARE
  official_id UUID;
BEGIN
  SELECT id INTO official_id FROM public.profiles WHERE username = 'SociaLensOfficial' LIMIT 1;
  IF official_id IS NOT NULL THEN
    INSERT INTO public.follows (follower_id, following_id, status)
    SELECT id, official_id, 'accepted' FROM public.profiles WHERE id != official_id
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
