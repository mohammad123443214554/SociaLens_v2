-- Persist per-conversation Aperonix wallpapers in Supabase.
create table if not exists public.aperonix_chat_wallpapers (
  conversation_id uuid primary key references public.aperonix_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  original_storage_path text not null,
  processed_storage_path text not null,
  filter_index integer not null default 0 check (filter_index >= 0 and filter_index < 120),
  zoom integer not null default 100 check (zoom between 80 and 160),
  position_x integer not null default 50 check (position_x between 0 and 100),
  position_y integer not null default 50 check (position_y between 0 and 100),
  updated_at timestamptz not null default now()
);

alter table public.aperonix_chat_wallpapers enable row level security;
drop policy if exists "Users manage their own Aperonix chat wallpapers" on public.aperonix_chat_wallpapers;
create policy "Users manage their own Aperonix chat wallpapers"
  on public.aperonix_chat_wallpapers
  for all to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.aperonix_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );
grant select, insert, update, delete on public.aperonix_chat_wallpapers to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('aperonix-wallpapers', 'aperonix-wallpapers', false, 15728640, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 15728640, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "Users upload own Aperonix wallpapers" on storage.objects;
create policy "Users upload own Aperonix wallpapers"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'aperonix-wallpapers' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users read own Aperonix wallpapers" on storage.objects;
create policy "Users read own Aperonix wallpapers"
  on storage.objects for select to authenticated
  using (bucket_id = 'aperonix-wallpapers' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users update own Aperonix wallpapers" on storage.objects;
create policy "Users update own Aperonix wallpapers"
  on storage.objects for update to authenticated
  using (bucket_id = 'aperonix-wallpapers' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'aperonix-wallpapers' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users delete own Aperonix wallpapers" on storage.objects;
create policy "Users delete own Aperonix wallpapers"
  on storage.objects for delete to authenticated
  using (bucket_id = 'aperonix-wallpapers' and (storage.foldername(name))[1] = auth.uid()::text);
