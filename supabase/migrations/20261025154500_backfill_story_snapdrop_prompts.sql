-- Backfill database prompt records for existing, unexpired Stories that already
-- contain SnapDrop stickers in their saved scene JSON. This makes the viewer's
-- photo-contribution action work even for Stories published before prompt rows
-- were registered by the Story creation hook.
insert into public.story_snapdrops (story_id, owner_id, sticker_id, prompt)
select s.id, s.user_id, sticker->>'id', sticker->>'prompt'
from public.stories s
cross join lateral (
  select snapdrop as sticker
  from jsonb_array_elements(coalesce(s.photo_scenes::jsonb, '[]'::jsonb)) scene
  cross join lateral jsonb_array_elements(coalesce(scene->'snapdrops', '[]'::jsonb)) snapdrop
  where s.story_type = 'photo'
  union all
  select snapdrop as sticker
  from jsonb_array_elements(coalesce(s.video_scenes::jsonb, '[]'::jsonb)) scene
  cross join lateral jsonb_array_elements(coalesce(scene->'snapdrops', '[]'::jsonb)) snapdrop
  where s.story_type = 'video'
) x
where s.expires_at > now()
  and nullif(btrim(sticker->>'id'), '') is not null
  and nullif(btrim(sticker->>'prompt'), '') is not null
on conflict (story_id, sticker_id) do update
set prompt = excluded.prompt
where public.story_snapdrops.prompt is distinct from excluded.prompt;
