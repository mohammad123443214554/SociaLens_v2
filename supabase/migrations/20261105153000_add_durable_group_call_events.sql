-- Durable group-call event log for hold, resume and leave announcements.
-- Clients consume this stream so brief roster transitions cannot be missed by polling.

create table if not exists public.group_call_events (
  id bigint generated always as identity primary key,
  group_call_id uuid not null references public.group_calls(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('hold','resumed','left')),
  created_at timestamptz not null default now()
);

create index if not exists group_call_events_group_call_id_id_idx
  on public.group_call_events (group_call_id, id);

alter table public.group_call_events enable row level security;
revoke all on public.group_call_events from public, anon;
grant select on public.group_call_events to authenticated;
drop policy if exists "group_call_events_select_related" on public.group_call_events;
create policy "group_call_events_select_related"
on public.group_call_events
for select
to authenticated
using (private.can_view_group_voice_call(group_call_id));

create or replace function public.set_group_voice_call_hold(
  p_group_call_id uuid,
  p_is_on_hold boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  update public.group_call_participants
     set is_on_hold = p_is_on_hold,
         hold_initiated_by = v_user_id,
         updated_at = now()
   where group_call_id = p_group_call_id
     and user_id = v_user_id
     and status = 'joined'
     and is_on_hold is distinct from p_is_on_hold;

  get diagnostics v_updated = row_count;
  if v_updated = 0 and not exists (
    select 1 from public.group_call_participants
     where group_call_id = p_group_call_id
       and user_id = v_user_id
       and status = 'joined'
  ) then
    raise exception 'You are not a joined participant in this group call' using errcode = '42501';
  end if;

  if v_updated > 0 then
    insert into public.group_call_events (group_call_id, actor_user_id, event_type)
    values (p_group_call_id, v_user_id, case when p_is_on_hold then 'hold' else 'resumed' end);
  end if;

  return true;
end;
$$;

revoke all on function public.set_group_voice_call_hold(uuid, boolean) from public, anon;
grant execute on function public.set_group_voice_call_hold(uuid, boolean) to authenticated;

create or replace function public.leave_group_voice_call(p_group_call_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_call public.group_calls%rowtype;
  v_remaining integer;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into v_call
  from public.group_calls
  where id = p_group_call_id
  for update;

  if not found then
    raise exception 'Group call not found' using errcode = 'P0002';
  end if;

  if v_call.status = 'ended' then
    return 'ended';
  end if;

  update public.group_call_participants
  set status = 'left', left_at = now(), updated_at = now()
  where group_call_id = p_group_call_id
    and user_id = v_uid
    and status = 'joined';

  if not found then
    raise exception 'You are not a joined participant' using errcode = '42501';
  end if;

  insert into public.group_call_events (group_call_id, actor_user_id, event_type)
  values (p_group_call_id, v_uid, 'left');

  select count(*) into v_remaining
  from public.group_call_participants
  where group_call_id = p_group_call_id
    and status = 'joined';

  if v_remaining <= 1 then
    update public.group_call_participants
    set status = 'left', left_at = now(), updated_at = now()
    where group_call_id = p_group_call_id
      and status = 'joined';

    update public.group_calls
    set status = 'ended',
        ended_at = now(),
        ended_by = v_uid,
        updated_at = now()
    where id = p_group_call_id
      and status <> 'ended';

    update public.group_call_participants
    set status = 'missed',
        updated_at = now(),
        left_at = coalesce(left_at, now())
    where group_call_id = p_group_call_id
      and status in ('invited', 'ringing');

    return 'ended';
  end if;

  return 'left';
end;
$$;

revoke all on function public.leave_group_voice_call(uuid) from public, anon;
grant execute on function public.leave_group_voice_call(uuid) to authenticated;

alter table public.group_call_events replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'group_call_events'
  ) then
    alter publication supabase_realtime add table public.group_call_events;
  end if;
end
$$;
