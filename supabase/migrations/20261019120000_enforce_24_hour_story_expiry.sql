-- Enforce 24-hour story visibility and schedule permanent row cleanup.
alter table public.stories
  alter column expires_at set default (now() + interval '24 hours');

update public.stories
set expires_at = created_at + interval '24 hours'
where expires_at is null or expires_at > created_at + interval '24 hours';

drop policy if exists "Stories respect owner audience choice" on public.stories;
create policy "Stories respect owner audience choice"
on public.stories for select
using (
  expires_at > now()
  and (
    auth.uid() = user_id
    or (
      not exists (
        select 1 from public.story_hidden_viewers
        where story_hidden_viewers.owner_id = stories.user_id
          and story_hidden_viewers.hidden_user_id = auth.uid()
      )
      and (
        not exists (
          select 1 from public.profiles
          where profiles.id = stories.user_id and profiles.is_private = true
        )
        or exists (
          select 1 from public.follows
          where follows.follower_id = auth.uid()
            and follows.following_id = stories.user_id
            and follows.status = 'accepted'
        )
      )
      and (
        coalesce(visibility, 'everyone') = 'everyone'
        or (visibility = 'followers' and exists (
          select 1 from public.follows
          where follows.follower_id = auth.uid()
            and follows.following_id = stories.user_id
            and follows.status = 'accepted'
        ))
        or (visibility = 'following' and exists (
          select 1 from public.follows
          where follows.follower_id = stories.user_id
            and follows.following_id = auth.uid()
            and follows.status = 'accepted'
        ))
        or (visibility = 'selected' and auth.uid() = any(visibility_selected_ids))
      )
    )
  )
);

select cron.unschedule(jobid) from cron.job where jobname = 'delete-expired-stories';
select cron.schedule('delete-expired-stories', '* * * * *', $$select public.delete_expired_stories();$$);
select public.delete_expired_stories();
