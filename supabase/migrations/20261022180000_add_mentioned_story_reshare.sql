-- Preserve the source story and original author attribution when a mentioned
-- story is added to another account's Story tray.
ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS original_story_id uuid,
  ADD COLUMN IF NOT EXISTS original_story_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS original_story_username text;

CREATE INDEX IF NOT EXISTS stories_original_story_id_idx
  ON public.stories (original_story_id)
  WHERE original_story_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_mentioned_story_reshare()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  source_story public.stories%ROWTYPE;
  source_username text;
  account_story_privacy text;
  can_view boolean := true;
BEGIN
  IF NEW.original_story_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL OR NEW.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'You can only add a story to your own account.';
  END IF;
  SELECT * INTO source_story FROM public.stories
  WHERE id = NEW.original_story_id AND expires_at > now();
  IF NOT FOUND THEN RAISE EXCEPTION 'The original story is no longer available.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.story_mentions sm WHERE sm.story_id = source_story.id AND sm.mentioned_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Only a story that mentioned you can be added to your story.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.blocks b WHERE (b.blocker_id = auth.uid() AND b.blocked_id = source_story.user_id) OR (b.blocker_id = source_story.user_id AND b.blocked_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM public.story_hidden_viewers hv WHERE hv.owner_id = source_story.user_id AND hv.hidden_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'This story is not available.';
  END IF;

  SELECT story_privacy INTO account_story_privacy FROM public.profiles WHERE id = source_story.user_id;
  IF source_story.visibility = 'none' OR COALESCE(account_story_privacy, 'everyone') = 'none' THEN can_view := false; END IF;

  IF source_story.visibility = 'followers' THEN
    can_view := can_view AND EXISTS (SELECT 1 FROM public.follows WHERE follower_id = auth.uid() AND following_id = source_story.user_id AND status = 'accepted');
  END IF;
  IF source_story.visibility = 'following' THEN
    can_view := can_view AND EXISTS (SELECT 1 FROM public.follows WHERE follower_id = source_story.user_id AND following_id = auth.uid() AND status = 'accepted');
  END IF;
  IF source_story.visibility = 'selected' THEN
    can_view := can_view AND (auth.uid() = ANY(COALESCE(source_story.visibility_selected_ids, ARRAY[]::uuid[]))
      OR EXISTS (SELECT 1 FROM public.privacy_selected_users ps WHERE ps.owner_id = source_story.user_id AND ps.category = 'story' AND ps.selected_user_id = auth.uid()));
  END IF;

  IF COALESCE(account_story_privacy, 'everyone') = 'followers' THEN
    can_view := can_view AND EXISTS (SELECT 1 FROM public.follows WHERE follower_id = auth.uid() AND following_id = source_story.user_id AND status = 'accepted');
  END IF;
  IF COALESCE(account_story_privacy, 'everyone') = 'following' THEN
    can_view := can_view AND EXISTS (SELECT 1 FROM public.follows WHERE follower_id = source_story.user_id AND following_id = auth.uid() AND status = 'accepted');
  END IF;
  IF COALESCE(account_story_privacy, 'everyone') = 'selected' THEN
    can_view := can_view AND EXISTS (SELECT 1 FROM public.privacy_selected_users ps WHERE ps.owner_id = source_story.user_id AND ps.category = 'story' AND ps.selected_user_id = auth.uid());
  END IF;
  IF NOT can_view THEN RAISE EXCEPTION 'This story is not available to your account.'; END IF;

  SELECT username INTO source_username FROM public.profiles WHERE id = source_story.user_id;
  NEW.original_story_user_id := COALESCE(source_story.original_story_user_id, source_story.user_id);
  NEW.original_story_username := COALESCE(source_story.original_story_username, source_username);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_mentioned_story_reshare ON public.stories;
CREATE TRIGGER validate_mentioned_story_reshare
BEFORE INSERT OR UPDATE OF original_story_id, user_id ON public.stories
FOR EACH ROW EXECUTE FUNCTION public.validate_mentioned_story_reshare();

REVOKE ALL ON FUNCTION public.validate_mentioned_story_reshare() FROM PUBLIC, anon, authenticated;
