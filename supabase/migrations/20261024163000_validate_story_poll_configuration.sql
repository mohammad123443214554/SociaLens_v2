-- Validate poll payloads on the database boundary, not only in the browser.
create or replace function public.validate_story_poll_configuration()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare
  v_option jsonb;
  v_label text;
  v_id text;
  v_seen_ids text[] := '{}';
  v_seen_labels text[] := '{}';
begin
  if new.question is null or char_length(btrim(new.question)) < 1 or char_length(btrim(new.question)) > 180 then
    raise exception 'Poll question must be between 1 and 180 characters';
  end if;
  if jsonb_typeof(new.options) <> 'array' or jsonb_array_length(new.options) < 2 or jsonb_array_length(new.options) > 4 then
    raise exception 'Poll must contain between 2 and 4 answer options';
  end if;
  if octet_length(new.options::text) > 5000 then
    raise exception 'Poll options payload is too large';
  end if;
  for v_option in select value from jsonb_array_elements(new.options)
  loop
    if jsonb_typeof(v_option) <> 'object' then raise exception 'Invalid poll option'; end if;
    v_id := btrim(coalesce(v_option->>'id',''));
    v_label := btrim(coalesce(v_option->>'label',''));
    if char_length(v_id) < 1 or char_length(v_id) > 64 then raise exception 'Invalid poll option identifier'; end if;
    if char_length(v_label) < 1 or char_length(v_label) > 80 then raise exception 'Poll options must be between 1 and 80 characters'; end if;
    if v_id = any(v_seen_ids) then raise exception 'Poll option identifiers must be unique'; end if;
    if lower(v_label) = any(v_seen_labels) then raise exception 'Poll answer options must be unique'; end if;
    v_seen_ids := array_append(v_seen_ids, v_id);
    v_seen_labels := array_append(v_seen_labels, lower(v_label));
  end loop;
  if new.color !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Invalid poll color'; end if;
  return new;
end;
$$;
create trigger story_poll_configuration_validate
before insert on public.story_polls
for each row execute function public.validate_story_poll_configuration();
