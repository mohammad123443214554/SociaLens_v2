-- Poll configuration is embedded in an already-published Story once persisted.
-- Structural changes after publication would make existing story overlays and votes disagree.
revoke update (question, options) on table public.story_polls from authenticated;

create or replace function public.prevent_story_poll_option_changes_after_votes()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if new.question is distinct from old.question or new.options is distinct from old.options then
    raise exception 'Poll question and options cannot be edited after story publication';
  end if;
  if new.vote_counts is distinct from old.vote_counts and pg_trigger_depth() = 0 then
    raise exception 'Vote totals are managed by the database';
  end if;
  return new;
end;
$$;
