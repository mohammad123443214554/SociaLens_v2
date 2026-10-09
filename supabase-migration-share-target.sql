-- ===========================================================
-- SociaLens - Story links (for content shared in from other apps)
-- Safe to run more than once.
-- ===========================================================

ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS link_url TEXT;
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS link_label TEXT;

-- ------------------------------------------------------------
-- Storage for photos/videos shared INTO SociaLens from another app (via
-- the OS share sheet -> PWA share_target -> /share route) before the
-- person decides what to do with them (e.g. "Add to Story").
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public) VALUES ('shared-content', 'shared-content', true) ON CONFLICT DO NOTHING;

DROP POLICY IF EXISTS "Shared content is publicly accessible" ON storage.objects;
CREATE POLICY "Shared content is publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'shared-content');

DROP POLICY IF EXISTS "Users can upload their own shared content" ON storage.objects;
CREATE POLICY "Users can upload their own shared content" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'shared-content' AND auth.uid()::text = (storage.foldername(name))[1]
);
