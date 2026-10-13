create table if not exists public.aperonix_voice_wallpapers (
  conversation_id uuid primary key references public.aperonix_voice_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  original_storage_path text not null,
  processed_storage_path text not null,
  filter_index integer not null default 0 check (filter_index >= 0 and filter_index < 120),
  zoom integer not null default 100 check (zoom between 80 and 160),
  position_x integer not null default 50 check (position_x between 0 and 100),
  position_y integer not null default 50 check (position_y between 0 and 100),
  updated_at timestamptz not null default now()
);

create index if not exists aperonix_voice_wallpapers_user_idx
  on public.aperonix_voice_wallpapers (user_id);

alter table public.aperonix_voice_wallpapers enable row level security;

drop policy if exists "Users can read their own voice wallpapers" on public.aperonix_voice_wallpapers;
create policy "Users can read their own voice wallpapers"
  on public.aperonix_voice_wallpapers for select
  to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can create their own voice wallpapers" on public.aperonix_voice_wallpapers;
create policy "Users can create their own voice wallpapers"
  on public.aperonix_voice_wallpapers for insert
  to authenticated with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.aperonix_voice_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update their own voice wallpapers" on public.aperonix_voice_wallpapers;
create policy "Users can update their own voice wallpapers"
  on public.aperonix_voice_wallpapers for update
  to authenticated using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.aperonix_voice_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete their own voice wallpapers" on public.aperonix_voice_wallpapers;
create policy "Users can delete their own voice wallpapers"
  on public.aperonix_voice_wallpapers for delete
  to authenticated using (auth.uid() = user_id);

grant select, insert, update, delete on public.aperonix_voice_wallpapers to authenticated;
