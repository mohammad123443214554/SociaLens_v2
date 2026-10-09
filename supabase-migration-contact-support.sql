-- ===========================================================
-- SociaLens - Contact Support feature
-- Safe to run more than once.
-- ===========================================================

-- ------------------------------------------------------------
-- contact_submissions - one row per "Contact Support" form
-- submission (Settings -> Support -> Contact Support). Visible only to
-- the submitting user and to admins (the Admin Panel's new "Contact"
-- section, which - like the rest of the Admin Panel - only ever shows
-- up for the one account with is_admin = true).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_submissions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    message TEXT NOT NULL,
    media_url TEXT,
    media_type TEXT CHECK (media_type IN ('image', 'video')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
);

ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can submit their own contact request" ON public.contact_submissions;
CREATE POLICY "Users can submit their own contact request" ON public.contact_submissions FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can see their own contact requests" ON public.contact_submissions;
CREATE POLICY "Users can see their own contact requests" ON public.contact_submissions FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
);

DROP POLICY IF EXISTS "Admins can update contact requests" ON public.contact_submissions;
CREATE POLICY "Admins can update contact requests" ON public.contact_submissions FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_status ON public.contact_submissions(status, created_at DESC);

-- ------------------------------------------------------------
-- Storage bucket for the photo/video a user attaches to a contact
-- request - same public-read / owner-folder-write pattern as the
-- existing 'appeals' bucket.
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public) VALUES ('contact-support', 'contact-support', true) ON CONFLICT DO NOTHING;

DROP POLICY IF EXISTS "Contact support media is publicly accessible" ON storage.objects;
CREATE POLICY "Contact support media is publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'contact-support');

DROP POLICY IF EXISTS "Users can upload their own contact support media" ON storage.objects;
CREATE POLICY "Users can upload their own contact support media" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'contact-support' AND auth.uid()::text = (storage.foldername(name))[1]
);
