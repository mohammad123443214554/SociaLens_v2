-- ============================================================
-- SociaLens - Block List: "hide" support
-- Lets someone hide an entry from their own Block List screen
-- without unblocking that person - the block itself (in the
-- existing `blocks` table) is untouched either way.
-- Safe to run more than once.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.hidden_block_entries (
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    hidden_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, hidden_user_id)
);

ALTER TABLE public.hidden_block_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own hidden block entries" ON public.hidden_block_entries;
CREATE POLICY "Users manage their own hidden block entries" ON public.hidden_block_entries
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
