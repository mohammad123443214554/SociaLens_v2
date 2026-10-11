-- Allow users to move their own Aperonix conversations into the protected Archive.
alter table public.aperonix_conversations
  add column if not exists archived_at timestamptz null;

create index if not exists aperonix_conversations_user_archived_updated_idx
  on public.aperonix_conversations (user_id, archived_at, updated_at desc);
