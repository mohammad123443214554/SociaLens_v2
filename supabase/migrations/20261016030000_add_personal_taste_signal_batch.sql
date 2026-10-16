-- Part 3 follow-up: batch personal taste signals without double-counting
-- post/reel events in the legacy aggregates. The authenticated UID is always
-- derived inside the security-definer function, never from client JSON.

create or replace function public.record_personal_taste_events_batch(p_events jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  ev jsonb;
  v_count integer := 0;
  v_post_id uuid;
  v_event_type text;
  v_target_type text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_events) <> 'array' then
    raise exception 'Events must be an array' using errcode = '22023';
  end if;

  for ev in select value from jsonb_array_elements(p_events) limit 100
  loop
    v_event_type := ev->>'event_type';
    v_target_type := ev->>'target_type';

    if v_event_type not in ('view', 'watch_time', 'completion', 'rewatch', 'like', 'comment', 'save', 'share', 'skip', 'not_interested', 'report') then
      continue;
    end if;

    if v_target_type not in ('post', 'reel') then
      continue;
    end if;

    begin
      v_post_id := (ev->>'target_id')::uuid;
    exception when others then
      continue;
    end;

    perform public.record_personal_taste_signal(
      v_post_id,
      v_event_type,
      case when jsonb_typeof(ev->'watch_seconds') = 'number' then greatest((ev->>'watch_seconds')::numeric, 0) else null end,
      case when jsonb_typeof(ev->'video_duration') = 'number' then greatest((ev->>'video_duration')::numeric, 0) else null end
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.record_personal_taste_events_batch(jsonb) from public, anon;
grant execute on function public.record_personal_taste_events_batch(jsonb) to authenticated, service_role;
