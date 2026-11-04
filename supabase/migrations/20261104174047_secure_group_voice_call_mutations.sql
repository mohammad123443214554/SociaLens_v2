-- The narrowly scoped RPCs authenticate the caller and validate membership,
-- invite-list relationship, block state, call status, and capacity before writes.
-- Keep a fixed search_path and remove default PUBLIC/anon execution.
alter function public.create_group_voice_call(uuid[]) security definer;
alter function public.invite_group_voice_call_participants(uuid,uuid[]) security definer;
alter function public.respond_group_voice_call_invitation(uuid,boolean) security definer;
alter function public.leave_group_voice_call(uuid) security definer;

alter function public.create_group_voice_call(uuid[]) set search_path=pg_catalog,public;
alter function public.invite_group_voice_call_participants(uuid,uuid[]) set search_path=pg_catalog,public;
alter function public.respond_group_voice_call_invitation(uuid,boolean) set search_path=pg_catalog,public;
alter function public.leave_group_voice_call(uuid) set search_path=pg_catalog,public;

revoke all on public.group_calls from anon,authenticated;
revoke all on public.group_call_participants from anon,authenticated;
grant select on public.group_calls to authenticated;
grant select on public.group_call_participants to authenticated;

revoke all on function public.create_group_voice_call(uuid[]) from public,anon;
revoke all on function public.invite_group_voice_call_participants(uuid,uuid[]) from public,anon;
revoke all on function public.respond_group_voice_call_invitation(uuid,boolean) from public,anon;
revoke all on function public.leave_group_voice_call(uuid) from public,anon;
grant execute on function public.create_group_voice_call(uuid[]) to authenticated;
grant execute on function public.invite_group_voice_call_participants(uuid,uuid[]) to authenticated;
grant execute on function public.respond_group_voice_call_invitation(uuid,boolean) to authenticated;
grant execute on function public.leave_group_voice_call(uuid) to authenticated;
