-- Part 2: normalized Supabase data structure for recommendation content understanding.
-- Keep the Part 1 analysis snapshot for fast reads; this migration adds a normalized
-- taxonomy catalog and per-post label junction table for scalable ranking/filtering.

create table if not exists public.recommendation_content_taxonomy (
  label_type text not null check (label_type in ('topic', 'language', 'region', 'format')),
  label_slug text not null check (label_slug = lower(label_slug) and length(label_slug) between 1 and 64),
  display_name text not null check (length(display_name) between 1 and 100),
  parent_slug text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (label_type, label_slug),
  constraint recommendation_content_taxonomy_parent_fkey
    foreign key (label_type, parent_slug)
    references public.recommendation_content_taxonomy (label_type, label_slug)
    on delete set null
);

create index if not exists recommendation_content_taxonomy_active_idx
  on public.recommendation_content_taxonomy (label_type, is_active, display_name);

create table if not exists public.post_content_analysis_labels (
  post_id uuid not null references public.posts(id) on delete cascade,
  label_type text not null,
  label_slug text not null,
  relevance numeric(4,3) not null default 0.5 check (relevance >= 0 and relevance <= 1),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (post_id, label_type, label_slug),
  constraint post_content_analysis_labels_taxonomy_fkey
    foreign key (label_type, label_slug)
    references public.recommendation_content_taxonomy (label_type, label_slug)
    on delete cascade
);

create index if not exists post_content_analysis_labels_lookup_idx
  on public.post_content_analysis_labels (label_type, label_slug, post_id);
create index if not exists post_content_analysis_labels_post_type_idx
  on public.post_content_analysis_labels (post_id, label_type);

-- Seed the shared starter vocabulary. The service may safely add new normalized labels
-- returned by the model, so this catalog is extensible rather than a closed enum.
insert into public.recommendation_content_taxonomy (label_type, label_slug, display_name)
values
  ('topic','comedy','Comedy'), ('topic','memes','Memes'),
  ('topic','relationships','Relationships'), ('topic','lifestyle','Lifestyle'),
  ('topic','gaming','Gaming'), ('topic','sports','Sports'), ('topic','cricket','Cricket'),
  ('topic','education','Education'), ('topic','technology','Technology'),
  ('topic','business','Business'), ('topic','news','News'),
  ('topic','entertainment','Entertainment'), ('topic','music','Music'),
  ('topic','dance','Dance'), ('topic','fashion','Fashion'), ('topic','beauty','Beauty'),
  ('topic','fitness','Fitness'), ('topic','food','Food'), ('topic','travel','Travel'),
  ('topic','pets','Pets'), ('topic','art','Art'), ('topic','politics','Politics'),
  ('topic','religion','Religion'), ('topic','health','Health'), ('topic','other','Other'),
  ('language','und','Unknown'), ('language','hi','Hindi'),
  ('language','hi-latn','Hindi / Hinglish'), ('language','en','English'),
  ('language','bn','Bengali'), ('language','ta','Tamil'), ('language','te','Telugu'),
  ('language','mr','Marathi'), ('language','gu','Gujarati'), ('language','pa','Punjabi'),
  ('language','ur','Urdu'), ('language','kn','Kannada'), ('language','ml','Malayalam'),
  ('language','es','Spanish'), ('language','pt','Portuguese'), ('language','fr','French'),
  ('language','ar','Arabic'), ('language','zh','Chinese'), ('language','ja','Japanese'),
  ('region','india','India'), ('region','south-asia','South Asia'),
  ('region','north-america','North America'), ('region','latin-america','Latin America'),
  ('region','middle-east','Middle East'), ('region','east-asia','East Asia'),
  ('region','europe','Europe'), ('region','global','Global'),
  ('format','funny-skit','Funny skit'), ('format','relatable-meme','Relatable meme'),
  ('format','reaction','Reaction'), ('format','tutorial','Tutorial'), ('format','vlog','Vlog'),
  ('format','dance','Dance'), ('format','music-performance','Music performance'),
  ('format','gameplay','Gameplay'), ('format','interview','Interview'),
  ('format','news-clip','News clip'), ('format','promotional','Promotional'),
  ('format','educational','Educational'), ('format','cinematic','Cinematic'),
  ('format','other','Other')
on conflict (label_type, label_slug) do update
set display_name = excluded.display_name, is_active = true, updated_at = now();

alter table public.recommendation_content_taxonomy enable row level security;
alter table public.post_content_analysis_labels enable row level security;
revoke all on table public.recommendation_content_taxonomy from anon, authenticated;
revoke all on table public.post_content_analysis_labels from anon, authenticated;
grant all on table public.recommendation_content_taxonomy to service_role;
grant all on table public.post_content_analysis_labels to service_role;

comment on table public.recommendation_content_taxonomy is
  'Normalized vocabulary for AI-generated recommendation labels (topic, language, region, format).';
comment on table public.post_content_analysis_labels is
  'Normalized labels assigned to each post/reel by the trusted server-side content analysis pipeline.';
