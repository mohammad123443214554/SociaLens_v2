-- ============================================================
-- SociaLens - Full Notification Overhaul
-- Adds the columns and notification types needed so every action gets
-- its own precise notification (sent a photo vs sent a video vs shared
-- a post, liked/reacted/replied to a comment with the actual text, etc.),
-- and teaches the message trigger to tell those apart automatically.
-- Safe to run more than once.
-- ============================================================

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS comment_id UUID;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS story_id UUID;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS emoji TEXT;
-- Secondary text alongside `message` - e.g. for a reply notification,
-- `message` holds the reply's own text and `context_text` holds the
-- original comment it replied to, so both can be shown together.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS context_text TEXT;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'like', 'comment', 'follow', 'unfollow', 'message', 'new_post',
    'blocked', 'unblocked',
    'share_post', 'photo', 'video', 'voice_message',
    'story_reply', 'message_reply', 'repost',
    'comment_like', 'comment_react', 'comment_reply',
    'story_like', 'story_react', 'story_comment',
    'story_comment_like', 'story_comment_react', 'story_comment_reply'
  ));

-- Tell apart every kind of chat message so its notification reads right:
-- a story reply, a reply to a specific message, a shared post, a photo,
-- a video, a voice note, or a plain text message - all land in the same
-- `messages` table, differing only by which of these columns is set.
CREATE OR REPLACE FUNCTION notify_on_new_message()
RETURNS TRIGGER AS $$
DECLARE
  recipient UUID;
  notif_type TEXT;
BEGIN
  recipient := get_chat_recipient(NEW.chat_id, NEW.sender_id);
  IF recipient IS NOT NULL AND recipient != NEW.sender_id AND should_notify_message(recipient, NEW.sender_id) THEN
    IF NEW.story_id IS NOT NULL THEN
      notif_type := 'story_reply';
    ELSIF NEW.reply_to_id IS NOT NULL THEN
      notif_type := 'message_reply';
    ELSIF NEW.post_id IS NOT NULL THEN
      notif_type := 'share_post';
    ELSIF NEW.media_type = 'image' THEN
      notif_type := 'photo';
    ELSIF NEW.media_type = 'video' THEN
      notif_type := 'video';
    ELSIF NEW.media_type = 'audio' THEN
      notif_type := 'voice_message';
    ELSE
      notif_type := 'message';
    END IF;

    INSERT INTO public.notifications (user_id, actor_id, type, message, post_id, story_id)
    VALUES (recipient, NEW.sender_id, notif_type, LEFT(NEW.content, 100), NEW.post_id, NEW.story_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
