-- ============================================================
-- SociaLens - Notification Settings Simplification
-- Adds a single "mute everything" flag, and a unified 'notify' category
-- for the new "Notify me about" people picker (replacing the old
-- separate notify_message / notify_post radio pickers in the UI - those
-- columns are left in place, just unused by the new page).
-- Safe to run more than once.
-- ============================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notifications_muted BOOLEAN DEFAULT false;

ALTER TABLE public.privacy_selected_users DROP CONSTRAINT IF EXISTS privacy_selected_users_category_check;
ALTER TABLE public.privacy_selected_users ADD CONSTRAINT privacy_selected_users_category_check
  CHECK (category IN (
    'post', 'message', 'search', 'notify_message', 'notify_post',
    'suggestions', 'story', 'post_comment', 'story_comment', 'call',
    'notify'
  ));
