-- Let a story recipient remove only their own mention record from their DM.
-- Direct DELETE is intentionally not granted on story_mentions to authenticated users.
create or replace function public.delete_story_mention_for_me(p_story_id uuid, p_creator_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  deleted_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  delete from public.story_mentions
  where story_id = p_story_id
    and creator_id = p_creator_id
    and mentioned_user_id = auth.uid();

  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$function$;

revoke all on function public.delete_story_mention_for_me(uuid, uuid) from public, anon;
grant execute on function public.delete_story_mention_for_me(uuid, uuid) to authenticated;
