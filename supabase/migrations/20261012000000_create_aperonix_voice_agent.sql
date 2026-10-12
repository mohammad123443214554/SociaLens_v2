create table if not exists public.aperonix_voice_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New voice conversation',
  storage_path text,
  mime_type text not null default 'audio/webm',
  duration_ms integer not null default 0 check (duration_ms >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists aperonix_voice_conversations_user_updated_idx
  on public.aperonix_voice_conversations (user_id, updated_at desc);

alter table public.aperonix_voice_conversations enable row level security;

drop policy if exists "Users can read their own voice conversations" on public.aperonix_voice_conversations;
create policy "Users can read their own voice conversations"
  on public.aperonix_voice_conversations for select
  to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can create their own voice conversations" on public.aperonix_voice_conversations;
create policy "Users can create their own voice conversations"
  on public.aperonix_voice_conversations for insert
  to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users can update their own voice conversations" on public.aperonix_voice_conversations;
create policy "Users can update their own voice conversations"
  on public.aperonix_voice_conversations for update
  to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own voice conversations" on public.aperonix_voice_conversations;
create policy "Users can delete their own voice conversations"
  on public.aperonix_voice_conversations for delete
  to authenticated using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('aperonix-voice-recordings', 'aperonix-voice-recordings', false, 52428800, array['audio/webm','audio/webm;codecs=opus','audio/mp4','audio/ogg'])
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists "Users can read own Aperonix voice recordings" on storage.objects;
create policy "Users can read own Aperonix voice recordings"
  on storage.objects for select to authenticated
  using (bucket_id = 'aperonix-voice-recordings' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can upload own Aperonix voice recordings" on storage.objects;
create policy "Users can upload own Aperonix voice recordings"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'aperonix-voice-recordings' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can update own Aperonix voice recordings" on storage.objects;
create policy "Users can update own Aperonix voice recordings"
  on storage.objects for update to authenticated
  using (bucket_id = 'aperonix-voice-recordings' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'aperonix-voice-recordings' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete own Aperonix voice recordings" on storage.objects;
create policy "Users can delete own Aperonix voice recordings"
  on storage.objects for delete to authenticated
  using (bucket_id = 'aperonix-voice-recordings' and (storage.foldername(name))[1] = auth.uid()::text);
