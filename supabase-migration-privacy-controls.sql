-- ============================================================
-- SociaLens - Account Privacy Controls (Post / Message / Search)
-- Run this in your Supabase project's SQL Editor.
-- Safe to run even if already applied (idempotent). No data is deleted.
-- New accounts default to fully public ('everyone') on every setting, so
-- people can freely configure things from a wide-open starting point.
-- ============================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS post_privacy TEXT DEFAULT 'everyone'
  CHECK (post_privacy IN ('everyone', 'followers', 'following', 'selected', 'none'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS message_privacy TEXT DEFAULT 'everyone'
  CHECK (message_privacy IN ('everyone', 'followers', 'following', 'selected', 'none'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS search_privacy TEXT DEFAULT 'everyone'
  CHECK (search_privacy IN ('everyone', 'followers', 'following', 'selected', 'none'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS accepted_terms_at TIMESTAMPTZ;

-- The "selected people" lists for each of the 3 privacy categories above -
-- e.g. if post_privacy = 'selected', this is who's actually allowed to see.
CREATE TABLE IF NOT EXISTS public.privacy_selected_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('post', 'message', 'search')),
    selected_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(owner_id, category, selected_user_id)
);

ALTER TABLE public.privacy_selected_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own selected-people lists" ON public.privacy_selected_users;
CREATE POLICY "Users manage own selected-people lists" ON public.privacy_selected_users
    FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- Anyone can check whether they're on someone else's selected list (needed to
-- decide whether to show that person a "selected people" restricted post/etc).
DROP POLICY IF EXISTS "Anyone can check their own membership on a list" ON public.privacy_selected_users;
CREATE POLICY "Anyone can check their own membership on a list" ON public.privacy_selected_users
    FOR SELECT USING (auth.uid() = selected_user_id OR auth.uid() = owner_id);

-- ------------------------------------------------------------
-- Extend the posts visibility rule to also respect post_privacy, on top of
-- the existing "Private Account" + accepted-follower rule from before.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Posts are viewable by everyone" ON public.posts;
DROP POLICY IF EXISTS "Posts respect author privacy" ON public.posts;

CREATE POLICY "Posts respect author privacy" ON public.posts FOR SELECT USING (
    auth.uid() = user_id
    OR (
        -- Private-account gate (unchanged from before): public accounts pass
        -- straight through, private accounts need an accepted follow.
        (
            NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = user_id AND is_private = true)
            OR EXISTS (
                SELECT 1 FROM public.follows
                WHERE follower_id = auth.uid() AND following_id = user_id AND status = 'accepted'
            )
        )
        AND
        -- Post-level privacy gate (new): who's allowed to see this author's posts at all.
        (
            COALESCE((SELECT post_privacy FROM public.profiles WHERE id = user_id), 'everyone') = 'everyone'
            OR (
                (SELECT post_privacy FROM public.profiles WHERE id = user_id) = 'followers'
                AND EXISTS (SELECT 1 FROM public.follows WHERE follower_id = auth.uid() AND following_id = user_id AND status = 'accepted')
            )
            OR (
                (SELECT post_privacy FROM public.profiles WHERE id = user_id) = 'following'
                AND EXISTS (SELECT 1 FROM public.follows WHERE follower_id = user_id AND following_id = auth.uid() AND status = 'accepted')
            )
            OR (
                (SELECT post_privacy FROM public.profiles WHERE id = user_id) = 'selected'
                AND EXISTS (SELECT 1 FROM public.privacy_selected_users WHERE owner_id = user_id AND category = 'post' AND selected_user_id = auth.uid())
            )
        )
    )
);

-- ============================================================
-- Extend "who can message me" (message_privacy) into an actual rule: new
-- conversations can only be created if the recipient's setting allows it.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION can_message(sender UUID, recipient UUID)
RETURNS BOOLEAN AS $$
DECLARE
  privacy TEXT;
BEGIN
  SELECT message_privacy INTO privacy FROM public.profiles WHERE id = recipient;
  IF privacy IS NULL OR privacy = 'everyone' THEN RETURN true; END IF;
  IF privacy = 'none' THEN RETURN false; END IF;
  IF privacy = 'followers' THEN
    RETURN EXISTS (SELECT 1 FROM public.follows WHERE follower_id = sender AND following_id = recipient AND status = 'accepted');
  END IF;
  IF privacy = 'following' THEN
    RETURN EXISTS (SELECT 1 FROM public.follows WHERE follower_id = recipient AND following_id = sender AND status = 'accepted');
  END IF;
  IF privacy = 'selected' THEN
    RETURN EXISTS (SELECT 1 FROM public.privacy_selected_users WHERE owner_id = recipient AND category = 'message' AND selected_user_id = sender);
  END IF;
  RETURN false;
END;
$$ LANGUAGE plpgsql STABLE;

DROP POLICY IF EXISTS "Users can create chats" ON public.chats;
CREATE POLICY "Users can create chats" ON public.chats FOR INSERT WITH CHECK (
    (auth.uid() = participant1_id OR auth.uid() = participant2_id)
    AND can_message(auth.uid(), CASE WHEN participant1_id = auth.uid() THEN participant2_id ELSE participant1_id END)
);

-- ============================================================
-- Done! Redeploy the updated app code after running this.
-- ============================================================
