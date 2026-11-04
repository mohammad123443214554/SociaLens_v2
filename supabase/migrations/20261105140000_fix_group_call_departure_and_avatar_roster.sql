-- Keep the group-call leave RPC atomic and authorized to update the parent call
-- and the remaining participant rows. Direct client writes stay revoked.
alter function public.leave_group_voice_call(uuid) security definer;
alter function public.leave_group_voice_call(uuid) set search_path = '';

revoke all on function public.leave_group_voice_call(uuid) from public, anon;
grant execute on function public.leave_group_voice_call(uuid) to authenticated;

-- A participant who has just left (including the final remaining participant
-- auto-ended by the RPC) must still be able to observe the terminal call state.
-- Keep active membership checks separate for invitation/mutation authorization.
create or replace function private.can_view_group_voice_call(p_group_call_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_call_participants as participant
    where participant.group_call_id = p_group_call_id
      and participant.user_id = auth.uid()
      and participant.status in ('invited', 'ringing', 'joined', 'left')
  );
$$;

revoke all on function private.can_view_group_voice_call(uuid) from public, anon;
grant execute on function private.can_view_group_voice_call(uuid) to authenticated;

drop policy if exists "group_calls_select_member" on public.group_calls;
create policy "group_calls_select_member"
on public.group_calls
for select
to authenticated
using (private.can_view_group_voice_call(id));

drop policy if exists "group_call_participants_select_related" on public.group_call_participants;
create policy "group_call_participants_select_related"
on public.group_call_participants
for select
to authenticated
using (
  user_id = auth.uid()
  or private.can_view_group_voice_call(group_call_id)
);

comment on function public.leave_group_voice_call(uuid)
is 'Leaves a group call atomically; automatically ends it and removes the final remaining participant when only one joined user would remain.';

comment on function private.can_view_group_voice_call(uuid)
is 'Allows only users who were invited or joined/left a group call to read its roster and terminal status.';
