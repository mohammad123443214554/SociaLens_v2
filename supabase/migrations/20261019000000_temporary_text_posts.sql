-- Temporary text posts expire permanently from the database at their selected deadline.
alter table public.posts
  add column if not exists expires_at timestamptz;

create index if not exists posts_expiring_text_posts_idx
  on public.posts (expires_at)
  where media_type = 'none' and expires_at is not null;

create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.purge_expired_text_posts()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  expired_ids uuid[];
begin
  select array_agg(id)
    into expired_ids
  from public.posts
  where media_type = 'none'
    and expires_at is not null
    and expires_at <= now();

  if coalesce(array_length(expired_ids, 1), 0) = 0 then
    return;
  end if;

  -- Remove dependent rows first so expiration is permanent even for posts
  -- that have comments, likes, shares, reports, or recommendation metadata.
  delete from public.reports
   where post_id = any(expired_ids)
      or comment_id in (select id from public.comments where post_id = any(expired_ids));

  delete from public.comment_likes
   where comment_id in (select id from public.comments where post_id = any(expired_ids));
  delete from public.comment_reactions
   where comment_id in (select id from public.comments where post_id = any(expired_ids));
  delete from public.comment_deletes
   where comment_id in (select id from public.comments where post_id = any(expired_ids));
  delete from public.notifications
   where post_id = any(expired_ids)
      or comment_id in (select id from public.comments where post_id = any(expired_ids));
  delete from public.comments where post_id = any(expired_ids);
  delete from public.likes where post_id = any(expired_ids);
  delete from public.messages where post_id = any(expired_ids);
  delete from public.post_content_analysis_labels where post_id = any(expired_ids);
  delete from public.post_not_interested where post_id = any(expired_ids);
  delete from public.reposts where post_id = any(expired_ids);
  delete from public.saved_posts where post_id = any(expired_ids);
  delete from public.shares where post_id = any(expired_ids);
  delete from public.post_content_analysis where post_id = any(expired_ids);
  delete from public.posts where id = any(expired_ids);
end;
$function$;

revoke all on function public.purge_expired_text_posts() from public, anon, authenticated;
grant execute on function public.purge_expired_text_posts() to service_role;

do $schedule$
begin
  if exists (select 1 from cron.job where jobname = 'socia-lens-expire-text-posts') then
    perform cron.unschedule(jobid)
      from cron.job
      where jobname = 'socia-lens-expire-text-posts';
  end if;

  perform cron.schedule(
    'socia-lens-expire-text-posts',
    '* * * * *',
    'select public.purge_expired_text_posts();'
  );
end;
$schedule$;
