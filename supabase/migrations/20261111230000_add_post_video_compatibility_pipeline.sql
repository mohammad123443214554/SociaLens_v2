-- V2-only Android-compatible public post video rendition queue.
-- Additive only: creates one internal queue table and one claim RPC.
-- The backfill is restricted to verified V2 public post objects owned by each post author.

create table if not exists public.video_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null default 'posts' check (bucket = 'posts'),
  original_path text not null,
  playback_path text,
  status text not null default 'queued' check (status in ('queued', 'processing', 'ready', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 8),
  available_at timestamptz not null default now(),
  locked_until timestamptz,
  lease_token uuid,
  last_error text,
  source_bytes bigint check (source_bytes is null or source_bytes between 1 and 104857600),
  output_bytes bigint check (output_bytes is null or output_bytes > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint video_processing_jobs_source_unique unique (bucket, original_path),
  constraint video_processing_jobs_ready_path_check check (status <> 'ready' or playback_path is not null)
);

create index if not exists video_processing_jobs_claim_idx
  on public.video_processing_jobs (status, available_at, created_at)
  where status in ('queued', 'processing');

create index if not exists video_processing_jobs_owner_idx
  on public.video_processing_jobs (owner_id, created_at desc);

-- Queue only existing V2 posts-bucket video objects whose path is owned by
-- the author and whose Storage object still exists. Private drafts and all
-- other buckets are deliberately excluded.
insert into public.video_processing_jobs (owner_id, bucket, original_path, status)
select
  p.user_id,
  'posts',
  regexp_replace(
    p.media_url,
    '^https://zkqktomtynxrqcwpwmwu\\.supabase\\.co/storage/v1/object/public/posts/',
    ''
  ),
  'queued'
from public.posts as p
where p.media_type = 'video'
  and p.media_url like 'https://zkqktomtynxrqcwpwmwu.supabase.co/storage/v1/object/public/posts/%'
  and regexp_replace(
    p.media_url,
    '^https://zkqktomtynxrqcwpwmwu\\.supabase\\.co/storage/v1/object/public/posts/',
    ''
  ) ~ ('^' || p.user_id::text || '/[^/]+\\.(mp4|m4v|mov|webm|mkv|3gp|avi|mpg|mpeg|ts)$')
  and exists (
    select 1
    from storage.objects as objects
    where objects.bucket_id = 'posts'
      and objects.name = regexp_replace(
        p.media_url,
        '^https://zkqktomtynxrqcwpwmwu\\.supabase\\.co/storage/v1/object/public/posts/',
        ''
      )
  )
on conflict (bucket, original_path) do nothing;

alter table public.video_processing_jobs enable row level security;
revoke all on public.video_processing_jobs from public, anon, authenticated;
grant select, insert, update, delete on public.video_processing_jobs to service_role;

create or replace function public.claim_video_processing_jobs(p_limit integer default 2)
returns setof public.video_processing_jobs
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.video_processing_jobs
  set status = 'failed',
      locked_until = null,
      lease_token = null,
      updated_at = pg_catalog.now(),
      last_error = coalesce(last_error, 'Worker lease expired after maximum attempts')
  where status = 'processing'
    and locked_until < pg_catalog.now()
    and attempts >= max_attempts;

  return query
  with candidates as (
    select jobs.id
    from public.video_processing_jobs as jobs
    where jobs.attempts < jobs.max_attempts
      and jobs.available_at <= pg_catalog.now()
      and (jobs.status = 'queued' or (jobs.status = 'processing' and jobs.locked_until < pg_catalog.now()))
    order by jobs.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 2), 10))
  )
  update public.video_processing_jobs as jobs
  set status = 'processing',
      attempts = jobs.attempts + 1,
      locked_until = pg_catalog.now() + interval '20 minutes',
      lease_token = pg_catalog.gen_random_uuid(),
      updated_at = pg_catalog.now(),
      last_error = null
  from candidates
  where jobs.id = candidates.id
  returning jobs.*;
end;
$$;

revoke all on function public.claim_video_processing_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_video_processing_jobs(integer) to service_role;

comment on table public.video_processing_jobs is
  'Internal queue for validated Android-oriented playback renditions of public post videos. Original uploads are retained unchanged.';
