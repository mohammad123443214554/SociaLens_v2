alter table public.aperonix_voice_conversations
  add column if not exists pinned boolean not null default false;

create index if not exists aperonix_voice_conversations_user_pinned_updated_idx
  on public.aperonix_voice_conversations (user_id, pinned desc, updated_at desc);
