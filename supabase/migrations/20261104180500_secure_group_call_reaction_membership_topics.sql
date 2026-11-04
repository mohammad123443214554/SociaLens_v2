-- Bind each private reaction topic to both one group call and its intended user.
-- A topic is readable only while that authenticated user is joined to that active call.
drop policy if exists "group_call_reaction_recipients_read_own_topic" on realtime.messages;
create policy "group_call_reaction_recipients_read_own_topic"
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and (select realtime.topic()) ~ '^group-call-reactions:[0-9a-fA-F-]{36}:[0-9a-fA-F-]{36}$'
  and split_part((select realtime.topic()), ':', 3) = (select auth.uid())::text
  and exists (
    select 1
    from public.group_call_participants participant
    join public.group_calls call on call.id = participant.group_call_id
    where participant.group_call_id::text = split_part((select realtime.topic()), ':', 2)
      and participant.user_id = (select auth.uid())
      and participant.status = 'joined'
      and call.status = 'active'
  )
);

comment on policy "group_call_reaction_recipients_read_own_topic" on realtime.messages
is 'Authenticated users can receive ephemeral group-call reactions only on their own private topic while joined to that active group call.';
