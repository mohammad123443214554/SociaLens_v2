-- ===========================================================
-- SociaLens - Status (Active/Online) Privacy
-- Safe to run more than once.
-- ===========================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status_privacy TEXT DEFAULT 'everyone'
  CHECK (status_privacy IN ('everyone', 'followers', 'following', 'selected', 'none'));

-- privacy_selected_users.category currently allows post/message/search/
-- notify_message/notify_post/suggestions/story/post_comment/story_comment/
-- call/notify - widen it to also accept 'status', keeping every existing value.
ALTER TABLE public.privacy_selected_users DROP CONSTRAINT IF EXISTS privacy_selected_users_category_check;
ALTER TABLE public.privacy_selected_users ADD CONSTRAINT privacy_selected_users_category_check
  CHECK (category IN (
    'post', 'message', 'search', 'notify_message', 'notify_post',
    'suggestions', 'story', 'post_comment', 'story_comment', 'call',
    'notify', 'status'
  ));
