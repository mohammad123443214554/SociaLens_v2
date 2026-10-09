-- ============================================================
-- SociaLens - Notification Type Fix: Calls
-- The message-type trigger from supabase-migration-notifications-overhaul.sql
-- correctly told photos/videos/voice notes/story replies/message replies/
-- shared posts apart, but had no branch for a call log entry
-- (media_type = 'call'), so those fell through to the generic 'message'
-- case. This adds a proper 'call' type and teaches the trigger to use it,
-- with wording that reflects whether the call was completed, missed,
-- declined, or cancelled.
--
-- IMPORTANT: run this AFTER supabase-migration-notifications-overhaul.sql
-- (it must already exist for this file to apply cleanly). Safe to run
-- more than once.
-- ============================================================

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'like', 'comment', 'follow', 'unfollow', 'message', 'new_post',
    'blocked', 'unblocked',
    'share_post', 'photo', 'video', 'voice_message', 'call',
    'story_reply', 'message_reply', 'repost',
    'comment_like', 'comment_react', 'comment_reply',
    'story_like', 'story_react', 'story_comment',
    'story_comment_like', 'story_comment_react', 'story_comment_reply'
  ));

CREATE OR REPLACE FUNCTION notify_on_new_message()
RETURNS TRIGGER AS $$
DECLARE
  recipient UUID;
  notif_type TEXT;
  call_outcome TEXT;
BEGIN
  recipient := get_chat_recipient(NEW.chat_id, NEW.sender_id);
  IF recipient IS NOT NULL AND recipient != NEW.sender_id AND should_notify_message(recipient, NEW.sender_id) THEN
    IF NEW.media_type = 'call' THEN
      notif_type := 'call';
      -- The call log's `content` is a small JSON blob like
      -- {"callType":"video","outcome":"missed","durationSec":0} - pull the
      -- outcome out of it so the notification can say "missed a call" vs
      -- "made a call" instead of a flat, unhelpful "sent a message".
      BEGIN
        call_outcome := NEW.content::json->>'outcome';
      EXCEPTION WHEN OTHERS THEN
        call_outcome := NULL;
      END;
      INSERT INTO public.notifications (user_id, actor_id, type, message, post_id, story_id)
      VALUES (recipient, NEW.sender_id, notif_type, call_outcome, NEW.post_id, NEW.story_id);
      RETURN NEW;
    END IF;

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
