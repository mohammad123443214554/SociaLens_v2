-- Prevent clients from seeding arbitrary vote totals or timestamps through INSERT.
revoke insert on table public.story_polls from authenticated;
grant insert (id, story_id, owner_id, question, options, color) on table public.story_polls to authenticated;
revoke insert on table public.story_poll_votes from authenticated;
grant insert (poll_id, user_id, option_id) on table public.story_poll_votes to authenticated;
