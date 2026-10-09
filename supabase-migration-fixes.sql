-- ============================================================
-- SociaLens - Bug Fix Migration
-- Run this in your EXISTING Supabase project's SQL Editor.
-- Safe to run even if some parts already exist (idempotent).
-- This does NOT delete or touch any existing data.
-- ============================================================

-- ------------------------------------------------------------
-- FIX 1: `notifications` table was missing entirely.
-- NotificationPanel.tsx, ShareModal.tsx and delete-account/page.tsx
-- all read/write this table but it never existed in the schema.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('like', 'comment', 'follow', 'unfollow', 'message')),
    message TEXT,
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert notifications for others" ON public.notifications;
CREATE POLICY "Users can insert notifications for others" ON public.notifications FOR INSERT WITH CHECK (auth.uid() = actor_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
CREATE POLICY "Users can delete own notifications" ON public.notifications FOR DELETE USING (auth.uid() = user_id);

-- Enable realtime for notifications (needed for the bell icon live updates)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;

-- ------------------------------------------------------------
-- FIX 2: `messages.post_id` column was missing.
-- ShareModal.tsx / ChatMessage.tsx / SharedPostMessage.tsx rely on
-- this column to render "shared post" bubbles in chat.
-- ------------------------------------------------------------
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- FIX 3: `chats.last_message_type` column was missing.
-- Chat list page uses this to show "📎 Shared a post" / "🎬 Shared a reel".
-- ------------------------------------------------------------
ALTER TABLE public.chats ADD COLUMN IF NOT EXISTS last_message_type TEXT DEFAULT 'text' CHECK (last_message_type IN ('text', 'post', 'reel'));

-- ------------------------------------------------------------
-- FIX 4: Missing DELETE policies on `chats` and `messages`.
-- Without these, "Delete Conversation" (chat/[chatId]/page.tsx) and
-- the message-deletion step in delete-account/page.tsx silently fail,
-- because RLS denies any command with no matching policy.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can delete own chats" ON public.chats;
CREATE POLICY "Users can delete own chats" ON public.chats FOR DELETE USING (
    auth.uid() = participant1_id OR auth.uid() = participant2_id
);

DROP POLICY IF EXISTS "Chat participants can delete messages" ON public.messages;
CREATE POLICY "Chat participants can delete messages" ON public.messages FOR DELETE USING (
    auth.uid() IN (
        SELECT participant1_id FROM public.chats WHERE id = chat_id
        UNION
        SELECT participant2_id FROM public.chats WHERE id = chat_id
    )
);

-- ------------------------------------------------------------
-- FIX 5: Unfollow never decremented followers_count/following_count,
-- because the decrement RPC functions didn't exist yet.
-- (lib/hooks/useFollow.ts is updated to call these.)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION decrement_followers(profile_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.profiles SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION decrement_following(profile_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.profiles SET following_count = GREATEST(following_count - 1, 0) WHERE id = profile_id;
END;
$$;

-- ============================================================
-- Done! After running this, redeploy the updated app code
-- (lib/hooks/useFollow.ts, lib/types/database.types.ts, and the
-- like/comment notification inserts) so the app matches this schema.
-- ============================================================
