-- Ensure Supabase's authenticated role can use the voice conversation table.
-- Row-level security policies still restrict every operation to auth.uid() = user_id.
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.aperonix_voice_conversations to authenticated;
notify pgrst, 'reload schema';
