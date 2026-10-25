-- Keep the SECURITY DEFINER audience helper outside PostgREST's exposed public schema.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.can_view_story_for_emoji_slider(p_story_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := auth.uid();
  v_owner uuid;
  v_expires_at timestamptz;
  v_visibility text;
  v_selected_ids uuid[];
  v_is_private boolean;
  v_story_privacy text;
begin
  if v_viewer is null then return false; end if;

  select s.user_id, s.expires_at, coalesce(s.visibility, 'everyone'),
         s.visibility_selected_ids, coalesce(p.is_private, false),
         coalesce(p.story_privacy, 'everyone')
    into v_owner, v_expires_at, v_visibility, v_selected_ids, v_is_private, v_story_privacy
  from public.stories s
  join public.profiles p on p.id = s.user_id
  where s.id = p_story_id;

  if v_owner is null or v_expires_at <= now() then return false; end if;
  if v_owner = v_viewer then return true; end if;

  if exists (
    select 1 from public.story_hidden_viewers h
    where h.owner_id = v_owner and h.hidden_user_id = v_viewer
  ) then return false; end if;

  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = v_viewer and b.blocked_id = v_owner)
       or (b.blocker_id = v_owner and b.blocked_id = v_viewer)
  ) then return false; end if;

  if v_is_private and not exists (
    select 1 from public.follows f
    where f.follower_id = v_viewer and f.following_id = v_owner and f.status = 'accepted'
  ) then return false; end if;

  if not (
    v_visibility = 'everyone'
    or (v_visibility = 'followers' and exists (
      select 1 from public.follows f where f.follower_id = v_viewer and f.following_id = v_owner and f.status = 'accepted'
    ))
    or (v_visibility = 'following' and exists (
      select 1 from public.follows f where f.follower_id = v_owner and f.following_id = v_viewer and f.status = 'accepted'
    ))
    or (v_visibility = 'selected' and v_viewer = any(coalesce(v_selected_ids, array[]::uuid[])))
  ) then return false; end if;

  if not (
    v_story_privacy = 'everyone'
    or (v_story_privacy = 'followers' and exists (
      select 1 from public.follows f where f.follower_id = v_viewer and f.following_id = v_owner and f.status = 'accepted'
    ))
    or (v_story_privacy = 'following' and exists (
      select 1 from public.follows f where f.follower_id = v_owner and f.following_id = v_viewer and f.status = 'accepted'
    ))
    or (v_story_privacy = 'selected' and exists (
      select 1 from public.privacy_selected_users ps
      where ps.owner_id = v_owner and ps.selected_user_id = v_viewer and ps.category = 'story'
    ))
  ) then return false; end if;

  return true;
end;
$$;

revoke all on function private.can_view_story_for_emoji_slider(uuid) from public, anon;
grant execute on function private.can_view_story_for_emoji_slider(uuid) to authenticated;

drop policy if exists "View emoji sliders on accessible active stories" on public.story_emoji_sliders;
create policy "View emoji sliders on accessible active stories" on public.story_emoji_sliders
for select to authenticated using (private.can_view_story_for_emoji_slider(story_id));

drop policy if exists "Respond once to accessible emoji slider" on public.story_emoji_slider_responses;
create policy "Respond once to accessible emoji slider" on public.story_emoji_slider_responses
for insert to authenticated with check (
  user_id = (select auth.uid())
  and private.can_view_story_for_emoji_slider(story_id)
  and exists (
    select 1 from public.story_emoji_sliders e
    where e.id = story_emoji_slider_responses.sticker_id
      and e.story_id = story_emoji_slider_responses.story_id
      and e.owner_id <> (select auth.uid())
  )
);

drop function if exists public.can_view_story_for_emoji_slider(uuid);
