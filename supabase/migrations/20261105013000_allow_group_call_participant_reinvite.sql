-- Allow a participant who previously declined, missed, left, or was removed
-- to be invited again to the same still-active group call.
-- Keep the unique (group_call_id, user_id) constraint: reactivate the existing
-- participant row instead of creating a duplicate row.

create or replace function public.invite_group_voice_call_participants(
  p_group_call_id uuid,
  p_invited_user_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_uid uuid := auth.uid();
  v_call public.group_calls%rowtype;
  v_invitee uuid;
  v_unique_ids uuid[];
  v_reserved integer;
  v_added integer := 0;
  v_updated integer;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into v_call
  from public.group_calls
  where id = p_group_call_id
  for update;

  if not found or v_call.status = 'ended' then
    raise exception 'Group call is no longer active' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.group_call_participants
    where group_call_id = p_group_call_id
      and user_id = v_uid
      and status = 'joined'
  ) then
    raise exception 'Only joined participants can invite users' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct x), '{}'::uuid[])
  into v_unique_ids
  from unnest(coalesce(p_invited_user_ids, '{}'::uuid[])) x
  where x is not null
    and x <> v_uid
    and not exists (
      select 1
      from public.group_call_participants p
      where p.group_call_id = p_group_call_id
        and p.user_id = x
        and p.status in ('invited', 'ringing', 'joined')
    );

  select count(*) into v_reserved
  from public.group_call_participants
  where group_call_id = p_group_call_id
    and status in ('invited', 'ringing', 'joined');

  if v_reserved + cardinality(v_unique_ids) > 10 then
    raise exception 'Group call is full. Maximum is 10 participants including pending invitations.' using errcode = '22023';
  end if;

  foreach v_invitee in array v_unique_ids loop
    if not exists (
      select 1
      from public.chats c
      where (c.participant1_id = v_uid and c.participant2_id = v_invitee)
         or (c.participant2_id = v_uid and c.participant1_id = v_invitee)
    ) then
      raise exception 'You can invite only users in your message list' using errcode = '42501';
    end if;

    if exists (
      select 1
      from public.blocks b
      where (b.blocker_id = v_uid and b.blocked_id = v_invitee)
         or (b.blocker_id = v_invitee and b.blocked_id = v_uid)
    ) then
      raise exception 'This user cannot be invited because a block exists' using errcode = '42501';
    end if;

    -- Reuse the unique participant row after a terminal invitation outcome.
    update public.group_call_participants
    set invited_by = v_uid,
        status = 'invited',
        invited_at = now(),
        joined_at = null,
        left_at = null,
        updated_at = now()
    where group_call_id = p_group_call_id
      and user_id = v_invitee
      and status in ('declined', 'missed', 'left', 'removed');

    get diagnostics v_updated = row_count;

    if v_updated = 0 then
      insert into public.group_call_participants (
        group_call_id, user_id, invited_by, status
      )
      values (
        p_group_call_id, v_invitee, v_uid, 'invited'
      );
    end if;

    v_added := v_added + 1;
  end loop;

  return v_added;
end;
$function$;

comment on function public.invite_group_voice_call_participants(uuid, uuid[])
is 'Invites users to an active group voice call and reactivates their existing participant row after declined, missed, left, or removed outcomes.';
