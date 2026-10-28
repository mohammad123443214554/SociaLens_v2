-- Persist selected video cover frames for posts/reels and private drafts.
alter table public.posts add column if not exists cover_url text;
alter table public.create_drafts add column if not exists cover_time double precision not null default 0;
alter table public.create_drafts add column if not exists cover_path text;

comment on column public.posts.cover_url is 'Optional public image URL selected by the author as the video/reel cover.';
comment on column public.create_drafts.cover_time is 'Selected video cover timestamp in seconds while editing a draft.';
comment on column public.create_drafts.cover_path is 'Optional owner-only uploaded cover image path in the create-drafts storage bucket.';
