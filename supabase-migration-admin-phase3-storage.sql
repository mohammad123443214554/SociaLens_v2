-- ===========================================================
-- SociaLens - Admin Panel Phase 3: Appeal Photo Storage
-- Safe to run more than once.
-- ===========================================================

INSERT INTO storage.buckets (id, name, public) VALUES ('appeals', 'appeals', true) ON CONFLICT DO NOTHING;

DROP POLICY IF EXISTS "Appeal photos are publicly accessible" ON storage.objects;
CREATE POLICY "Appeal photos are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'appeals');

DROP POLICY IF EXISTS "Users can upload their own appeal photo" ON storage.objects;
CREATE POLICY "Users can upload their own appeal photo" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'appeals' AND auth.uid()::text = (storage.foldername(name))[1]
);
