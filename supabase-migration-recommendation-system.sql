-- ===========================================================
-- SociaLens - Recommendation System (Reels / Posts / Stories / Suggestions)
-- Safe to run more than once.
-- ===========================================================

-- ------------------------------------------------------------
-- content_events: append-only raw signal log. This is a SHORT-LIVED
-- log, not permanent storage - record_content_event() below folds each
-- event into a durable aggregate (on posts, or in the affinity tables)
-- the instant it arrives, and cleanup_content_events() later deletes
-- old rows here without losing anything: the aggregates already have
-- what mattered.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    target_type TEXT NOT NULL CHECK (target_type IN ('post', 'reel', 'story')),
    target_id UUID NOT NULL,
    creator_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'view', 'watch_time', 'completion', 'rewatch', 'like', 'comment',
        'save', 'share', 'follow', 'profile_visit', 'skip', 'not_interested', 'report'
    )),
    watch_seconds NUMERIC,
    video_duration NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_events_created_at ON public.content_events(created_at);
CREATE INDEX IF NOT EXISTS idx_content_events_target ON public.content_events(target_type, target_id, event_type);
CREATE INDEX IF NOT EXISTS idx_content_events_user ON public.content_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_events_creator ON public.content_events(creator_id) WHERE creator_id IS NOT NULL;

ALTER TABLE public.content_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can log their own events" ON public.content_events;
CREATE POLICY "Users can log their own events" ON public.content_events FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can see their own events" ON public.content_events;
CREATE POLICY "Users can see their own events" ON public.content_events FOR SELECT USING (auth.uid() = user_id);

-- ------------------------------------------------------------
-- Aggregate ranking signals kept directly on posts, so ranking a feed
-- never has to scan content_events - it's cheap columns on a row Supabase
-- is already fetching anyway.
-- ------------------------------------------------------------
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS total_watch_seconds NUMERIC DEFAULT 0;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS watch_sessions INT DEFAULT 0;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS completion_count INT DEFAULT 0;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS rewatch_count INT DEFAULT 0;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS skip_count INT DEFAULT 0;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS not_interested_count INT DEFAULT 0;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS report_count INT DEFAULT 0;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS quality_score NUMERIC DEFAULT 0.5;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS last_engaged_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_posts_media_created ON public.posts(media_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts(created_at DESC);

-- ------------------------------------------------------------
-- Per-user "how much do they seem to like this creator / this hashtag"
-- running scores - the actual interest profile. Updated incrementally by
-- record_content_event(), never recomputed from scratch, so it stays
-- cheap no matter how much history piles up.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_creator_affinity (
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    creator_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    score NUMERIC DEFAULT 0 NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, creator_id)
);
CREATE INDEX IF NOT EXISTS idx_user_creator_affinity_user ON public.user_creator_affinity(user_id, score DESC);

CREATE TABLE IF NOT EXISTS public.user_hashtag_affinity (
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    hashtag TEXT NOT NULL,
    score NUMERIC DEFAULT 0 NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, hashtag)
);
CREATE INDEX IF NOT EXISTS idx_user_hashtag_affinity_user ON public.user_hashtag_affinity(user_id, score DESC);

-- Explicit "Not Interested" - hard-excluded from that user's future feeds/
-- reels, separate from the softer affinity-score penalty.
CREATE TABLE IF NOT EXISTS public.post_not_interested (
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, post_id)
);

ALTER TABLE public.user_creator_affinity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage their own creator affinity" ON public.user_creator_affinity;
CREATE POLICY "Users manage their own creator affinity" ON public.user_creator_affinity FOR ALL USING (auth.uid() = user_id);

ALTER TABLE public.user_hashtag_affinity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage their own hashtag affinity" ON public.user_hashtag_affinity;
CREATE POLICY "Users manage their own hashtag affinity" ON public.user_hashtag_affinity FOR ALL USING (auth.uid() = user_id);

ALTER TABLE public.post_not_interested ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage their own not-interested list" ON public.post_not_interested;
CREATE POLICY "Users manage their own not-interested list" ON public.post_not_interested FOR ALL USING (auth.uid() = user_id);

