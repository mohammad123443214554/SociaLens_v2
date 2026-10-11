-- Persist per-user wallpaper settings for normal one-to-one chats.
-- The client uses public.chat_wallpapers and the chat-wallpapers Storage bucket.
create table if not exists public.chat_wallpapers (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  wallpaper_url text not null,
  position_x integer not null default 50 check (position_x between 0 and 100),
  position_y integer not null default 50 check (position_y between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_wallpapers_chat_user_key unique (chat_id, user_id)
);

alter table public.chat_wallpapers enable row level security;

drop policy if exists "Users can view their own chat wallpaper" on public.chat_wallpapers;
create policy "Users can view their own chat wallpaper"
  on public.chat_wallpapers for select to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.chats c
      where c.id = chat_id and auth.uid() in (c.participant1_id, c.participant2_id)
    )
  );

drop policy if exists "Users can insert their own chat wallpaper" on public.chat_wallpapers;
create policy "Users can insert their own chat wallpaper"
  on public.chat_wallpapers for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.chats c
      where c.id = chat_id and auth.uid() in (c.participant1_id, c.participant2_id)
    )
  );

drop policy if exists "Users can update their own chat wallpaper" on public.chat_wallpapers;
create policy "Users can update their own chat wallpaper"
  on public.chat_wallpapers for update to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.chats c
      where c.id = chat_id and auth.uid() in (c.participant1_id, c.participant2_id)
    )
  );

drop policy if exists "Users can delete their own chat wallpaper" on public.chat_wallpapers;
create policy "Users can delete their own chat wallpaper"
  on public.chat_wallpapers for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.chat_wallpapers to authenticated;
create index if not exists idx_chat_wallpapers_user_id on public.chat_wallpapers(user_id);
