-- ============================================================
-- Comments upgrade: replies, likes, emoji reactions, hide, and
-- "delete for me" - for BOTH post comments and story comments.
-- Safe to run multiple times (IF NOT EXISTS / DROP+CREATE POLICY
-- guards throughout) and does not touch or remove any existing data.
-- ============================================================

-- ------------------------------------------------------------
-- POST COMMENTS (public.comments)
-- ------------------------------------------------------------
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.comments(id) ON DELETE CASCADE;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON public.comments(parent_id);

-- Deleting a comment (including a reply) now needs to bring
-- posts.comments_count back down again - increment_comments already
-- existed, this is its missing counterpart.
CREATE OR REPLACE FUNCTION decrement_comments(post_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.posts SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = post_id;
END;
$$;

CREATE TABLE IF NOT EXISTS public.comment_likes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(comment_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_comment_likes_comment_id ON public.comment_likes(comment_id);

CREATE TABLE IF NOT EXISTS public.comment_reactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    emoji TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(comment_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment_id ON public.comment_reactions(comment_id);

-- "Delete for me" - the comment stays for everyone else, it just gets
-- hidden from this one user's own view from now on.
CREATE TABLE IF NOT EXISTS public.comment_deletes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(comment_id, user_id)
);

ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_deletes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Comment likes are viewable by everyone" ON public.comment_likes;
CREATE POLICY "Comment likes are viewable by everyone" ON public.comment_likes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can like comments" ON public.comment_likes;
CREATE POLICY "Users can like comments" ON public.comment_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can unlike comments" ON public.comment_likes;
CREATE POLICY "Users can unlike comments" ON public.comment_likes FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Comment reactions are viewable by everyone" ON public.comment_reactions;
CREATE POLICY "Comment reactions are viewable by everyone" ON public.comment_reactions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can react to comments" ON public.comment_reactions;
CREATE POLICY "Users can react to comments" ON public.comment_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can change own comment reaction" ON public.comment_reactions;
CREATE POLICY "Users can change own comment reaction" ON public.comment_reactions FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can remove own comment reaction" ON public.comment_reactions;
CREATE POLICY "Users can remove own comment reaction" ON public.comment_reactions FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own comment deletes" ON public.comment_deletes;
CREATE POLICY "Users can view own comment deletes" ON public.comment_deletes FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete-for-me a comment" ON public.comment_deletes;
CREATE POLICY "Users can delete-for-me a comment" ON public.comment_deletes FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can undo delete-for-me" ON public.comment_deletes;
CREATE POLICY "Users can undo delete-for-me" ON public.comment_deletes FOR DELETE USING (auth.uid() = user_id);

-- ------------------------------------------------------------
-- STORY COMMENTS (public.story_comments)
-- Created defensively with IF NOT EXISTS in case this table only
-- ever existed live in the dashboard - existing rows/columns are
-- left untouched either way.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.story_comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    story_id UUID REFERENCES public.stories(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.story_comments ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.story_comments(id) ON DELETE CASCADE;
ALTER TABLE public.story_comments ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_story_comments_parent_id ON public.story_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_story_comments_story_id ON public.story_comments(story_id);

ALTER TABLE public.story_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Story comments are viewable by everyone" ON public.story_comments;
CREATE POLICY "Story comments are viewable by everyone" ON public.story_comments FOR SELECT USING (true);
DROP POLICY IF EXISTS "Authenticated users can comment on stories" ON public.story_comments;
CREATE POLICY "Authenticated users can comment on stories" ON public.story_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own story comments" ON public.story_comments;
CREATE POLICY "Users can update own story comments" ON public.story_comments FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own story comments" ON public.story_comments;
CREATE POLICY "Users can delete own story comments" ON public.story_comments FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.story_comment_likes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    comment_id UUID REFERENCES public.story_comments(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(comment_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_story_comment_likes_comment_id ON public.story_comment_likes(comment_id);

CREATE TABLE IF NOT EXISTS public.story_comment_reactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    comment_id UUID REFERENCES public.story_comments(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    emoji TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(comment_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_story_comment_reactions_comment_id ON public.story_comment_reactions(comment_id);

CREATE TABLE IF NOT EXISTS public.story_comment_deletes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    comment_id UUID REFERENCES public.story_comments(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(comment_id, user_id)
);

ALTER TABLE public.story_comment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_comment_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_comment_deletes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Story comment likes are viewable by everyone" ON public.story_comment_likes;
CREATE POLICY "Story comment likes are viewable by everyone" ON public.story_comment_likes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can like story comments" ON public.story_comment_likes;
CREATE POLICY "Users can like story comments" ON public.story_comment_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can unlike story comments" ON public.story_comment_likes;
CREATE POLICY "Users can unlike story comments" ON public.story_comment_likes FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Story comment reactions are viewable by everyone" ON public.story_comment_reactions;
CREATE POLICY "Story comment reactions are viewable by everyone" ON public.story_comment_reactions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can react to story comments" ON public.story_comment_reactions;
CREATE POLICY "Users can react to story comments" ON public.story_comment_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can change own story comment reaction" ON public.story_comment_reactions;
CREATE POLICY "Users can change own story comment reaction" ON public.story_comment_reactions FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can remove own story comment reaction" ON public.story_comment_reactions;
CREATE POLICY "Users can remove own story comment reaction" ON public.story_comment_reactions FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own story comment deletes" ON public.story_comment_deletes;
CREATE POLICY "Users can view own story comment deletes" ON public.story_comment_deletes FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete-for-me a story comment" ON public.story_comment_deletes;
CREATE POLICY "Users can delete-for-me a story comment" ON public.story_comment_deletes FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can undo story delete-for-me" ON public.story_comment_deletes;
CREATE POLICY "Users can undo story delete-for-me" ON public.story_comment_deletes FOR DELETE USING (auth.uid() = user_id);
