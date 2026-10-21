-- A user may reshare each mentioned source story only once, even if their
-- reshared copy later expires. Enforce this in the database to prevent races
-- and duplicate clicks from creating multiple copies.
CREATE UNIQUE INDEX IF NOT EXISTS stories_user_original_story_unique
  ON public.stories (user_id, original_story_id)
  WHERE original_story_id IS NOT NULL;
