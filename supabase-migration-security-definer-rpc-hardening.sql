-- SociaLens v2 security hardening migration.
-- Run after supabase-migration-audit-hardening.sql.
-- Internal SECURITY DEFINER routines are not browser/mobile RPC endpoints.
-- Pin their search_path and revoke direct client execution; retain service
-- role execution for trusted server-side maintenance/API calls.
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = %L', f.signature, '');
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.signature);
  END LOOP;
END
$$;

-- This analytics RPC is intentionally available to signed-in clients, but
-- attribution must always match the authenticated JWT identity.
CREATE OR REPLACE FUNCTION public.record_content_event(
  p_user_id uuid, p_target_type text, p_target_id uuid, p_creator_id uuid,
  p_event_type text, p_watch_seconds numeric DEFAULT NULL::numeric,
  p_video_duration numeric DEFAULT NULL::numeric
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_hashtag TEXT; v_content TEXT; v_weight NUMERIC;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Not authorized to record events for this user' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.content_events (user_id, target_type, target_id, creator_id, event_type, watch_seconds, video_duration)
  VALUES (p_user_id, p_target_type, p_target_id, p_creator_id, p_event_type, p_watch_seconds, p_video_duration);

  IF p_target_type IN ('post', 'reel') THEN
    UPDATE public.posts SET
      views_count = CASE WHEN p_event_type = 'view' THEN views_count + 1 ELSE views_count END,
      total_watch_seconds = CASE WHEN p_event_type = 'watch_time' THEN total_watch_seconds + COALESCE(p_watch_seconds, 0) ELSE total_watch_seconds END,
      watch_sessions = CASE WHEN p_event_type = 'watch_time' THEN watch_sessions + 1 ELSE watch_sessions END,
      completion_count = CASE WHEN p_event_type = 'completion' THEN completion_count + 1 ELSE completion_count END,
      rewatch_count = CASE WHEN p_event_type = 'rewatch' THEN rewatch_count + 1 ELSE rewatch_count END,
      skip_count = CASE WHEN p_event_type = 'skip' THEN skip_count + 1 ELSE skip_count END,
      not_interested_count = CASE WHEN p_event_type = 'not_interested' THEN not_interested_count + 1 ELSE not_interested_count END,
      report_count = CASE WHEN p_event_type = 'report' THEN report_count + 1 ELSE report_count END,
      last_engaged_at = CASE WHEN p_event_type IN ('like','comment','save','share','watch_time','completion') THEN pg_catalog.now() ELSE last_engaged_at END
    WHERE id = p_target_id;
    IF p_event_type = 'not_interested' THEN
      INSERT INTO public.post_not_interested (user_id, post_id)
      VALUES (p_user_id, p_target_id) ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  IF p_creator_id IS NOT NULL AND p_creator_id <> p_user_id THEN
    v_weight := CASE p_event_type
      WHEN 'like' THEN 1 WHEN 'comment' THEN 2 WHEN 'save' THEN 2.5 WHEN 'share' THEN 3
      WHEN 'follow' THEN 5 WHEN 'profile_visit' THEN 0.5 WHEN 'completion' THEN 1.5
      WHEN 'rewatch' THEN 2
      WHEN 'watch_time' THEN LEAST(COALESCE(p_watch_seconds, 0) / GREATEST(COALESCE(p_video_duration, 1), 1), 1) * 1.0
      WHEN 'view' THEN 0.1 WHEN 'skip' THEN -0.5 WHEN 'not_interested' THEN -4
      WHEN 'report' THEN -6 ELSE 0
    END;
    IF v_weight <> 0 THEN
      INSERT INTO public.user_creator_affinity (user_id, creator_id, score, updated_at)
      VALUES (p_user_id, p_creator_id, v_weight, pg_catalog.now())
      ON CONFLICT (user_id, creator_id) DO UPDATE
        SET score = public.user_creator_affinity.score * 0.98 + v_weight,
            updated_at = pg_catalog.now();
    END IF;
  END IF;

  IF p_target_type IN ('post', 'reel')
     AND p_event_type IN ('like', 'comment', 'save', 'share', 'completion', 'rewatch', 'not_interested', 'skip') THEN
    SELECT content INTO v_content FROM public.posts WHERE id = p_target_id;
    IF v_content IS NOT NULL THEN
      v_weight := CASE p_event_type
        WHEN 'like' THEN 1 WHEN 'comment' THEN 1.5 WHEN 'save' THEN 2 WHEN 'share' THEN 2
        WHEN 'completion' THEN 1 WHEN 'rewatch' THEN 1.5
        WHEN 'not_interested' THEN -3 WHEN 'skip' THEN -0.3 ELSE 0
      END;
      FOR v_hashtag IN
        SELECT DISTINCT pg_catalog.lower(m[1])
        FROM pg_catalog.regexp_matches(v_content, '#([A-Za-z0-9_]{2,30})', 'g') AS m
      LOOP
        INSERT INTO public.user_hashtag_affinity (user_id, hashtag, score, updated_at)
        VALUES (p_user_id, v_hashtag, v_weight, pg_catalog.now())
        ON CONFLICT (user_id, hashtag) DO UPDATE
          SET score = public.user_hashtag_affinity.score * 0.98 + v_weight,
              updated_at = pg_catalog.now();
      END LOOP;
    END IF;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_content_events_batch(p_events jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE ev JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required to record content events' USING ERRCODE = '42501';
  END IF;
  FOR ev IN SELECT * FROM pg_catalog.jsonb_array_elements(p_events) LOOP
    PERFORM public.record_content_event(
      (ev->>'user_id')::UUID, ev->>'target_type', (ev->>'target_id')::UUID,
      NULLIF(ev->>'creator_id', '')::UUID, ev->>'event_type',
      NULLIF(ev->>'watch_seconds', '')::NUMERIC,
      NULLIF(ev->>'video_duration', '')::NUMERIC
    );
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.record_content_event(uuid,text,uuid,uuid,text,numeric,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_content_events_batch(jsonb) TO authenticated;
