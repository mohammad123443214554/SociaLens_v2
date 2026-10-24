-- Allow authenticated voters to change their existing poll vote.
-- Upsert requires UPDATE table privileges and an UPDATE RLS policy; without
-- these, Supabase returns "permission denied for table story_poll_votes".

-- PostgREST upsert updates option_id, poll_id, and user_id in its conflict clause.
-- Table-level UPDATE privilege is required; the RLS policy restricts which row and
-- values the authenticated voter may update.
grant update on public.story_poll_votes to authenticated;

drop policy if exists "Voters can change their own poll vote" on public.story_poll_votes;
create policy "Voters can change their own poll vote"
on public.story_poll_votes
for update
to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.story_polls p
    join public.stories s on s.id = p.story_id
    where p.id = story_poll_votes.poll_id
      and s.expires_at > now()
      and p.options @> jsonb_build_array(jsonb_build_object('id', story_poll_votes.option_id))
  )
);
