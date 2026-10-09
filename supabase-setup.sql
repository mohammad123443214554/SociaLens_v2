-- ============================================================
-- SociaLens - Complete Supabase Database Setup
-- Run this entire file in Supabase SQL Editor
-- ============================================================

-- TABLES
-- ============================================================

CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    full_name TEXT,
    bio TEXT,
    avatar_url TEXT,
    cover_photo_url TEXT,
    is_private BOOLEAN DEFAULT false,
    post_privacy TEXT DEFAULT 'everyone' CHECK (post_privacy IN ('everyone', 'followers', 'following', 'selected', 'none')),
    message_privacy TEXT DEFAULT 'everyone' CHECK (message_privacy IN ('everyone', 'followers', 'following', 'selected', 'none')),
    search_privacy TEXT DEFAULT 'everyone' CHECK (search_privacy IN ('everyone', 'followers', 'following', 'selected', 'none')),
    notify_messages TEXT DEFAULT 'everyone' CHECK (notify_messages IN ('everyone', 'followers', 'following', 'selected', 'none')),
    notify_posts TEXT DEFAULT 'everyone' CHECK (notify_posts IN ('everyone', 'followers', 'following', 'selected', 'none')),
    accepted_terms_at TIMESTAMPTZ,
    is_verified BOOLEAN DEFAULT false,
    posts_count INT DEFAULT 0,
    followers_count INT DEFAULT 0,
    following_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.posts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    content TEXT,
    media_url TEXT,
    media_type TEXT CHECK (media_type IN ('image', 'video', 'none')),
    likes_count INT DEFAULT 0,
    comments_count INT DEFAULT 0,
    shares_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.likes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(post_id, user_id)
);

CREATE TABLE public.comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.follows (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    follower_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    following_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(follower_id, following_id)
);

CREATE TABLE public.chats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    participant1_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    participant2_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    last_message TEXT,
    last_message_time TIMESTAMPTZ,
    last_message_type TEXT DEFAULT 'text' CHECK (last_message_type IN ('text', 'post', 'reel')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    chat_id UUID REFERENCES public.chats(id) ON DELETE CASCADE NOT NULL,
    sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,
    post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.shares (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
    shared_by_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    shared_to_chat_id UUID REFERENCES public.chats(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('like', 'comment', 'follow', 'unfollow', 'message', 'new_post')),
    message TEXT,
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.saved_folders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.saved_posts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
    folder_id UUID REFERENCES public.saved_folders(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, post_id)
);

CREATE TABLE public.privacy_selected_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('post', 'message', 'search', 'notify_message', 'notify_post')),
    selected_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(owner_id, category, selected_user_id)
);

-- ============================================================
-- REALTIME
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE saved_posts;

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_selected_users ENABLE ROW LEVEL SECURITY;

