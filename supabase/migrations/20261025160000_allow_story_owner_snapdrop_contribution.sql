-- Let the Story author contribute to their own SnapDrop too. The UI exposes
-- the same Add your photo action to every signed-in viewer, and the unique
-- (snapdrop_id, user_id) constraint still limits each account to one contribution.
drop policy if exists "Users add their own SnapDrop contribution" on public.story_snapdrop_contributions;
create policy "Users add their own SnapDrop contribution" on public.story_snapdrop_contributions
for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (
    select 1 from public.story_snapdrops d
    join public.stories s on s.id = d.story_id
    where d.id = snapdrop_id and s.expires_at > now()
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = (select auth.uid()) and b.blocked_id = s.user_id)
           or (b.blocker_id = s.user_id and b.blocked_id = (select auth.uid()))
      )
  )
);
