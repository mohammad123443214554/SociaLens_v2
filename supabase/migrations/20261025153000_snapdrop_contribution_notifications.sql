-- Create one owner notification for each newly saved SnapDrop contribution.
-- The trigger makes delivery atomic with the contribution insert and idempotent on retries.
alter table public.notifications
  add column if not exists snapdrop_contribution_id uuid
  references public.story_snapdrop_contributions(id) on delete set null;

create unique index if not exists notifications_snapdrop_contribution_unique
  on public.notifications (snapdrop_contribution_id)
  where snapdrop_contribution_id is not null;

create or replace function public.notify_story_owner_of_snapdrop_contribution()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid;
  v_story_id uuid;
  v_username text;
begin
  select d.owner_id, d.story_id
    into v_owner_id, v_story_id
  from public.story_snapdrops d
  join public.stories s on s.id = d.story_id
  where d.id = new.snapdrop_id
    and s.expires_at > now();

  if v_owner_id is null or v_owner_id = new.user_id then
    return new;
  end if;

  -- Match the contribution table's block restrictions even if this trigger is
  -- invoked by a privileged writer rather than the normal authenticated client.
  if exists (
    select 1
    from public.blocks b
    where (b.blocker_id = new.user_id and b.blocked_id = v_owner_id)
       or (b.blocker_id = v_owner_id and b.blocked_id = new.user_id)
  ) then
    return new;
  end if;

  select p.username
    into v_username
  from public.profiles p
  where p.id = new.user_id;

  insert into public.notifications (
    user_id,
    actor_id,
    type,
    story_id,
    message,
    context_text,
    snapdrop_contribution_id
  )
  values (
    v_owner_id,
    new.user_id,
    'photo',
    v_story_id,
    '@' || coalesce(nullif(v_username, ''), 'user') || ' added a photo to your SnapDrop sticker.',
    'SnapDrop photo contribution',
    new.id
  )
  on conflict (snapdrop_contribution_id) where snapdrop_contribution_id is not null
  do nothing;

  return new;
end;
$$;

revoke all on function public.notify_story_owner_of_snapdrop_contribution() from public, anon, authenticated;

drop trigger if exists story_snapdrop_contribution_owner_notification
  on public.story_snapdrop_contributions;

create trigger story_snapdrop_contribution_owner_notification
after insert on public.story_snapdrop_contributions
for each row
execute function public.notify_story_owner_of_snapdrop_contribution();
