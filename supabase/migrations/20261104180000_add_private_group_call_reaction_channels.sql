-- Only the authenticated owner of a user-scoped private topic can receive
-- ephemeral group-call reactions. Clients do not get an INSERT policy: all
-- reaction delivery is performed by the authenticated API after membership
-- validation and published using the server-only Supabase key.
drop policy if exists "group_call_reaction_recipients_read_own_topic" on realtime.messages;
create policy "group_call_reaction_recipients_read_own_topic"
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and (select realtime.topic()) = 'group-call-reactions:' || (select auth.uid())::text
);

comment on policy "group_call_reaction_recipients_read_own_topic" on realtime.messages
is 'Authenticated users can receive ephemeral group-call reactions only on their own user-scoped private channel.';
