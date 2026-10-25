create table if not exists public.story_snapdrops (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  sticker_id text not null,
  prompt text not null check (char_length(btrim(prompt)) between 1 and 140),
  created_at timestamptz not null default now(),
  unique (story_id, sticker_id)
);
create index if not exists story_snapdrops_story_id_idx on public.story_snapdrops(story_id);

create table if not exists public.story_snapdrop_contributions (
  id uuid primary key default gen_random_uuid(),
  snapdrop_id uuid not null references public.story_snapdrops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  message text not null default '' check (char_length(message) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (snapdrop_id, user_id),
  unique (storage_path)
);
create index if not exists story_snapdrop_contributions_prompt_order_idx
  on public.story_snapdrop_contributions(snapdrop_id, created_at desc, id desc);

alter table public.story_snapdrops enable row level security;
alter table public.story_snapdrop_contributions enable row level security;

drop policy if exists "SnapDrop prompts follow Story audience" on public.story_snapdrops;
create policy "SnapDrop prompts follow Story audience" on public.story_snapdrops
for select to authenticated using (
  exists (select 1 from public.stories s where s.id = story_id and s.expires_at > now())
);
drop policy if exists "Story owners create SnapDrop prompts" on public.story_snapdrops;
create policy "Story owners create SnapDrop prompts" on public.story_snapdrops
for insert to authenticated with check (
  owner_id = (select auth.uid()) and exists (
    select 1 from public.stories s where s.id = story_id and s.user_id = (select auth.uid()) and s.expires_at > now()
  )
);
drop policy if exists "Story owners update SnapDrop prompts" on public.story_snapdrops;
create policy "Story owners update SnapDrop prompts" on public.story_snapdrops
for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists "Story owners delete SnapDrop prompts" on public.story_snapdrops;
create policy "Story owners delete SnapDrop prompts" on public.story_snapdrops
for delete to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "Visible SnapDrop contributions can be read" on public.story_snapdrop_contributions;
create policy "Visible SnapDrop contributions can be read" on public.story_snapdrop_contributions
for select to authenticated using (
  exists (
    select 1 from public.story_snapdrops d join public.stories s on s.id = d.story_id
    where d.id = snapdrop_id and s.expires_at > now()
      and not exists (select 1 from public.blocks b where
        (b.blocker_id = (select auth.uid()) and b.blocked_id = user_id)
        or (b.blocker_id = user_id and b.blocked_id = (select auth.uid()))
      )
  )
);
drop policy if exists "Users add their own SnapDrop contribution" on public.story_snapdrop_contributions;
create policy "Users add their own SnapDrop contribution" on public.story_snapdrop_contributions
for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (
    select 1 from public.story_snapdrops d join public.stories s on s.id = d.story_id
    where d.id = snapdrop_id and s.expires_at > now()
      and s.user_id <> (select auth.uid())
      and not exists (select 1 from public.blocks b where
        (b.blocker_id = (select auth.uid()) and b.blocked_id = s.user_id)
        or (b.blocker_id = s.user_id and b.blocked_id = (select auth.uid()))
      )
  )
);
drop policy if exists "Users update their own SnapDrop contribution" on public.story_snapdrop_contributions;
create policy "Users update their own SnapDrop contribution" on public.story_snapdrop_contributions
for update to authenticated using (user_id = (select auth.uid())) with check (
  user_id = (select auth.uid()) and exists (
    select 1 from public.story_snapdrops d join public.stories s on s.id = d.story_id
    where d.id = snapdrop_id and s.expires_at > now()
  )
);
drop policy if exists "Users delete their own SnapDrop contribution" on public.story_snapdrop_contributions;
create policy "Users delete their own SnapDrop contribution" on public.story_snapdrop_contributions
for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.story_snapdrops to authenticated;
grant select, insert, update, delete on public.story_snapdrop_contributions to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('story-snapdrop', 'story-snapdrop', false, 10485760, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;

drop policy if exists "Users upload own SnapDrop images" on storage.objects;
create policy "Users upload own SnapDrop images" on storage.objects for insert to authenticated
with check (bucket_id = 'story-snapdrop' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Users read accessible SnapDrop images" on storage.objects;
create policy "Users read accessible SnapDrop images" on storage.objects for select to authenticated using (
  bucket_id = 'story-snapdrop' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1 from public.story_snapdrop_contributions c
      join public.story_snapdrops d on d.id = c.snapdrop_id
      join public.stories s on s.id = d.story_id
      where c.storage_path = name and s.expires_at > now()
    )
  )
);
drop policy if exists "Users update own SnapDrop images" on storage.objects;
create policy "Users update own SnapDrop images" on storage.objects for update to authenticated
using (bucket_id = 'story-snapdrop' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'story-snapdrop' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Users delete own SnapDrop images" on storage.objects;
create policy "Users delete own SnapDrop images" on storage.objects for delete to authenticated
using (bucket_id = 'story-snapdrop' and (storage.foldername(name))[1] = (select auth.uid())::text);