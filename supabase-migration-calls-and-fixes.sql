-- ============================================================
-- SociaLens - Calls, message features & ringtone settings
-- ============================================================
-- Run this ONCE in Supabase SQL Editor. Every statement is safe to
-- re-run (IF NOT EXISTS everywhere), so it will never error out or
-- duplicate anything even if some of these columns/tables already
-- exist in your project.
--
-- This fixes:
--   1. Voice calls not working / call log not appearing in chat
--      (the "calls" table the app's code expects was never created)
--   2. Message reactions ("react" button doing nothing)
--   3. Forwarding a message losing the media/reel/post it was
--      attached to (needs the same columns "messages" already
--      needed for photos/videos/replies/stickers)
--   4. Ringtone + call-volume settings (new "Call settings" page)
-- ============================================================

-- ------------------------------------------------------------
-- 1. MESSAGES - make sure every column the chat UI relies on exists
-- ------------------------------------------------------------
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_type TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_duration_seconds INTEGER;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS sticker TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS story_id UUID REFERENCES public.stories(id) ON DELETE SET NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT false;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_forwarded BOOLEAN DEFAULT false;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_aperonix_reply BOOLEAN DEFAULT false;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS deleted_for_sender BOOLEAN DEFAULT false;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS deleted_for_recipient BOOLEAN DEFAULT false;

-- media_type had a narrower CHECK constraint from an older version of the
-- app (only 'image'/'video'/'none') that the "ADD COLUMN IF NOT EXISTS"
-- above can't widen if the column already existed - that mismatch is why
-- every call-log message insert (media_type = 'call') was silently
-- rejected and never appeared in the chat. This finds whatever that old
-- constraint is named and replaces it with the current, wider one.
DO $$
DECLARE
    old_constraint_name TEXT;
BEGIN
    SELECT con.conname INTO old_constraint_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
    WHERE rel.relname = 'messages' AND con.contype = 'c' AND att.attname = 'media_type';

    IF old_constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.messages DROP CONSTRAINT %I', old_constraint_name);
    END IF;

    ALTER TABLE public.messages ADD CONSTRAINT messages_media_type_check
        CHECK (media_type IN ('image', 'video', 'audio', 'call'));
END $$;

-- ------------------------------------------------------------
-- 2. MESSAGE REACTIONS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_reactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    emoji TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(message_id, user_id)
);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reactions viewable by chat participants" ON public.message_reactions;
CREATE POLICY "Reactions viewable by chat participants" ON public.message_reactions FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.messages m
        JOIN public.chats c ON c.id = m.chat_id
        WHERE m.id = message_id AND (c.participant1_id = auth.uid() OR c.participant2_id = auth.uid())
    )
);

DROP POLICY IF EXISTS "Users can react to messages in their chats" ON public.message_reactions;
CREATE POLICY "Users can react to messages in their chats" ON public.message_reactions FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
        SELECT 1 FROM public.messages m
        JOIN public.chats c ON c.id = m.chat_id
        WHERE m.id = message_id AND (c.participant1_id = auth.uid() OR c.participant2_id = auth.uid())
    )
);

DROP POLICY IF EXISTS "Users can update own reaction" ON public.message_reactions;
CREATE POLICY "Users can update own reaction" ON public.message_reactions FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can remove own reaction" ON public.message_reactions;
CREATE POLICY "Users can remove own reaction" ON public.message_reactions FOR DELETE USING (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 3. CALLS - audio-only (video calling was removed from the app)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.calls (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    chat_id UUID REFERENCES public.chats(id) ON DELETE SET NULL,
    caller_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    callee_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL DEFAULT 'audio' CHECK (type IN ('audio', 'video')),
    status TEXT NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing', 'accepted', 'rejected', 'missed', 'ended', 'cancelled', 'busy')),
    provider TEXT CHECK (provider IN ('agora', 'daily')),
    room_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ
);

-- In case the table already existed from an older version, make sure
-- the v2 columns (provider/room_name) are present too.
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS room_name TEXT;

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can view their calls" ON public.calls;
CREATE POLICY "Participants can view their calls" ON public.calls FOR SELECT USING (
    auth.uid() = caller_id OR auth.uid() = callee_id
);

DROP POLICY IF EXISTS "Users can start calls as themselves" ON public.calls;
CREATE POLICY "Users can start calls as themselves" ON public.calls FOR INSERT WITH CHECK (auth.uid() = caller_id);

DROP POLICY IF EXISTS "Participants can update their calls" ON public.calls;
CREATE POLICY "Participants can update their calls" ON public.calls FOR UPDATE USING (
    auth.uid() = caller_id OR auth.uid() = callee_id
);

-- ------------------------------------------------------------
-- 4. RINGTONE / CALL SETTINGS (per-user)
-- ------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS call_ringtone TEXT DEFAULT 'chime';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS call_ringtone_volume NUMERIC DEFAULT 1.0 CHECK (call_ringtone_volume >= 0 AND call_ringtone_volume <= 1);

-- ------------------------------------------------------------
-- 5. STORAGE BUCKETS the app already uses in code but that were
--    missing from supabase-setup.sql (stories, chat media, wallpapers)
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public) VALUES ('stories', 'stories', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-media', 'chat-media', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-wallpapers', 'chat-wallpapers', true) ON CONFLICT DO NOTHING;

