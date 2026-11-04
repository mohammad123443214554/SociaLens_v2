create schema if not exists private;
revoke all on schema private from public,anon;
grant usage on schema private to authenticated;

create or replace function private.is_group_voice_call_member(p_group_call_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from public.group_call_participants p
    where p.group_call_id=p_group_call_id and p.user_id=auth.uid()
      and p.status in ('invited','ringing','joined'));
$$;
revoke all on function private.is_group_voice_call_member(uuid) from public,anon;
grant execute on function private.is_group_voice_call_member(uuid) to authenticated;

create policy "group_calls_select_member" on public.group_calls for select to authenticated
using(private.is_group_voice_call_member(id));
create policy "group_calls_insert_creator" on public.group_calls for insert to authenticated
with check(created_by=auth.uid());
create policy "group_calls_update_member" on public.group_calls for update to authenticated
using(private.is_group_voice_call_member(id)) with check(private.is_group_voice_call_member(id));

create policy "group_call_participants_select_related" on public.group_call_participants for select to authenticated
using(user_id=auth.uid() or private.is_group_voice_call_member(group_call_id));
create policy "group_call_participants_insert_invited" on public.group_call_participants for insert to authenticated
with check(invited_by=auth.uid() and (
  (user_id=auth.uid() and exists(select 1 from public.group_calls gc where gc.id=group_call_id and gc.created_by=auth.uid()))
  or private.is_group_voice_call_member(group_call_id)
));
create policy "group_call_participants_update_self" on public.group_call_participants for update to authenticated
using(user_id=auth.uid()) with check(user_id=auth.uid());
