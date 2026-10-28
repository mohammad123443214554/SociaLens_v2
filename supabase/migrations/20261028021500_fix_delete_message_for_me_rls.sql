-- Fix "Delete for me" for chat messages.
-- The direct PostgREST UPDATE failed with SQLSTATE 42501 on the new row.
-- This RPC performs a narrowly-scoped update after checking authentication
-- and that the caller is one of the chat participants.

drop policy if exists "Users can update messages" on public.messages;
drop function if exists private.is_chat_participant_for_message(uuid, uuid);

create policy "Users can update messages"
on public.messages
for update
to authenticated
using (
  auth.uid() in (
    select c.participant1_id from public.chats c where c.id = messages.chat_id
    union
    select c.participant2_id from public.chats c where c.id = messages.chat_id
  )
)
with check (
  auth.uid() in (
    select c.participant1_id from public.chats c where c.id = messages.chat_id
    union
    select c.participant2_id from public.chats c where c.id = messages.chat_id
  )
);

create or replace function public.delete_message_for_me(p_message_id uuid, p_chat_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_sender_id uuid;
  v_rows integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.chats c
    where c.id = p_chat_id
      and (c.participant1_id = v_user_id or c.participant2_id = v_user_id)
  ) then
    raise exception 'You are not a participant in this chat' using errcode = '42501';
  end if;

  select m.sender_id
    into v_sender_id
  from public.messages m
  where m.id = p_message_id
    and m.chat_id = p_chat_id;

  if not found then
    raise exception 'Message not found in this chat' using errcode = 'P0002';
  end if;

  if v_sender_id = v_user_id then
    update public.messages
       set deleted_for_sender = true
     where id = p_message_id and chat_id = p_chat_id;
  else
    update public.messages
       set deleted_for_recipient = true
     where id = p_message_id and chat_id = p_chat_id;
  end if;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'Message could not be deleted for this user' using errcode = 'P0002';
  end if;

  return true;
end;
$function$;

revoke all on function public.delete_message_for_me(uuid, uuid) from public, anon;
grant execute on function public.delete_message_for_me(uuid, uuid) to authenticated;
