-- Secure, private Emoji Slider responses with owner-only aggregate results.
create table if not exists public.story_emoji_sliders (
  id text primary key check (char_length(id) between 1 and 64),
  story_id uuid not null references public.stories(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  question text not null check (char_length(btrim(question)) between 1 and 100),
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  unique (story_id, id)
);
create index if not exists story_emoji_sliders_story_id_idx on public.story_emoji_sliders(story_id);

create table if not exists public.story_emoji_slider_responses (
  id uuid primary key default gen_random_uuid(),
  sticker_id text not null references public.story_emoji_sliders(id) on delete cascade,
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  score integer not null check (score between 0 and 100),
  created_at timestamptz not null default now(),
  unique (sticker_id, user_id)
);
create index if not exists story_emoji_slider_responses_story_idx on public.story_emoji_slider_responses(story_id, sticker_id);

alter table public.story_emoji_sliders enable row level security;
alter table public.story_emoji_slider_responses enable row level security;

create policy "View emoji sliders on accessible active stories" on public.story_emoji_sliders
for select to authenticated using (
  exists (select 1 from public.stories s where s.id = story_id and s.expires_at > now())
);
create policy "Story owners create emoji sliders" on public.story_emoji_sliders
for insert to authenticated with check (
  owner_id = (select auth.uid()) and exists (
    select 1 from public.stories s where s.id = story_id and s.user_id = (select auth.uid()) and s.expires_at > now()
  )
);
create policy "Story owners update emoji sliders" on public.story_emoji_sliders
for update to authenticated using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()) and exists (
  select 1 from public.stories s where s.id = story_id and s.user_id = (select auth.uid()) and s.expires_at > now()
));
create policy "Story owners delete emoji sliders" on public.story_emoji_sliders
for delete to authenticated using (owner_id = (select auth.uid()));

grant select, insert, update, delete on public.story_emoji_sliders to authenticated;
grant select, insert on public.story_emoji_slider_responses to authenticated;

create policy "View own emoji slider response" on public.story_emoji_slider_responses
for select to authenticated using (user_id = (select auth.uid()));
create policy "Respond once to accessible emoji slider" on public.story_emoji_slider_responses
for insert to authenticated with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.story_emoji_sliders e
    join public.stories s on s.id = e.story_id
    where e.id = story_emoji_slider_responses.sticker_id and e.story_id = story_emoji_slider_responses.story_id and s.expires_at > now()
      and s.user_id <> (select auth.uid())
      and not exists (select 1 from public.blocks b where
        (b.blocker_id = (select auth.uid()) and b.blocked_id = s.user_id)
        or (b.blocker_id = s.user_id and b.blocked_id = (select auth.uid()))
      )
  )
);

create or replace function public.get_story_emoji_slider_results(p_sticker_id text)
returns table(response_count bigint, average_score numeric, bucket_0_20 bigint, bucket_21_40 bigint, bucket_41_60 bigint, bucket_61_80 bigint, bucket_81_100 bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.story_emoji_sliders e join public.stories s on s.id = e.story_id
    where e.id = p_sticker_id and e.owner_id = (select auth.uid()) and s.expires_at > now()
  ) then
    raise exception 'Emoji slider results are unavailable';
  end if;
  return query
  select count(*)::bigint, avg(r.score)::numeric,
    count(*) filter (where r.score between 0 and 20)::bigint,
    count(*) filter (where r.score between 21 and 40)::bigint,
    count(*) filter (where r.score between 41 and 60)::bigint,
    count(*) filter (where r.score between 61 and 80)::bigint,
    count(*) filter (where r.score between 81 and 100)::bigint
  from public.story_emoji_slider_responses r where r.sticker_id = p_sticker_id;
end;
$$;
revoke all on function public.get_story_emoji_slider_results(text) from public, anon;
grant execute on function public.get_story_emoji_slider_results(text) to authenticated;
