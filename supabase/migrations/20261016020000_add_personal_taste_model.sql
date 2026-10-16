-- Part 3: durable, per-user personal taste model.
-- The client never supplies user_id, creator_id, or content labels: the
-- SECURITY DEFINER RPC derives them from auth.uid() and trusted post labels.

create table if not exists public.user_content_affinity (
  user_id uuid not null references public.profiles(id) on delete cascade,
  label_type text not null check (label_type in ('topic', 'language', 'region', 'format')),
  label_slug text not null,
  score numeric not null default 0,
  positive_signals integer not null default 0 check (positive_signals >= 0),
  negative_signals integer not null default 0 check (negative_signals >= 0),
  last_signal_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, label_type, label_slug),
  constraint user_content_affinity_taxonomy_fkey
    foreign key (label_type, label_slug)
    references public.recommendation_content_taxonomy (label_type, label_slug)
    on delete cascade
);

create index if not exists user_content_affinity_rank_idx
  on public.user_content_affinity (user_id, score desc, last_signal_at desc);
create index if not exists user_content_affinity_label_idx
  on public.user_content_affinity (label_type, label_slug, score desc);

alter table public.user_content_affinity enable row level security;
drop policy if exists "Users can read their own content taste" on public.user_content_affinity;
create policy "Users can read their own content taste"
  on public.user_content_affinity for select to authenticated
  using (auth.uid() = user_id);
revoke all on table public.user_content_affinity from anon, authenticated;
grant select on table public.user_content_affinity to authenticated;
grant all on table public.user_content_affinity to service_role;

comment on table public.user_content_affinity is
  'Durable personalized content taste, updated from authenticated behavioral signals and server-generated post labels.';

create or replace function public.record_personal_taste_signal(
  p_post_id uuid,
  p_event_type text,
  p_watch_seconds numeric default null,
  p_video_duration numeric default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_creator_id uuid;
  v_media_type text;
  v_target_type text;
  v_weight numeric;
  v_updated integer := 0;
  v_label record;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_event_type not in ('view', 'watch_time', 'completion', 'rewatch', 'like', 'comment', 'save', 'share', 'skip', 'not_interested', 'report') then
    raise exception 'Unsupported taste signal' using errcode = '22023';
  end if;

  select user_id, media_type
    into v_creator_id, v_media_type
    from public.posts
   where id = p_post_id;

  if not found then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;

  v_target_type := case when v_media_type = 'video' then 'reel' else 'post' end;

  -- Keep the existing engagement/creator/hashtag aggregates in sync. This
  -- function is called only after validating auth.uid() above.
  perform public.record_content_event(
    v_user_id,
    v_target_type,
    p_post_id,
    v_creator_id,
    p_event_type,
    greatest(coalesce(p_watch_seconds, 0), 0),
    greatest(coalesce(p_video_duration, 0), 0)
  );

  v_weight := case p_event_type
    when 'view' then 0.05
    when 'watch_time' then least(greatest(coalesce(p_watch_seconds, 0), 0) / greatest(coalesce(p_video_duration, 1), 1), 1) * 0.8
    when 'completion' then 1.2
    when 'rewatch' then 1.5
    when 'like' then 1.0
    when 'comment' then 1.4
    when 'save' then 1.8
    when 'share' then 2.0
    when 'skip' then -0.35
    when 'not_interested' then -3.0
    when 'report' then -4.0
    else 0
  end;

  if v_weight <> 0 then
    for v_label in
      select label_type, label_slug, relevance
        from public.post_content_analysis_labels
       where post_id = p_post_id
    loop
      insert into public.user_content_affinity (
        user_id, label_type, label_slug, score, positive_signals,
        negative_signals, last_signal_at, updated_at
      )
      values (
        v_user_id, v_label.label_type, v_label.label_slug,
        v_weight * coalesce(v_label.relevance, 0.5),
        case when v_weight > 0 then 1 else 0 end,
        case when v_weight < 0 then 1 else 0 end,
        now(), now()
      )
      on conflict (user_id, label_type, label_slug) do update
        set score = greatest(-30, least(30,
              public.user_content_affinity.score
              * power(0.5, greatest(extract(epoch from (now() - public.user_content_affinity.last_signal_at)) / 86400, 0) / 45)
              + excluded.score)),
            positive_signals = public.user_content_affinity.positive_signals + excluded.positive_signals,
            negative_signals = public.user_content_affinity.negative_signals + excluded.negative_signals,
            last_signal_at = now(),
            updated_at = now();
      v_updated := v_updated + 1;
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'labels_updated', v_updated);
end;
$$;

revoke all on function public.record_personal_taste_signal(uuid, text, numeric, numeric) from public, anon;
grant execute on function public.record_personal_taste_signal(uuid, text, numeric, numeric) to authenticated, service_role;
