-- Archive support for saved Aperonix voice conversations.
alter table public.aperonix_voice_conversations
  add column if not exists archived_at timestamptz null;

create index if not exists aperonix_voice_conversations_user_archived_updated_idx
  on public.aperonix_voice_conversations (user_id, archived_at, updated_at desc);
