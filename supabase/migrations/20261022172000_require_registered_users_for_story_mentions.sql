drop policy if exists "Users can view mentions on visible active stories" on public.story_mentions;
create policy "Users can view mentions on visible active stories"
  on public.story_mentions for select to authenticated
  using (
    (auth.jwt() ->> 'is_anonymous') is distinct from 'true'
    and exists (
      select 1 from public.stories s
      where s.id = story_mentions.story_id
        and s.expires_at > now()
    )
  );

drop policy if exists "Story owners can add valid mentions to own active stories" on public.story_mentions;
create policy "Story owners can add valid mentions to own active stories"
  on public.story_mentions for insert to authenticated
  with check (
    (auth.jwt() ->> 'is_anonymous') is distinct from 'true'
    and auth.uid() = creator_id
    and mentioned_user_id <> auth.uid()
    and exists (
      select 1
      from public.stories s
      join public.profiles mentioned_profile on mentioned_profile.id = story_mentions.mentioned_user_id
      where s.id = story_mentions.story_id
        and s.user_id = auth.uid()
        and s.expires_at > now()
        and coalesce(mentioned_profile.is_suspended, false) = false
        and not exists (
          select 1 from public.blocks b
          where (b.blocker_id = auth.uid() and b.blocked_id = story_mentions.mentioned_user_id)
             or (b.blocker_id = story_mentions.mentioned_user_id and b.blocked_id = auth.uid())
        )
    )
  );
