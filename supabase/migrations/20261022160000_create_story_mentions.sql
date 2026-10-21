-- Story mention records are tied to a published Story and its overlay.
-- All records are constrained to the authenticated story owner and visible, active Stories.
create table if not exists public.story_mentions (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  mentioned_user_id uuid not null references public.profiles(id) on delete cascade,
  overlay_id text not null,
  username_at_mention text not null,
  x real not null default 50 check (x >= 0 and x <= 100),
  y real not null default 50 check (y >= 0 and y <= 100),
  scale real not null default 1 check (scale >= 0.5 and scale <= 3),
  created_at timestamptz not null default now(),
  constraint story_mentions_one_per_user unique (story_id, mentioned_user_id),
  constraint story_mentions_not_self check (creator_id <> mentioned_user_id)
);

create index if not exists story_mentions_story_id_idx on public.story_mentions(story_id);
create index if not exists story_mentions_user_created_idx on public.story_mentions(mentioned_user_id, created_at desc);

alter table public.story_mentions enable row level security;
grant select, insert on public.story_mentions to authenticated;

drop policy if exists "Users can view mentions on visible active stories" on public.story_mentions;
create policy "Users can view mentions on visible active stories"
  on public.story_mentions for select to authenticated
  using (
    exists (
      select 1 from public.stories s
      where s.id = story_mentions.story_id
        and s.expires_at > now()
    )
  );

drop policy if exists "Story owners can add valid mentions to own active stories" on public.story_mentions;
create policy "Story owners can add valid mentions to own active stories"
  on public.story_mentions for insert to authenticated
  with check (
    auth.uid() = creator_id
    and mentioned_user_id <> auth.uid()
    and exists (
      select 1
      from public.stories s
      join public.profiles owner_profile on owner_profile.id = s.user_id
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
        and (
          not coalesce(owner_profile.is_private, false)
          or exists (
            select 1 from public.follows f
            where f.follower_id = story_mentions.mentioned_user_id
              and f.following_id = auth.uid()
              and f.status = 'accepted'
          )
        )
        and (
          coalesce(s.visibility, 'everyone') = 'everyone'
          or (
            s.visibility = 'followers'
            and exists (
              select 1 from public.follows f
              where f.follower_id = story_mentions.mentioned_user_id
                and f.following_id = auth.uid()
                and f.status = 'accepted'
            )
          )
          or (
            s.visibility = 'following'
            and exists (
              select 1 from public.follows f
              where f.follower_id = auth.uid()
                and f.following_id = story_mentions.mentioned_user_id
                and f.status = 'accepted'
            )
          )
          or (
            s.visibility = 'selected'
            and story_mentions.mentioned_user_id = any(coalesce(s.visibility_selected_ids, '{}'::uuid[]))
          )
        )
      )
  );

-- Expand the existing text-based notification type constraint without removing
-- any previously supported notification types.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type = any (array[
    'like','comment','follow','unfollow','message','new_post','blocked','unblocked',
    'share_post','photo','video','voice_message','call','story_reply','message_reply',
    'repost','comment_like','comment_react','comment_reply','story_like','story_react',
    'story_comment','story_comment_like','story_comment_react','story_comment_reply',
    'verified','story_mention'
  ]::text[])
);

create or replace function public.notify_story_mention()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.notifications n
    where n.user_id = new.mentioned_user_id
      and n.actor_id = new.creator_id
      and n.story_id = new.story_id
      and n.type = 'story_mention'
  ) and exists (
    select 1
    from public.stories s
    join public.profiles recipient on recipient.id = new.mentioned_user_id
    where s.id = new.story_id
      and s.user_id = new.creator_id
      and s.expires_at > now()
      and coalesce(recipient.notifications_muted, false) = false
      and coalesce(recipient.notify_posts, 'everyone') <> 'none'
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = new.creator_id and b.blocked_id = new.mentioned_user_id)
           or (b.blocker_id = new.mentioned_user_id and b.blocked_id = new.creator_id)
      )
      and (
        coalesce(s.visibility, 'everyone') = 'everyone'
        or (
          s.visibility = 'followers'
          and exists (select 1 from public.follows f where f.follower_id = new.mentioned_user_id and f.following_id = new.creator_id and f.status = 'accepted')
        )
        or (
          s.visibility = 'following'
          and exists (select 1 from public.follows f where f.follower_id = new.creator_id and f.following_id = new.mentioned_user_id and f.status = 'accepted')
        )
        or (s.visibility = 'selected' and new.mentioned_user_id = any(coalesce(s.visibility_selected_ids, '{}'::uuid[])))
      )
  ) then
    return new;
  end if;

  insert into public.notifications (user_id, actor_id, type, message, is_read, story_id, context_text)
  values (
    new.mentioned_user_id,
    new.creator_id,
    'story_mention',
    'mentioned you in their story',
    false,
    new.story_id,
    '@' || new.username_at_mention
  );
  return new;
end;
$$;

drop trigger if exists story_mention_notification_after_insert on public.story_mentions;
create trigger story_mention_notification_after_insert
  after insert on public.story_mentions
  for each row execute function public.notify_story_mention();