-- PROFILES policies
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- POSTS policies
CREATE POLICY "Posts respect author privacy" ON public.posts FOR SELECT USING (
    auth.uid() = user_id
    OR (
        (
            NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = user_id AND is_private = true)
            OR EXISTS (
                SELECT 1 FROM public.follows
                WHERE follower_id = auth.uid() AND following_id = user_id AND status = 'accepted'
            )
        )
        AND (
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
CREATE POLICY "Users can insert own posts" ON public.posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own posts" ON public.posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own posts" ON public.posts FOR DELETE USING (auth.uid() = user_id);

-- LIKES policies
CREATE POLICY "Likes are viewable by everyone" ON public.likes FOR SELECT USING (true);
CREATE POLICY "Authenticated users can like" ON public.likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike own likes" ON public.likes FOR DELETE USING (auth.uid() = user_id);

-- COMMENTS policies
CREATE POLICY "Comments are viewable by everyone" ON public.comments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can comment" ON public.comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own comments" ON public.comments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own comments" ON public.comments FOR DELETE USING (auth.uid() = user_id);

-- FOLLOWS policies
CREATE POLICY "Follows are viewable by everyone" ON public.follows FOR SELECT USING (true);
CREATE POLICY "Users can follow others" ON public.follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "Users can update follow status" ON public.follows FOR UPDATE USING (auth.uid() = following_id OR auth.uid() = follower_id);
CREATE POLICY "Users can unfollow" ON public.follows FOR DELETE USING (auth.uid() = follower_id OR auth.uid() = following_id);

-- CHATS policies
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

CREATE POLICY "Users can view own chats" ON public.chats FOR SELECT USING (auth.uid() = participant1_id OR auth.uid() = participant2_id);
CREATE POLICY "Users can create chats" ON public.chats FOR INSERT WITH CHECK (
    (auth.uid() = participant1_id OR auth.uid() = participant2_id)
    AND can_message(auth.uid(), CASE WHEN participant1_id = auth.uid() THEN participant2_id ELSE participant1_id END)
);
CREATE POLICY "Users can update own chats" ON public.chats FOR UPDATE USING (auth.uid() = participant1_id OR auth.uid() = participant2_id);
CREATE POLICY "Users can delete own chats" ON public.chats FOR DELETE USING (auth.uid() = participant1_id OR auth.uid() = participant2_id);

-- MESSAGES policies
CREATE POLICY "Chat participants can view messages" ON public.messages FOR SELECT USING (
    auth.uid() IN (
        SELECT participant1_id FROM public.chats WHERE id = chat_id
        UNION
        SELECT participant2_id FROM public.chats WHERE id = chat_id
    )
);
CREATE OR REPLACE FUNCTION get_chat_recipient(chat_id_param UUID, sender UUID)
RETURNS UUID AS $$
DECLARE
  recipient UUID;
BEGIN
  SELECT CASE WHEN participant1_id = sender THEN participant2_id ELSE participant1_id END
  INTO recipient
  FROM public.chats WHERE id = chat_id_param;
  RETURN recipient;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE POLICY "Chat participants can send messages" ON public.messages FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    auth.uid() IN (
        SELECT participant1_id FROM public.chats WHERE id = chat_id
        UNION
        SELECT participant2_id FROM public.chats WHERE id = chat_id
    )
    AND can_message(auth.uid(), get_chat_recipient(chat_id, auth.uid()))
);
CREATE POLICY "Users can mark own messages as read" ON public.messages FOR UPDATE USING (
    auth.uid() IN (
        SELECT participant1_id FROM public.chats WHERE id = chat_id
        UNION
        SELECT participant2_id FROM public.chats WHERE id = chat_id
    )
);
CREATE POLICY "Chat participants can delete messages" ON public.messages FOR DELETE USING (
    auth.uid() IN (
        SELECT participant1_id FROM public.chats WHERE id = chat_id
        UNION
        SELECT participant2_id FROM public.chats WHERE id = chat_id
    )
);

-- SHARES policies
CREATE POLICY "Users can view own shares" ON public.shares FOR SELECT USING (auth.uid() = shared_by_id);
CREATE POLICY "Users can share posts" ON public.shares FOR INSERT WITH CHECK (auth.uid() = shared_by_id);

-- NOTIFICATIONS policies
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert notifications for others" ON public.notifications FOR INSERT WITH CHECK (auth.uid() = actor_id);
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own notifications" ON public.notifications FOR DELETE USING (auth.uid() = user_id);

-- SAVED FOLDERS / SAVED POSTS policies
CREATE POLICY "Users manage own folders" ON public.saved_folders FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own saved posts" ON public.saved_posts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Hard limit of 10 folders per user
CREATE OR REPLACE FUNCTION check_folder_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM public.saved_folders WHERE user_id = NEW.user_id) >= 10 THEN
    RAISE EXCEPTION 'Folder limit of 10 reached';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_folder_limit
  BEFORE INSERT ON public.saved_folders
  FOR EACH ROW EXECUTE FUNCTION check_folder_limit();

-- PRIVACY SELECTED USERS policies
CREATE POLICY "Users manage own selected-people lists" ON public.privacy_selected_users
    FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Anyone can check their own membership on a list" ON public.privacy_selected_users
    FOR SELECT USING (auth.uid() = selected_user_id OR auth.uid() = owner_id);

-- ============================================================
-- NOTIFICATION PREFERENCE FUNCTIONS + TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION should_notify_message(recipient UUID, sender UUID)
RETURNS BOOLEAN AS $$
DECLARE
  pref TEXT;
