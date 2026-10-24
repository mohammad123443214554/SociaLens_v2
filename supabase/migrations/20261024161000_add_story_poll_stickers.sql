-- Persistent, authenticated poll stickers for photo/video stories.
create table if not exists public.story_polls (
  id uuid primary key,
  story_id uuid not null references public.stories(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  question text not null check (char_length(btrim(question)) between 1 and 180),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 4),
  color text not null default '#ec4899' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  vote_counts jsonb not null default '{}'::jsonb check (jsonb_typeof(vote_counts) = 'object'),
  created_at timestamptz not null default now(),
  unique (story_id, id)
);
create table if not exists public.story_poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.story_polls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  option_id text not null check (char_length(option_id) between 1 and 64),
  created_at timestamptz not null default now(),
  unique (poll_id, user_id)
);
create index if not exists story_polls_story_id_idx on public.story_polls(story_id);
create index if not exists story_poll_votes_poll_id_idx on public.story_poll_votes(poll_id);
alter table public.story_polls enable row level security;
alter table public.story_poll_votes enable row level security;
grant select, insert, delete on public.story_polls to authenticated;
grant update (question, options, color) on public.story_polls to authenticated;
grant select, insert on public.story_poll_votes to authenticated;

create policy "Visible story polls can be read" on public.story_polls
for select to authenticated using (
  exists (select 1 from public.stories s where s.id = story_id and s.expires_at > now())
);
create policy "Story owners create polls" on public.story_polls
for insert to authenticated with check (
  owner_id = (select auth.uid()) and exists (
    select 1 from public.stories s where s.id = story_id and s.user_id = (select auth.uid()) and s.expires_at > now()
  )
);
create policy "Story owners update polls" on public.story_polls
for update to authenticated using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));
create policy "Story owners delete polls" on public.story_polls
for delete to authenticated using (owner_id = (select auth.uid()));
create policy "Voters and owners read poll votes" on public.story_poll_votes
for select to authenticated using (
  user_id = (select auth.uid()) or exists (
    select 1 from public.story_polls p where p.id = poll_id and p.owner_id = (select auth.uid())
  )
);
create policy "Authenticated viewers vote once" on public.story_poll_votes
for insert to authenticated with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.story_polls p
    join public.stories s on s.id = p.story_id
    where p.id = poll_id and s.expires_at > now()
      and p.owner_id <> (select auth.uid())
      and p.options @> jsonb_build_array(jsonb_build_object('id', option_id))
  )
);

create or replace function public.validate_story_poll_vote()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare v_options jsonb;
begin
  select p.options into v_options from public.story_polls p
  join public.stories s on s.id = p.story_id
  where p.id = new.poll_id and s.expires_at > now();
  if v_options is null or not (v_options @> jsonb_build_array(jsonb_build_object('id', new.option_id))) then
    raise exception 'Invalid or expired poll option';
  end if;
  return new;
end;
$$;
create trigger story_poll_vote_validate
before insert on public.story_poll_votes
for each row execute function public.validate_story_poll_vote();

create or replace function public.increment_story_poll_vote_count()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.story_polls
  set vote_counts = jsonb_set(
    vote_counts,
    array[new.option_id],
    to_jsonb(coalesce((vote_counts->>new.option_id)::integer, 0) + 1),
    true
  )
  where id = new.poll_id;
  return new;
end;
$$;
revoke all on function public.increment_story_poll_vote_count() from public, anon, authenticated;
create trigger story_poll_vote_count
after insert on public.story_poll_votes
for each row execute function public.increment_story_poll_vote_count();

create or replace function public.prevent_story_poll_option_changes_after_votes()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if new.options is distinct from old.options and exists (
    select 1 from public.story_poll_votes v where v.poll_id = old.id
  ) then
    raise exception 'Poll options cannot be changed after voting begins';
  end if;
  if new.vote_counts is distinct from old.vote_counts and pg_trigger_depth() = 0 then
    raise exception 'Vote totals are managed by the database';
  end if;
  return new;
end;
$$;
create trigger story_poll_options_immutable_after_votes
before update on public.story_polls
for each row execute function public.prevent_story_poll_option_changes_after_votes();