DROP POLICY IF EXISTS "Story media is publicly accessible" ON storage.objects;
CREATE POLICY "Story media is publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'stories');
DROP POLICY IF EXISTS "Users can upload their own story media" ON storage.objects;
CREATE POLICY "Users can upload their own story media" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'stories' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "Users can delete their own story media" ON storage.objects;
CREATE POLICY "Users can delete their own story media" ON storage.objects FOR DELETE USING (bucket_id = 'stories' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Chat media is publicly accessible" ON storage.objects;
CREATE POLICY "Chat media is publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'chat-media');
DROP POLICY IF EXISTS "Users can upload their own chat media" ON storage.objects;
CREATE POLICY "Users can upload their own chat media" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "Users can delete their own chat media" ON storage.objects;
CREATE POLICY "Users can delete their own chat media" ON storage.objects FOR DELETE USING (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Chat wallpapers are publicly accessible" ON storage.objects;
CREATE POLICY "Chat wallpapers are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'chat-wallpapers');
DROP POLICY IF EXISTS "Users can upload their own chat wallpaper" ON storage.objects;
CREATE POLICY "Users can upload their own chat wallpaper" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'chat-wallpapers' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "Users can delete their own chat wallpaper" ON storage.objects;
CREATE POLICY "Users can delete their own chat wallpaper" ON storage.objects FOR DELETE USING (bucket_id = 'chat-wallpapers' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ------------------------------------------------------------
-- 6. PUSH NOTIFICATIONS - lets a call or message notify someone even
--    when SociaLens isn't open in a tab (standard Web Push, same
--    mechanism every PWA - including WhatsApp Web - uses for this).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users manage their own push subscriptions" ON public.push_subscriptions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- The server sends pushes using the service role key (bypasses RLS), so
-- it can read every subscription regardless of whose it is - that part
-- never goes through the policy above.

-- ------------------------------------------------------------
-- 7. REALTIME - so incoming calls, reactions, and edits push live
-- ------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'calls'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'message_reactions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
    END IF;
    -- Belt-and-braces: make sure these are actually in the realtime
    -- publication too. They should already be from supabase-setup.sql,
    -- but if that step was ever skipped this is exactly why messages/chat
    -- updates only ever show up after a manual refresh instead of live.
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'chats'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.chats;
    END IF;
END $$;

-- ------------------------------------------------------------
-- 8. CHAT LIST - pin, archive, and knowing who sent the last message
--    (needed to show "You: ..." vs the other person's preview, and to
--    hide archived chats from notifications/unread counts).
-- ------------------------------------------------------------
ALTER TABLE public.chats ADD COLUMN IF NOT EXISTS pinned_by UUID[] DEFAULT '{}';
ALTER TABLE public.chats ADD COLUMN IF NOT EXISTS archived_by UUID[] DEFAULT '{}';
ALTER TABLE public.chats ADD COLUMN IF NOT EXISTS last_message_sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Widen last_message_type the same way media_type was widened above - the
-- app already writes 'story'/'aperonix' (and now 'image'/'video'/'audio'/
-- 'call'/'sticker'/'reaction') but the original constraint only allowed
-- 'text'/'post'/'reel', so those updates were being silently rejected.
DO $$
DECLARE
    old_constraint_name TEXT;
BEGIN
    SELECT con.conname INTO old_constraint_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
    WHERE rel.relname = 'chats' AND con.contype = 'c' AND att.attname = 'last_message_type';

    IF old_constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.chats DROP CONSTRAINT %I', old_constraint_name);
    END IF;

    ALTER TABLE public.chats ADD CONSTRAINT chats_last_message_type_check
        CHECK (last_message_type IN ('text', 'post', 'reel', 'story', 'aperonix', 'image', 'video', 'audio', 'call', 'sticker', 'reaction'));
END $$;

-- Archive PIN (a numeric password, not a browser push key) - one per
-- person, protects their whole archive section, not per-chat.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS archive_password_hash TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS archive_password_hint TEXT;
