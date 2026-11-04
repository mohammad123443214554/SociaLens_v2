-- End the group voice call when a departure leaves only one joined participant.
-- The RPC locks the parent call row so simultaneous departures are serialized.
create or replace function public.leave_group_voice_call(p_group_call_id uuid)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_call public.group_calls%rowtype;
  v_remaining integer;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into v_call from public.group_calls where id=p_group_call_id for update;
  if not found then raise exception 'Group call not found' using errcode='P0002'; end if;
  if v_call.status='ended' then return 'ended'; end if;

  update public.group_call_participants
  set status='left',left_at=now(),updated_at=now()
  where group_call_id=p_group_call_id and user_id=v_uid and status='joined';
  if not found then raise exception 'You are not a joined participant' using errcode='42501'; end if;

  select count(*) into v_remaining from public.group_call_participants
  where group_call_id=p_group_call_id and status='joined';

  if v_remaining<=1 then
    update public.group_call_participants
    set status='left',left_at=now(),updated_at=now()
    where group_call_id=p_group_call_id and status='joined';
    update public.group_calls
    set status='ended',ended_at=now(),ended_by=v_uid,updated_at=now()
    where id=p_group_call_id and status<>'ended';
    update public.group_call_participants
    set status='missed',updated_at=now(),left_at=coalesce(left_at,now())
    where group_call_id=p_group_call_id and status in ('invited','ringing');
    return 'ended';
  end if;
  return 'left';
end;
$$;