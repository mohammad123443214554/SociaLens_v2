import type { Chat } from '@/lib/types/database.types'

/**
 * The chat list preview line - always a generic, type-based label, never
 * the actual words someone typed. This is what makes it safe for someone
 * to glance at their own chat list without a message's real content being
 * readable by anyone looking over their shoulder or picking up their
 * unlocked phone, without having to open the conversation.
 */
export function getChatPreviewLabel(chat: Pick<Chat, 'last_message' | 'last_message_type'>): string {
  if (!chat.last_message) return 'No messages yet'
  switch (chat.last_message_type) {
    case 'image': return '📷 Photo'
    case 'video': return '🎥 Video'
    case 'audio': return '🎤 Voice message'
    case 'sticker': return chat.last_message // already just an emoji + " Sticker", safe to show as-is
    case 'call': return chat.last_message // already a generic "📞 Voice call" / "Missed call" etc.
    case 'post': return '📎 Shared a post'
    case 'reel': return '🎬 Shared a reel'
    case 'story': return '💬 Replied to a story'
    case 'aperonix': return '✨ Shared an Aperonix reply'
    case 'reaction': return `${chat.last_message} Reacted to a message`
    default: return '💬 New message'
  }
}

/** Prefixes "You: " when the current person sent the last message, so it's
 *  obvious at a glance whether it's their own message or the other
 *  person's - without revealing what it actually said. */
export function getChatPreviewText(
  chat: Pick<Chat, 'last_message' | 'last_message_type' | 'last_message_sender_id'>,
  currentUserId?: string
): string {
  const label = getChatPreviewLabel(chat)
  if (!chat.last_message) return label
  return chat.last_message_sender_id === currentUserId ? `You: ${label}` : label
}
