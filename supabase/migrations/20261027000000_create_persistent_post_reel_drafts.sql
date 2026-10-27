-- Persistent owner-only drafts for the dedicated Post/Reel Create Editor.
create table if not exists public.create_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content_type text not null check (content_type in ('post','reel')),
  title text not null default '',
  caption text not null default '',
  hashtags text not null default '',
  media_type text not null default 'none' check (media_type in ('image','video','none')),
  media_path text,
  media_name text,
  media_size bigint,
  status text not null default 'draft' check (status in ('draft','publishing')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists create_drafts_user_updated_idx on public.create_drafts (user_id, updated_at desc);
alter table public.create_drafts enable row level security;
drop policy if exists "Users can read own create drafts" on public.create_drafts;
create policy "Users can read own create drafts" on public.create_drafts for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users can create own create drafts" on public.create_drafts;
create policy "Users can create own create drafts" on public.create_drafts for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update own create drafts" on public.create_drafts;
create policy "Users can update own create drafts" on public.create_drafts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete own create drafts" on public.create_drafts;
create policy "Users can delete own create drafts" on public.create_drafts for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.create_drafts to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('create-drafts', 'create-drafts', false, 104857600, array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users manage own create draft media" on storage.objects;
create policy "Users manage own create draft media" on storage.objects
for all to authenticated
using (bucket_id = 'create-drafts' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'create-drafts' and (storage.foldername(name))[1] = (select auth.uid())::text);
