-- Part 1: AI-powered content understanding for recommendation ranking.
-- The table is intentionally private: only the server-side service_role can read/write it.
create table if not exists public.post_content_analysis (
  post_id uuid primary key references public.posts(id) on delete cascade,
  primary_topic text not null,
  topic_labels text[] not null default '{}'::text[],
  language_code text not null default 'und',
  language_name text not null default 'Unknown',
  cultural_regions text[] not null default '{}'::text[],
  format_labels text[] not null default '{}'::text[],
  content_summary text not null default '',
  confidence numeric(4,3) not null default 0 check (confidence >= 0 and confidence <= 1),
  media_analyzed boolean not null default false,
  model text not null,
  analysis_version integer not null default 1,
  source_fingerprint text not null,
  analyzed_at timestamptz not null default now()
);

create index if not exists post_content_analysis_primary_topic_idx
  on public.post_content_analysis (primary_topic);
create index if not exists post_content_analysis_language_code_idx
  on public.post_content_analysis (language_code);
create index if not exists post_content_analysis_topic_labels_gin_idx
  on public.post_content_analysis using gin (topic_labels);
create index if not exists post_content_analysis_cultural_regions_gin_idx
  on public.post_content_analysis using gin (cultural_regions);
create index if not exists post_content_analysis_format_labels_gin_idx
  on public.post_content_analysis using gin (format_labels);

alter table public.post_content_analysis enable row level security;
revoke all on table public.post_content_analysis from anon, authenticated;
grant all on table public.post_content_analysis to service_role;

comment on table public.post_content_analysis is
  'Private server-generated AI labels for recommendation content understanding. Never accept labels directly from clients.';
