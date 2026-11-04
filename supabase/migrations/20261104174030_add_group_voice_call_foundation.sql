-- Additive group voice-call data model. Existing public.calls remains untouched.
create table if not exists public.group_calls (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  type text not null default 'audio' check (type = 'audio'),
  status text not null default 'ringing' check (status in ('ringing','active','ended')),
  provider text check (provider in ('agora','daily')),
  room_name text unique,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz,
  ended_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint group_calls_end_state_check check (
    (status <> 'ended' and ended_at is null) or
    (status = 'ended' and ended_at is not null)
  )
);

create table if not exists public.group_call_participants (
  id uuid primary key default gen_random_uuid(),
  group_call_id uuid not null references public.group_calls(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('invited','ringing','joined','declined','left','missed','removed')),
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  left_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_call_id,user_id),
  constraint group_call_participant_joined_time check (status <> 'joined' or joined_at is not null)
);

create index if not exists group_calls_status_created_idx on public.group_calls(status,created_at desc);
create index if not exists group_call_participants_user_status_idx on public.group_call_participants(user_id,status,invited_at desc);
create index if not exists group_call_participants_call_status_idx on public.group_call_participants(group_call_id,status);

alter table public.group_calls enable row level security;
alter table public.group_call_participants enable row level security;

create or replace function public.create_group_voice_call(p_invited_user_ids uuid[] default '{}'::uuid[])
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_call_id uuid := gen_random_uuid();
  v_invitee uuid;
  v_unique_ids uuid[];
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select coalesce(array_agg(distinct x),'{}'::uuid[]) into v_unique_ids
  from unnest(coalesce(p_invited_user_ids,'{}'::uuid[])) x
  where x is not null and x <> v_uid;
  if cardinality(v_unique_ids)>9 then raise exception 'A group voice call supports at most 10 participants including you' using errcode='22023'; end if;

  insert into public.group_calls(id,created_by,type,status) values(v_call_id,v_uid,'audio','ringing');
  insert into public.group_call_participants(group_call_id,user_id,invited_by,status,joined_at)
  values(v_call_id,v_uid,v_uid,'joined',now());

  foreach v_invitee in array v_unique_ids loop
    if not exists(select 1 from public.chats c where
      (c.participant1_id=v_uid and c.participant2_id=v_invitee) or
      (c.participant2_id=v_uid and c.participant1_id=v_invitee)) then
      raise exception 'You can invite only users in your message list' using errcode='42501';
    end if;
    if exists(select 1 from public.blocks b where
      (b.blocker_id=v_uid and b.blocked_id=v_invitee) or
      (b.blocker_id=v_invitee and b.blocked_id=v_uid)) then
      raise exception 'This user cannot be invited because a block exists' using errcode='42501';
    end if;
    insert into public.group_call_participants(group_call_id,user_id,invited_by,status)
    values(v_call_id,v_invitee,v_uid,'invited');
  end loop;

  if cardinality(v_unique_ids)>0 then
    update public.group_calls set status='active',started_at=now(),updated_at=now() where id=v_call_id;
  end if;
  return v_call_id;
end;
$$;

create or replace function public.invite_group_voice_call_participants(p_group_call_id uuid,p_invited_user_ids uuid[])
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_call public.group_calls%rowtype;
  v_invitee uuid;
  v_unique_ids uuid[];
  v_reserved integer;
  v_added integer := 0;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into v_call from public.group_calls where id=p_group_call_id for update;
  if not found or v_call.status='ended' then raise exception 'Group call is no longer active' using errcode='P0002'; end if;
  if not exists(select 1 from public.group_call_participants where group_call_id=p_group_call_id and user_id=v_uid and status='joined') then
    raise exception 'Only joined participants can invite users' using errcode='42501';
  end if;
  select coalesce(array_agg(distinct x),'{}'::uuid[]) into v_unique_ids
  from unnest(coalesce(p_invited_user_ids,'{}'::uuid[])) x
  where x is not null and x<>v_uid and not exists(
    select 1 from public.group_call_participants p
    where p.group_call_id=p_group_call_id and p.user_id=x and p.status in ('invited','ringing','joined')
  );
  select count(*) into v_reserved from public.group_call_participants
  where group_call_id=p_group_call_id and status in ('invited','ringing','joined');
  if v_reserved+cardinality(v_unique_ids)>10 then
    raise exception 'Group call is full. Maximum is 10 participants including pending invitations.' using errcode='22023';
  end if;
  foreach v_invitee in array v_unique_ids loop
    if not exists(select 1 from public.chats c where
      (c.participant1_id=v_uid and c.participant2_id=v_invitee) or
      (c.participant2_id=v_uid and c.participant1_id=v_invitee)) then
      raise exception 'You can invite only users in your message list' using errcode='42501';
    end if;
    if exists(select 1 from public.blocks b where
      (b.blocker_id=v_uid and b.blocked_id=v_invitee) or
      (b.blocker_id=v_invitee and b.blocked_id=v_uid)) then
      raise exception 'This user cannot be invited because a block exists' using errcode='42501';
    end if;
    insert into public.group_call_participants(group_call_id,user_id,invited_by,status)
    values(p_group_call_id,v_invitee,v_uid,'invited');
    v_added:=v_added+1;
  end loop;
  return v_added;
