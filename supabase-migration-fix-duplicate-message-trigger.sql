-- ============================================================
-- SociaLens - Duplicate Message-Notification Trigger Cleanup
-- If every chat action (message/photo/video/share/reply/call) is
-- producing BOTH its correct notification AND an extra generic
-- "sent a message" one, there is a second trigger on public.messages
-- that predates the tracked migration files - this finds every
-- trigger actually attached to that table and removes anything that
-- isn't the one function this app is supposed to use, then recreates
-- that one function+trigger cleanly.
--
-- STEP 1 - run this block FIRST, on its own, and read the output.
-- It lists every trigger currently attached to public.messages so we
-- can see exactly what's there before removing anything.
-- ============================================================
SELECT tgname AS trigger_name, proname AS function_name
FROM pg_trigger
JOIN pg_proc ON pg_trigger.tgfoid = pg_proc.oid
WHERE tgrelid = 'public.messages'::regclass AND NOT tgisinternal;

-- Also check the chats table - sendMessage updates chats.last_message
-- right after inserting the message, so if there's ALSO an untracked
-- trigger firing on that update, it could be the second source too.
SELECT tgname AS trigger_name, proname AS function_name
FROM pg_trigger
JOIN pg_proc ON pg_trigger.tgfoid = pg_proc.oid
WHERE tgrelid = 'public.chats'::regclass AND NOT tgisinternal;

-- ============================================================
-- STEP 2 - after checking the list above, run everything below.
-- This drops every non-internal trigger on public.messages (whatever
-- their names turned out to be) and every function whose name suggests
-- it also notifies on new messages, then rebuilds exactly one clean
-- trigger + function. Safe to run more than once.
-- ============================================================
DO $$
DECLARE
  trig RECORD;
BEGIN
  FOR trig IN
    SELECT tgname FROM pg_trigger
    WHERE tgrelid = 'public.messages'::regclass AND NOT tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.messages', trig.tgname);
  END LOOP;

  -- Same cleanup for chats, in case the duplicate is firing off the
  -- last_message update instead of the message insert itself.
  FOR trig IN
    SELECT tgname FROM pg_trigger
    WHERE tgrelid = 'public.chats'::regclass AND NOT tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.chats', trig.tgname);
  END LOOP;
END $$;

-- Common alternate names an older/hand-written version of this trigger
-- or function might have used - dropping these is a no-op if they were
-- never actually created under these exact names.
DROP TRIGGER IF EXISTS on_new_message ON public.messages;
DROP TRIGGER IF EXISTS notify_new_message_trigger ON public.messages;
DROP TRIGGER IF EXISTS message_notification_trigger ON public.messages;
DROP TRIGGER IF EXISTS handle_new_message ON public.messages;
DROP TRIGGER IF EXISTS new_message_trigger ON public.messages;
DROP FUNCTION IF EXISTS on_new_message() CASCADE;
DROP FUNCTION IF EXISTS handle_new_message() CASCADE;
DROP FUNCTION IF EXISTS notify_new_message() CASCADE;
DROP FUNCTION IF EXISTS create_message_notification() CASCADE;

-- Rebuild the one function this app actually uses.
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

-- Exactly one trigger, guaranteed - drop-then-create instead of
-- CREATE OR REPLACE (triggers don't support REPLACE the same way).
DROP TRIGGER IF EXISTS trg_notify_new_message ON public.messages;
CREATE TRIGGER trg_notify_new_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION notify_on_new_message();

-- ============================================================
-- STEP 3 - confirm only one trigger remains. This should return
-- exactly one row: trg_notify_new_message / notify_on_new_message.
-- ============================================================
SELECT tgname AS trigger_name, proname AS function_name
FROM pg_trigger
JOIN pg_proc ON pg_trigger.tgfoid = pg_proc.oid
WHERE tgrelid = 'public.messages'::regclass AND NOT tgisinternal;
