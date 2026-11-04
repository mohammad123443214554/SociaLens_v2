-- Repair active Agora call metadata using the authenticated caller's session.
-- This avoids relying on the optional service-role key in the request path.
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
  if v_call.type <> 'audio' then
    raise exception 'Only voice calls can be converted to group calls' using errcode = '22023';
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
  update public.calls set provider = 'agora', room_name = v_expected_room
  where id = p_call_id and (provider is null or room_name is null);
  return true;
end;
$$;
revoke all on function public.ensure_active_voice_call_agora_transport(uuid,text) from public, anon;
grant execute on function public.ensure_active_voice_call_agora_transport(uuid,text) to authenticated;
