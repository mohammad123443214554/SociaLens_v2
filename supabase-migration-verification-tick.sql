-- ===========================================================
-- SociaLens - Verification Tick (yellow / blue)
-- Safe to run more than once.
-- ===========================================================

-- verification_type distinguishes the official yellow tick from an
-- admin-granted blue tick. is_verified stays in place as a simple
-- "has some kind of tick" flag so existing UI checks (`profile.is_verified`)
-- keep working without being rewritten everywhere.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verification_type TEXT CHECK (verification_type IN ('blue', 'yellow'));

-- SociaLensOfficial gets the yellow tick, and only SociaLensOfficial -
-- this is set directly here rather than through any admin-panel toggle,
-- so there's no button anywhere that could hand out a second yellow tick.
UPDATE public.profiles SET verification_type = 'yellow', is_verified = true WHERE username = 'SociaLensOfficial';

-- Anyone who already had is_verified = true from before this feature
-- existed becomes a blue tick by default (except SociaLensOfficial,
-- already set to yellow above).
UPDATE public.profiles SET verification_type = 'blue' WHERE is_verified = true AND verification_type IS NULL;

-- ------------------------------------------------------------
-- IMPORTANT FIX (unrelated to the tick, found while adding it):
-- supabase-migration-views-reposts.sql's notifications.type constraint
-- fix looked up whatever the *current* constraint was named and replaced
-- it with a hardcoded short list - ('like','comment','follow','unfollow',
-- 'message','new_post','repost') - silently dropping every type added by
-- notifications-overhaul.sql and notifications-call-fix.sql ('blocked',
-- 'unblocked', 'call', 'photo', 'video', 'voice_message', 'share_post',
-- 'story_reply', 'message_reply', the comment/story reaction types...).
-- If that file ran after the other two, every one of those notification
-- inserts has been failing quietly ever since (the app doesn't check the
-- result of that particular insert, so nothing visibly broke - people
-- just weren't getting notified). This restores the full list and adds
-- 'verified' for the new tick notification.
-- ------------------------------------------------------------
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'like', 'comment', 'follow', 'unfollow', 'message', 'new_post',
    'blocked', 'unblocked',
    'share_post', 'photo', 'video', 'voice_message', 'call',
    'story_reply', 'message_reply', 'repost',
    'comment_like', 'comment_react', 'comment_reply',
    'story_like', 'story_react', 'story_comment',
    'story_comment_like', 'story_comment_react', 'story_comment_reply',
    'verified'
  ));
