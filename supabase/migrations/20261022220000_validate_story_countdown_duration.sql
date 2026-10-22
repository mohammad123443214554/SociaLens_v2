-- Validate new or changed Story Countdown targets without touching Story expiry.
-- Existing stories.expires_at, cleanup jobs, and the 24-hour Story lifetime are unchanged.
create or replace function public.validate_story_countdown_duration()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_kind text;
  v_scene jsonb;
  v_countdown jsonb;
  v_old_scenes jsonb;
  v_old_scene jsonb;
  v_old_countdown jsonb;
  v_target timestamptz;
  v_id text;
  v_target_text text;
  v_now timestamptz := statement_timestamp();
begin
  if tg_op = 'UPDATE' then
    if new.photo_scenes is not distinct from old.photo_scenes
       and new.video_scenes is not distinct from old.video_scenes then
      return new;
    end if;
  end if;

  foreach v_kind in array array['photo_scenes', 'video_scenes'] loop
    if v_kind = 'photo_scenes' then
      if new.photo_scenes is null then continue; end if;
      for v_scene in select value from jsonb_array_elements(to_jsonb(new.photo_scenes)) as t(value) loop
        v_old_scenes := case when tg_op = 'UPDATE' then to_jsonb(old.photo_scenes) else '[]'::jsonb end;
        v_id := null;
        for v_countdown in select value from jsonb_array_elements(coalesce(v_scene->'countdowns','[]'::jsonb)) as c(value) loop
          v_id := v_countdown->>'id';
          v_target_text := v_countdown->>'targetAt';
          v_old_scene := (select value from jsonb_array_elements(coalesce(v_old_scenes,'[]'::jsonb)) as o(value) where value->>'id'=v_scene->>'id' limit 1);
          v_old_countdown := (select value from jsonb_array_elements(coalesce(v_old_scene->'countdowns','[]'::jsonb)) as oc(value) where value->>'id'=v_id limit 1);
          if tg_op = 'UPDATE' and v_old_countdown->>'targetAt' is not distinct from v_target_text then continue; end if;
          begin
            v_target := v_target_text::timestamptz;
          exception when others then
            raise exception 'Invalid countdown target' using errcode = '23514';
          end;
          if v_target <= v_now or v_target > v_now + interval '24 hours' then
            raise exception 'Countdown target must be in the next 24 hours' using errcode = '23514';
          end if;
        end loop;
      end loop;
    else
      if new.video_scenes is null then continue; end if;
      for v_scene in select value from jsonb_array_elements(to_jsonb(new.video_scenes)) as t(value) loop
        v_old_scenes := case when tg_op = 'UPDATE' then to_jsonb(old.video_scenes) else '[]'::jsonb end;
        for v_countdown in select value from jsonb_array_elements(coalesce(v_scene->'countdowns','[]'::jsonb)) as c(value) loop
          v_id := v_countdown->>'id';
          v_target_text := v_countdown->>'targetAt';
          v_old_scene := (select value from jsonb_array_elements(coalesce(v_old_scenes,'[]'::jsonb)) as o(value) where value->>'id'=v_scene->>'id' limit 1);
          v_old_countdown := (select value from jsonb_array_elements(coalesce(v_old_scene->'countdowns','[]'::jsonb)) as oc(value) where value->>'id'=v_id limit 1);
          if tg_op = 'UPDATE' and v_old_countdown->>'targetAt' is not distinct from v_target_text then continue; end if;
          begin
            v_target := v_target_text::timestamptz;
          exception when others then
            raise exception 'Invalid countdown target' using errcode = '23514';
          end;
          if v_target <= v_now or v_target > v_now + interval '24 hours' then
            raise exception 'Countdown target must be in the next 24 hours' using errcode = '23514';
          end if;
        end loop;
      end loop;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists stories_validate_countdown_duration on public.stories;
create trigger stories_validate_countdown_duration
before insert or update of photo_scenes, video_scenes on public.stories
for each row execute function public.validate_story_countdown_duration();
