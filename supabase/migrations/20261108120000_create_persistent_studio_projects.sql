create table if not exists public.studio_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_type text not null check (project_type in ('photo','video')),
  name text not null default 'Untitled project',
  template_id text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_opened_at timestamptz not null default now()
);
create index if not exists studio_projects_user_updated_idx on public.studio_projects (user_id, updated_at desc);
alter table public.studio_projects enable row level security;
drop policy if exists "Users can read own Studio projects" on public.studio_projects;
create policy "Users can read own Studio projects" on public.studio_projects for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users can create own Studio projects" on public.studio_projects;
create policy "Users can create own Studio projects" on public.studio_projects for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update own Studio projects" on public.studio_projects;
create policy "Users can update own Studio projects" on public.studio_projects for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete own Studio projects" on public.studio_projects;
create policy "Users can delete own Studio projects" on public.studio_projects for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.studio_projects to authenticated;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('studio-projects','studio-projects',false,262144000,array['image/jpeg','image/png','image/webp','image/avif','image/gif','video/mp4','video/webm','video/quicktime','video/x-matroska','audio/mpeg','audio/mp4','audio/wav','audio/x-wav','audio/aac','audio/ogg','audio/webm'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "Users manage own Studio project assets" on storage.objects;
create policy "Users manage own Studio project assets" on storage.objects for all to authenticated
using (bucket_id='studio-projects' and (storage.foldername(name))[1]=(select auth.uid())::text)
with check (bucket_id='studio-projects' and (storage.foldername(name))[1]=(select auth.uid())::text);