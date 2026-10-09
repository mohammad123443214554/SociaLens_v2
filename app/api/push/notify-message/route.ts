import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/server/push'

/**
 * Called right after a chat message is inserted (client-side) to notify
 * the recipient even if they don't have SociaLens open in a tab right now.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { messageId } = await request.json()
  if (!messageId) return NextResponse.json({ error: 'messageId is required' }, { status: 400 })

  const { data: message } = await supabase
    .from('messages')
    .select('id, sender_id, content, media_type, sticker, chat_id, chats(participant1_id, participant2_id, archived_by)')
    .eq('id', messageId)
    .single()

  if (!message || message.sender_id !== user.id) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  }

  const chat = message.chats as any
  const recipientId = chat.participant1_id === user.id ? chat.participant2_id : chat.participant1_id

  // Archived chats are meant to be private and quiet - no notification,
  // same as they get no unread badge either.
  if ((chat.archived_by || []).includes(recipientId)) {
    return NextResponse.json({ ok: true })
  }

  const { data: senderProfile } = await supabase
    .from('profiles')
    .select('username, full_name')
    .eq('id', user.id)
    .single()

  const senderName = senderProfile?.full_name || senderProfile?.username || 'Someone'
  // Generic, type-based label only - never the actual text someone typed -
  // same privacy rule as the chat list preview. A lock-screen notification
  // is even more exposed than the in-app list, so this matters more here.
  const preview =
    message.sticker ? `${message.sticker} Sticker`
    : message.media_type === 'image' ? '📷 Sent a photo'
    : message.media_type === 'video' ? '🎬 Sent a video'
    : message.media_type === 'audio' ? '🎤 Sent a voice message'
    : '💬 Sent a message'

  await sendPushToUser(recipientId, {
    title: senderName,
    body: preview,
    url: `/chat/${message.chat_id}`,
    kind: 'message',
    tag: `chat-${message.chat_id}`,
    chatId: message.chat_id,
  })

  return NextResponse.json({ ok: true })
}