BEGIN
  SELECT notify_messages INTO pref FROM public.profiles WHERE id = recipient;
  IF pref IS NULL OR pref = 'everyone' THEN RETURN true; END IF;
  IF pref = 'none' THEN RETURN false; END IF;
  IF pref = 'followers' THEN
    RETURN EXISTS (SELECT 1 FROM public.follows WHERE follower_id = sender AND following_id = recipient AND status = 'accepted');
  END IF;
  IF pref = 'following' THEN
    RETURN EXISTS (SELECT 1 FROM public.follows WHERE follower_id = recipient AND following_id = sender AND status = 'accepted');
  END IF;
  IF pref = 'selected' THEN
    RETURN EXISTS (SELECT 1 FROM public.privacy_selected_users WHERE owner_id = recipient AND category = 'notify_message' AND selected_user_id = sender);
  END IF;
  RETURN false;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION should_notify_post(recipient UUID, poster UUID)
RETURNS BOOLEAN AS $$
DECLARE
  pref TEXT;
BEGIN
  SELECT notify_posts INTO pref FROM public.profiles WHERE id = recipient;
  IF pref IS NULL OR pref = 'everyone' THEN RETURN true; END IF;
  IF pref = 'none' THEN RETURN false; END IF;
  IF pref = 'followers' THEN
    RETURN EXISTS (SELECT 1 FROM public.follows WHERE follower_id = poster AND following_id = recipient AND status = 'accepted');
  END IF;
  IF pref = 'following' THEN
    RETURN EXISTS (SELECT 1 FROM public.follows WHERE follower_id = recipient AND following_id = poster AND status = 'accepted');
  END IF;
  IF pref = 'selected' THEN
    RETURN EXISTS (SELECT 1 FROM public.privacy_selected_users WHERE owner_id = recipient AND category = 'notify_post' AND selected_user_id = poster);
  END IF;
  RETURN false;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION notify_on_new_message()
RETURNS TRIGGER AS $$
DECLARE
  recipient UUID;
BEGIN
  recipient := get_chat_recipient(NEW.chat_id, NEW.sender_id);
  IF recipient IS NOT NULL AND recipient != NEW.sender_id AND should_notify_message(recipient, NEW.sender_id) THEN
    INSERT INTO public.notifications (user_id, actor_id, type, message)
    VALUES (recipient, NEW.sender_id, 'message', LEFT(NEW.content, 100));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_new_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION notify_on_new_message();

CREATE OR REPLACE FUNCTION notify_followers_of_new_post()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.notifications (user_id, actor_id, type, post_id)
  SELECT follower_id, NEW.user_id, 'new_post', NEW.id
  FROM public.follows
  WHERE following_id = NEW.user_id AND status = 'accepted'
  AND should_notify_post(follower_id, NEW.user_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_followers_new_post
  AFTER INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION notify_followers_of_new_post();

-- ============================================================
-- HELPER FUNCTIONS (for counter increments)
-- ============================================================

CREATE OR REPLACE FUNCTION increment_likes(post_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.posts SET likes_count = likes_count + 1 WHERE id = post_id;
END;
$$;

CREATE OR REPLACE FUNCTION decrement_likes(post_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = post_id;
END;
$$;

CREATE OR REPLACE FUNCTION increment_comments(post_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.posts SET comments_count = comments_count + 1 WHERE id = post_id;
END;
$$;

CREATE OR REPLACE FUNCTION increment_followers(profile_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.profiles SET followers_count = followers_count + 1 WHERE id = profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION decrement_followers(profile_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.profiles SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION increment_following(profile_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.profiles SET following_count = following_count + 1 WHERE id = profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION decrement_following(profile_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.profiles SET following_count = GREATEST(following_count - 1, 0) WHERE id = profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION increment_posts_count(profile_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.profiles SET posts_count = posts_count + 1 WHERE id = profile_id;
END;
$$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, username, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- STORAGE BUCKETS
-- Create these in Supabase Dashboard > Storage:
-- 1. avatars    (public)
-- 2. covers     (public)
-- 3. posts      (public)
-- ============================================================

-- Storage policies (run after creating buckets)
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('covers', 'covers', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('posts', 'posts', true) ON CONFLICT DO NOTHING;

CREATE POLICY "Avatar images are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Users can upload their avatar" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update their avatar" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Cover images are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'covers');
CREATE POLICY "Users can upload their cover" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'covers' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update their cover" ON storage.objects FOR UPDATE USING (bucket_id = 'covers' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Post media is publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'posts');
CREATE POLICY "Users can upload post media" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'posts' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete own post media" ON storage.objects FOR DELETE USING (bucket_id = 'posts' AND auth.uid()::text = (storage.foldername(name))[1]);
