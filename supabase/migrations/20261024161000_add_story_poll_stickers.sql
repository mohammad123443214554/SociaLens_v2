-- Poll stickers for photo and video stories.
create table if not exists public.story_polls (
  id uuid primary key,
  story_id uuid not null references public.stories(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  question text not null check (char_length(btrim(question)) between 1 and 180),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 4),
  color text not null default '#ec4899' check (color ~ '^#[0-9A-Fa-f]{6}$'),
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
grant select, insert, update, delete on public.story_polls to authenticated;
grant select, insert on public.story_poll_votes to authenticated;

drop policy if exists "Visible story polls can be read" on public.story_polls;
create policy "Visible story polls can be read" on public.story_polls
for select to authenticated using (
  exists (select 1 from public.stories s where s.id = story_id and s.expires_at > now())
);
drop policy if exists "Story owners create polls" on public.story_polls;
create policy "Story owners create polls" on public.story_polls
for insert to authenticated with check (
  owner_id = (select auth.uid()) and exists (
    select 1 from public.stories s where s.id = story_id and s.user_id = (select auth.uid()) and s.expires_at > now()
  )
);
drop policy if exists "Story owners update polls" on public.story_polls;
create policy "Story owners update polls" on public.story_polls
for update to authenticated using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));
drop policy if exists "Story owners delete polls" on public.story_polls;
create policy "Story owners delete polls" on public.story_polls
for delete to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "Voters and owners read poll votes" on public.story_poll_votes;
create policy "Voters and owners read poll votes" on public.story_poll_votes
for select to authenticated using (
  user_id = (select auth.uid()) or exists (
    select 1 from public.story_polls p where p.id = poll_id and p.owner_id = (select auth.uid())
  )
);
drop policy if exists "Authenticated viewers vote once" on public.story_poll_votes;
create policy "Authenticated viewers vote once" on public.story_poll_votes
for insert to authenticated with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.story_polls p
    join public.stories s on s.id = p.story_id
    where p.id = poll_id and s.expires_at > now()
      and (p.options @> jsonb_build_array(jsonb_build_object('id', option_id)))
      and s.user_id <> (select auth.uid())
  )
);

create or replace function public.get_story_poll_results(p_poll_id uuid)
returns table (option_id text, vote_count bigint, total_votes bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with poll as (
    select p.id, p.options
    from public.story_polls p
    join public.stories s on s.id = p.story_id
    where p.id = p_poll_id and s.expires_at > now()
  ), counts as (
    select v.option_id, count(*)::bigint as votes
    from public.story_poll_votes v
    where v.poll_id = p_poll_id
    group by v.option_id
  )
  select option->>'id', coalesce(counts.votes, 0)::bigint,
         (select count(*)::bigint from public.story_poll_votes where poll_id = p_poll_id)
  from poll cross join lateral jsonb_array_elements(poll.options) option
  left join counts on counts.option_id = option->>'id'
$$;
grant execute on function public.get_story_poll_results(uuid) to authenticated;
