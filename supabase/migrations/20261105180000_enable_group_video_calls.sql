-- Allow an active 1-to-1 audio or video call to be promoted into a group call.
-- Existing group voice calls retain the same participant limits and behavior.

alter table public.group_calls
  drop constraint if exists group_calls_type_check;

alter table public.group_calls
  add constraint group_calls_type_check
  check (type = any (array['audio'::text, 'video'::text]));

create or replace function public.ensure_active_voice_call_agora_transport(
  p_call_id uuid,
  p_room_name text
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_call public.calls%rowtype;
  v_expected_room text;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into v_call from public.calls where id = p_call_id for update;
  if not found or v_call.status <> 'accepted' then
    raise exception 'Only an active call can be prepared for group conversion' using errcode = '22023';
  end if;
  if v_uid not in (v_call.caller_id, v_call.callee_id) then
    raise exception 'You are not a participant in this call' using errcode = '42501';
  end if;
  if v_call.type not in ('audio', 'video') then
    raise exception 'Only active audio or video calls can be converted to group calls' using errcode = '22023';
  end if;
  v_expected_room := 'socialens-call-' || v_call.id::text;
  if p_room_name is distinct from v_expected_room then
    raise exception 'Invalid call room' using errcode = '22023';
  end if;
  if v_call.provider is not null and v_call.provider <> 'agora' then
    raise exception 'This active call is not using Agora' using errcode = '22023';
  end if;
  if v_call.room_name is not null and v_call.room_name <> v_expected_room then
    raise exception 'The active call is using a different media room' using errcode = '22023';
  end if;

  update public.calls
     set provider = 'agora', room_name = v_expected_room
   where id = p_call_id
     and (provider is null or room_name is null);
  return true;
end;
$$;

revoke all on function public.ensure_active_voice_call_agora_transport(uuid, text) from public, anon;
grant execute on function public.ensure_active_voice_call_agora_transport(uuid, text) to authenticated;

create or replace function public.convert_active_voice_call_to_group(
  p_call_id uuid,
  p_invited_user_ids uuid[]
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_call public.calls%rowtype;
  v_group_id uuid := gen_random_uuid();
  v_invitee uuid;
  v_unique_ids uuid[];
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into v_call
    from public.calls
   where id = p_call_id
   for update;

  if not found or v_call.status <> 'accepted' then
    raise exception 'Only an active one-to-one call can be converted' using errcode = '22023';
  end if;
  if v_uid not in (v_call.caller_id, v_call.callee_id) then
    raise exception 'You are not a participant in this call' using errcode = '42501';
  end if;
  if v_call.type not in ('audio', 'video') then
    raise exception 'Only active audio or video calls can be converted to a group call' using errcode = '22023';
  end if;
  if coalesce(v_call.provider, '') <> 'agora' or coalesce(v_call.room_name, '') = '' then
    raise exception 'This call provider cannot be converted without interrupting the call' using errcode = '22023';
  end if;
  if v_call.group_call_id is not null then
    raise exception 'This call is already a group call' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct x), '{}'::uuid[])
    into v_unique_ids
    from unnest(coalesce(p_invited_user_ids, '{}'::uuid[])) x
   where x is not null
     and x not in (v_call.caller_id, v_call.callee_id);

  if cardinality(v_unique_ids) < 1 or cardinality(v_unique_ids) > 8 then
    raise exception 'Select between 1 and 8 additional participants. The two current callers already count toward the 10-person limit.' using errcode = '22023';
  end if;

  insert into public.group_calls(
    id, created_by, type, status, provider, room_name, source_call_id, started_at
  ) values (
    v_group_id, v_call.caller_id, v_call.type, 'active', 'agora',
    v_call.room_name, v_call.id, coalesce(v_call.started_at, now())
  );

  insert into public.group_call_participants(group_call_id, user_id, invited_by, status, joined_at)
  values
    (v_group_id, v_call.caller_id, v_call.caller_id, 'joined', now()),
    (v_group_id, v_call.callee_id, v_call.caller_id, 'joined', now());

  foreach v_invitee in array v_unique_ids loop
    if not exists (
      select 1 from public.chats c
       where (c.participant1_id = v_uid and c.participant2_id = v_invitee)
          or (c.participant2_id = v_uid and c.participant1_id = v_invitee)
    ) then
      raise exception 'You can invite only users in your message list' using errcode = '42501';
    end if;

    if exists (
      select 1 from public.blocks b
       where (b.blocker_id = v_uid and b.blocked_id = v_invitee)
          or (b.blocker_id = v_invitee and b.blocked_id = v_uid)
    ) or exists (
      select 1 from public.blocks b
       where (b.blocker_id = case when v_uid = v_call.caller_id then v_call.callee_id else v_call.caller_id end
              and b.blocked_id = v_invitee)
          or (b.blocker_id = v_invitee
              and b.blocked_id = case when v_uid = v_call.caller_id then v_call.callee_id else v_call.caller_id end)
    ) then
      raise exception 'This user cannot be invited because a block exists with a current call participant' using errcode = '42501';
    end if;

    insert into public.group_call_participants(group_call_id, user_id, invited_by, status)
    values (v_group_id, v_invitee, v_uid, 'invited');
  end loop;

  update public.calls set group_call_id = v_group_id where id = v_call.id;
  return v_group_id;
end;
$$;

revoke all on function public.convert_active_voice_call_to_group(uuid, uuid[]) from public, anon;
grant execute on function public.convert_active_voice_call_to_group(uuid, uuid[]) to authenticated;