-- ------------------------------------------------------------
-- record_content_event: the single write path for every signal. Runs as
-- the row owner (SECURITY DEFINER) so it can update someone else's
-- posts.* aggregate counters (a viewer's watch time has to bump the
-- creator's post row) without opening posts up to direct public writes.
-- One round trip per event: insert the raw log line + fold it into every
-- aggregate it affects, atomically.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_content_event(
    p_user_id UUID,
    p_target_type TEXT,
    p_target_id UUID,
    p_creator_id UUID,
    p_event_type TEXT,
    p_watch_seconds NUMERIC DEFAULT NULL,
    p_video_duration NUMERIC DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_hashtag TEXT;
  v_content TEXT;
  v_weight NUMERIC;
BEGIN
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
      last_engaged_at = CASE WHEN p_event_type IN ('like','comment','save','share','watch_time','completion') THEN NOW() ELSE last_engaged_at END
    WHERE id = p_target_id;

    IF p_event_type = 'not_interested' THEN
      INSERT INTO public.post_not_interested (user_id, post_id) VALUES (p_user_id, p_target_id) ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  -- Creator affinity - how much this user seems to like this creator's
  -- content overall. Each event type nudges it by a different amount;
  -- negative signals (skip/not_interested/report) pull it down.
  IF p_creator_id IS NOT NULL AND p_creator_id != p_user_id THEN
    v_weight := CASE p_event_type
      WHEN 'like' THEN 1
      WHEN 'comment' THEN 2
      WHEN 'save' THEN 2.5
      WHEN 'share' THEN 3
      WHEN 'follow' THEN 5
      WHEN 'profile_visit' THEN 0.5
      WHEN 'completion' THEN 1.5
      WHEN 'rewatch' THEN 2
      WHEN 'watch_time' THEN LEAST(COALESCE(p_watch_seconds, 0) / GREATEST(COALESCE(p_video_duration, 1), 1), 1) * 1.0
      WHEN 'view' THEN 0.1
      WHEN 'skip' THEN -0.5
      WHEN 'not_interested' THEN -4
      WHEN 'report' THEN -6
      ELSE 0
    END;

    IF v_weight != 0 THEN
      INSERT INTO public.user_creator_affinity (user_id, creator_id, score, updated_at)
      VALUES (p_user_id, p_creator_id, v_weight, NOW())
      ON CONFLICT (user_id, creator_id) DO UPDATE
        -- Slight decay toward the new signal instead of an unbounded sum,
        -- so old behavior gradually fades and recent behavior dominates.
        SET score = public.user_creator_affinity.score * 0.98 + v_weight,
            updated_at = NOW();
    END IF;
  END IF;

  -- Hashtag affinity - same idea, per topic instead of per creator.
  -- Hashtags aren't a separate column (see PostCaption.tsx), they're
  -- just #words inside posts.content, so pull them out here.
  IF p_target_type IN ('post', 'reel') AND p_event_type IN ('like', 'comment', 'save', 'share', 'completion', 'rewatch', 'not_interested', 'skip') THEN
    SELECT content INTO v_content FROM public.posts WHERE id = p_target_id;
    IF v_content IS NOT NULL THEN
      v_weight := CASE p_event_type
        WHEN 'like' THEN 1 WHEN 'comment' THEN 1.5 WHEN 'save' THEN 2 WHEN 'share' THEN 2
        WHEN 'completion' THEN 1 WHEN 'rewatch' THEN 1.5
        WHEN 'not_interested' THEN -3 WHEN 'skip' THEN -0.3 ELSE 0
      END;
      FOR v_hashtag IN SELECT DISTINCT lower(m[1]) FROM regexp_matches(v_content, '#([A-Za-z0-9_]{2,30})', 'g') AS m LOOP
        INSERT INTO public.user_hashtag_affinity (user_id, hashtag, score, updated_at)
        VALUES (p_user_id, v_hashtag, v_weight, NOW())
        ON CONFLICT (user_id, hashtag) DO UPDATE
          SET score = public.user_hashtag_affinity.score * 0.98 + v_weight,
              updated_at = NOW();
      END LOOP;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.record_content_event TO authenticated;

-- Batched version - the app queues events client-side and flushes them
-- together every few seconds, so a whole batch is one round trip instead
-- of one per event (keeps this comfortable on Supabase's free plan).
CREATE OR REPLACE FUNCTION public.record_content_events_batch(p_events JSONB) RETURNS VOID AS $$
DECLARE
  ev JSONB;
BEGIN
  FOR ev IN SELECT * FROM jsonb_array_elements(p_events) LOOP
    PERFORM public.record_content_event(
      (ev->>'user_id')::UUID,
      ev->>'target_type',
      (ev->>'target_id')::UUID,
      NULLIF(ev->>'creator_id', '')::UUID,
      ev->>'event_type',
      NULLIF(ev->>'watch_seconds', '')::NUMERIC,
      NULLIF(ev->>'video_duration', '')::NUMERIC
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.record_content_events_batch TO authenticated;

-- ------------------------------------------------------------
-- Retention: raw content_events rows are only ever needed briefly (they've
-- already been folded into posts.* and the affinity tables above the
-- instant they arrived) - keep 30 days for debugging/future re-tuning,
-- then drop them so this table can never grow unbounded on the free plan.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_events_cleanup_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ran_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_count INT NOT NULL
);

CREATE OR REPLACE FUNCTION public.cleanup_content_events(retention_days INT DEFAULT 30) RETURNS INT AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM public.content_events WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  INSERT INTO public.content_events_cleanup_log (deleted_count) VALUES (v_deleted);
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Schedule it to run daily if pg_cron is available on this Supabase
-- project (it is on every plan that has the extension enabled under
-- Database -> Extensions). If it isn't enabled, this quietly does
-- nothing here - see the note in the summary for the manual/API fallback.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('cleanup-content-events') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-content-events');
    PERFORM cron.schedule('cleanup-content-events', '0 3 * * *', 'SELECT public.cleanup_content_events(30);');
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron present but e.g. permissions differ on this project - the
  -- manual/API-route fallback below still covers cleanup either way.
  NULL;
END $$;
