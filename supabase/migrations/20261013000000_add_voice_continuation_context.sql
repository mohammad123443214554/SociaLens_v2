alter table public.aperonix_voice_conversations
  add column if not exists context_summary text;

comment on column public.aperonix_voice_conversations.context_summary is
  'Private AI-generated context carried forward when a user connects a new voice conversation to an earlier one.';
