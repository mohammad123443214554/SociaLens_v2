-- Persist group-call hold state so every connected participant can hear
-- the same hold/resume announcements as in one-to-one calls.
alter table public.group_call_participants
  add column if not exists is_on_hold boolean not null default false,
  add column if not exists hold_initiated_by uuid references auth.users(id) on delete set null;

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
     and status = 'joined';

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'You are not a joined participant in this group call' using errcode = '42501';
  end if;

  return true;
end;
$$;

revoke all on function public.set_group_voice_call_hold(uuid, boolean) from public, anon;
grant execute on function public.set_group_voice_call_hold(uuid, boolean) to authenticated;
