-- ===========================================================
-- SociaLens - Public share links (Aperonix replies)
-- Safe to run more than once.
--
-- Posts and Reels already have their own public share links for free -
-- they're just /share/post/<id>, and the existing "Posts respect author
-- privacy" RLS policy on public.posts already makes sure an anonymous
-- visitor only ever sees a post whose author is public and whose post
-- privacy is set to "everyone". Nothing to add there.
--
-- Aperonix replies aren't stored anywhere though (each chat is
-- generated fresh), so sharing one outside SociaLens needs a small
-- table to actually hold the text behind a public link.
-- ===========================================================

CREATE TABLE IF NOT EXISTS public.shared_aperonix_replies (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shared_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.shared_aperonix_replies ENABLE ROW LEVEL SECURITY;

-- Anyone (including a logged-out visitor who opened the link) can read
-- one of these by id - that's the whole point of a public share link.
DROP POLICY IF EXISTS "Shared Aperonix replies are publicly viewable" ON public.shared_aperonix_replies;
CREATE POLICY "Shared Aperonix replies are publicly viewable" ON public.shared_aperonix_replies FOR SELECT USING (true);

-- Only a signed-in user can create one, and only attributed to themselves.
DROP POLICY IF EXISTS "Users can create their own share link" ON public.shared_aperonix_replies;
CREATE POLICY "Users can create their own share link" ON public.shared_aperonix_replies FOR INSERT WITH CHECK (auth.uid() = shared_by);
