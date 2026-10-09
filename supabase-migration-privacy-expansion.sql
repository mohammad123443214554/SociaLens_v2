-- ============================================================
-- SociaLens - Expanded Privacy Controls
-- Adds: Suggestions Privacy (split out from Search Result Privacy),
-- Story Privacy, Post Comment Privacy, Story Comment Privacy, and
-- Call Privacy. Run this in your Supabase project's SQL Editor.
-- Safe to run more than once - no data is deleted, and every account
-- defaults to fully public ('everyone') so nothing changes for anyone
-- until they actually open Settings and change something.
-- ============================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suggestions_privacy TEXT DEFAULT 'everyone'
  CHECK (suggestions_privacy IN ('everyone', 'followers', 'following', 'selected', 'none'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS story_privacy TEXT DEFAULT 'everyone'
  CHECK (story_privacy IN ('everyone', 'followers', 'following', 'selected', 'none'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS post_comment_privacy TEXT DEFAULT 'everyone'
  CHECK (post_comment_privacy IN ('everyone', 'followers', 'following', 'selected', 'none'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS story_comment_privacy TEXT DEFAULT 'everyone'
  CHECK (story_comment_privacy IN ('everyone', 'followers', 'following', 'selected', 'none'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS call_privacy TEXT DEFAULT 'everyone'
  CHECK (call_privacy IN ('everyone', 'followers', 'following', 'selected', 'none'));

-- Backfill: everyone who currently has search_privacy set keeps the same
-- value for the brand-new suggestions_privacy field too, so nobody's
-- effective visibility silently changes the moment this migration runs
-- (they can go split them apart afterwards in Settings if they want to).
UPDATE public.profiles SET suggestions_privacy = search_privacy WHERE search_privacy IS NOT NULL;

-- privacy_selected_users.category previously only allowed
-- post/message/search/notify_message/notify_post - widen it to also
-- accept the 5 new categories above.
ALTER TABLE public.privacy_selected_users DROP CONSTRAINT IF EXISTS privacy_selected_users_category_check;
ALTER TABLE public.privacy_selected_users ADD CONSTRAINT privacy_selected_users_category_check
  CHECK (category IN (
    'post', 'message', 'search', 'notify_message', 'notify_post',
    'suggestions', 'story', 'post_comment', 'story_comment', 'call'
  ));
