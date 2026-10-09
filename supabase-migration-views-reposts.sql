-- ============================================================
-- SociaLens - Post views, real share counts, and Reposts
-- ============================================================

-- ------------------------------------------------------------
-- 1. VIEWS
-- ------------------------------------------------------------
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS views_count BIGINT DEFAULT 0;

CREATE OR REPLACE FUNCTION public.increment_post_views(post_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.posts SET views_count = views_count + 1 WHERE id = post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 2. SHARE COUNT - self-healing, same pattern as the follower-count fix.
--    shares_count already existed as a column but nothing ever wrote to
--    it (the Share modal never recorded a row), so it always read 0. This
--    keeps it permanently in sync with the real "shares" table instead of
--    relying on the app to remember to increment it by hand.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_share_count(target_post_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.posts SET
    shares_count = (SELECT COUNT(*) FROM public.shares WHERE post_id = target_post_id)
  WHERE id = target_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.handle_share_change()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_share_count(OLD.post_id);
    RETURN OLD;
  ELSE
    PERFORM public.recalculate_share_count(NEW.post_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_share_change ON public.shares;
CREATE TRIGGER on_share_change
  AFTER INSERT OR DELETE ON public.shares
  FOR EACH ROW EXECUTE FUNCTION public.handle_share_change();

-- One-time cleanup for any shares that happened before this existed.
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN SELECT DISTINCT post_id FROM public.shares LOOP
    PERFORM public.recalculate_share_count(p.post_id);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 3. REPOSTS - a reference to the original post, not a copy. Nothing
--    about the post itself (media, caption) is duplicated into the
--    reposter's own storage - this table just links "this person
--    reposted that post", so it costs virtually no storage no matter how
--    many times something gets reposted.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reposts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(post_id, user_id)
);

ALTER TABLE public.reposts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reposts are publicly viewable" ON public.reposts;
CREATE POLICY "Reposts are publicly viewable" ON public.reposts FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can repost as themselves" ON public.reposts;
CREATE POLICY "Users can repost as themselves" ON public.reposts FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can remove their own repost" ON public.reposts;
CREATE POLICY "Users can remove their own repost" ON public.reposts FOR DELETE USING (auth.uid() = user_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'reposts'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.reposts;
    END IF;
END $$;

-- notifications.type also needs "repost" added - same fix pattern used
-- for messages.media_type and chats.last_message_type earlier: find
-- whatever the existing CHECK constraint is named and widen it.
DO $$
DECLARE
    old_constraint_name TEXT;
BEGIN
    SELECT con.conname INTO old_constraint_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
    WHERE rel.relname = 'notifications' AND con.contype = 'c' AND att.attname = 'type';

    IF old_constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT %I', old_constraint_name);
    END IF;

    ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
        CHECK (type IN ('like', 'comment', 'follow', 'unfollow', 'message', 'new_post', 'repost'));
END $$;
