create or replace function public.increment_story_poll_vote_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE' then
    if old.option_id is distinct from new.option_id then
      update public.story_polls
      set vote_counts = jsonb_set(
        vote_counts,
        array[old.option_id],
        to_jsonb(greatest(coalesce((vote_counts->>old.option_id)::integer, 0) - 1, 0)),
        true
      )
      where id = old.poll_id;

      update public.story_polls
      set vote_counts = jsonb_set(
        vote_counts,
        array[new.option_id],
        to_jsonb(coalesce((vote_counts->>new.option_id)::integer, 0) + 1),
        true
      )
      where id = new.poll_id;
    end if;
    return new;
  end if;

  update public.story_polls
  set vote_counts = jsonb_set(
    vote_counts,
    array[new.option_id],
    to_jsonb(coalesce((vote_counts->>new.option_id)::integer, 0) + 1),
    true
  )
  where id = new.poll_id;

  return new;
end;
$function$;

drop trigger if exists story_poll_vote_count on public.story_poll_votes;

create trigger story_poll_vote_count
after insert or update of option_id on public.story_poll_votes
for each row execute function public.increment_story_poll_vote_count();
