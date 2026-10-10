-- SociaLens v2 audit hardening (2026-10)
-- These tables are backend maintenance/accounting tables and are not meant
-- to be read or written directly by browser/mobile Supabase clients.
-- Keep access fail-closed even if grants are added in the future.
REVOKE ALL ON TABLE public.call_provider_usage FROM anon, authenticated;
REVOKE ALL ON TABLE public.content_events_cleanup_log FROM anon, authenticated;

DROP POLICY IF EXISTS "Deny client access to call provider usage" ON public.call_provider_usage;
CREATE POLICY "Deny client access to call provider usage"
  ON public.call_provider_usage
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "Deny client access to content event cleanup log" ON public.content_events_cleanup_log;
CREATE POLICY "Deny client access to content event cleanup log"
  ON public.content_events_cleanup_log
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- idx_posts_user_created and idx_posts_user_id were identical indexes
-- on (user_id, created_at DESC). Keep idx_posts_user_id, which is also
-- declared by supabase-migration-performance-indexes.sql.
DROP INDEX IF EXISTS public.idx_posts_user_created;
