create or replace function public.notify_story_mention()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if exists (
    select 1 from public.notifications n
    where n.user_id = new.mentioned_user_id
      and n.actor_id = new.creator_id
      and n.story_id = new.story_id
      and n.type = 'story_mention'
  ) then
    return new;
  end if;

  if not exists (
    select 1
    from public.stories s
    join public.profiles owner_profile on owner_profile.id = s.user_id
    join public.profiles recipient on recipient.id = new.mentioned_user_id
    where s.id = new.story_id
      and s.user_id = new.creator_id
      and s.expires_at > now()
      and coalesce(recipient.notifications_muted, false) = false
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = new.creator_id and b.blocked_id = new.mentioned_user_id)
           or (b.blocker_id = new.mentioned_user_id and b.blocked_id = new.creator_id)
      )
      and (
        not coalesce(owner_profile.is_private, false)
        or exists (
          select 1 from public.follows f
          where f.follower_id = new.mentioned_user_id
            and f.following_id = new.creator_id
            and f.status = 'accepted'
        )
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
      and case coalesce(recipient.notify_posts, 'everyone')
        when 'none' then false
        when 'followers' then exists (
          select 1 from public.follows f
          where f.follower_id = new.creator_id and f.following_id = recipient.id and f.status = 'accepted'
        )
        when 'following' then exists (
          select 1 from public.follows f
          where f.follower_id = recipient.id and f.following_id = new.creator_id and f.status = 'accepted'
        )
        when 'selected' then exists (
          select 1 from public.privacy_selected_users ps
          where ps.owner_id = recipient.id and ps.selected_user_id = new.creator_id and ps.category = 'notify_post'
        )
        else true
      end
      and (
        not exists (
          select 1 from public.privacy_selected_users ps
          where ps.owner_id = recipient.id and ps.category = 'notify'
        )
        or exists (
          select 1 from public.privacy_selected_users ps
          where ps.owner_id = recipient.id and ps.selected_user_id = new.creator_id and ps.category = 'notify'
        )
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