end;
$$;

create or replace function public.respond_group_voice_call_invitation(p_group_call_id uuid,p_accept boolean)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid:=auth.uid();
  v_call public.group_calls%rowtype;
  v_reserved integer;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into v_call from public.group_calls where id=p_group_call_id for update;
  if not found or v_call.status='ended' then raise exception 'Group call is no longer available' using errcode='P0002'; end if;
  if not exists(select 1 from public.group_call_participants where group_call_id=p_group_call_id and user_id=v_uid and status in ('invited','ringing')) then
    raise exception 'No pending invitation found' using errcode='42501';
  end if;
  if p_accept then
    select count(*) into v_reserved from public.group_call_participants
    where group_call_id=p_group_call_id and status in ('joined','invited','ringing');
    if v_reserved>10 then raise exception 'Group call is full' using errcode='22023'; end if;
    update public.group_call_participants set status='joined',joined_at=now(),updated_at=now(),left_at=null
    where group_call_id=p_group_call_id and user_id=v_uid;
    update public.group_calls set status='active',started_at=coalesce(started_at,now()),updated_at=now() where id=p_group_call_id;
    return 'joined';
  end if;
  update public.group_call_participants set status='declined',updated_at=now(),left_at=now()
  where group_call_id=p_group_call_id and user_id=v_uid;
  return 'declined';
end;
$$;

create or replace function public.leave_group_voice_call(p_group_call_id uuid)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid:=auth.uid();
  v_call public.group_calls%rowtype;
  v_remaining integer;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into v_call from public.group_calls where id=p_group_call_id for update;
  if not found then raise exception 'Group call not found' using errcode='P0002'; end if;
  update public.group_call_participants set status='left',left_at=now(),updated_at=now()
  where group_call_id=p_group_call_id and user_id=v_uid and status='joined';
  if not found then raise exception 'You are not a joined participant' using errcode='42501'; end if;
  select count(*) into v_remaining from public.group_call_participants where group_call_id=p_group_call_id and status='joined';
  if v_remaining=0 then
    update public.group_calls set status='ended',ended_at=now(),ended_by=v_uid,updated_at=now() where id=p_group_call_id and status<>'ended';
    update public.group_call_participants set status='missed',updated_at=now(),left_at=coalesce(left_at,now())
    where group_call_id=p_group_call_id and status in ('invited','ringing');
    return 'ended';
  end if;
  return 'left';
end;
$$;

revoke all on function public.create_group_voice_call(uuid[]) from public,anon;
revoke all on function public.invite_group_voice_call_participants(uuid,uuid[]) from public,anon;
revoke all on function public.respond_group_voice_call_invitation(uuid,boolean) from public,anon;
revoke all on function public.leave_group_voice_call(uuid) from public,anon;
grant execute on function public.create_group_voice_call(uuid[]) to authenticated;
grant execute on function public.invite_group_voice_call_participants(uuid,uuid[]) to authenticated;
grant execute on function public.respond_group_voice_call_invitation(uuid,boolean) to authenticated;
grant execute on function public.leave_group_voice_call(uuid) to authenticated;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='group_calls') then
    alter publication supabase_realtime add table public.group_calls;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='group_call_participants') then
    alter publication supabase_realtime add table public.group_call_participants;
  end if;
end $$;
