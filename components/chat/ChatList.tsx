'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { MessageCircle } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { createClient } from '@/lib/supabase/client'
import { ChatWithProfiles } from '@/lib/types/database.types'
import { formatTimeAgo, getAvatarUrl } from '@/lib/utils/helpers'

interface ChatListProps {
  currentUserId: string
}

export function ChatList({ currentUserId }: ChatListProps) {
  const supabase = createClient()

  const { data: chats = [], isLoading } = useQuery({
    queryKey: ['chats', currentUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chats')
        .select(`
          *,
          participant1:profiles!chats_participant1_id_fkey(*),
          participant2:profiles!chats_participant2_id_fkey(*)
        `)
        .or(`participant1_id.eq.${currentUserId},participant2_id.eq.${currentUserId}`)
        .order('last_message_time', { ascending: false, nullsFirst: false })

      if (error) throw error
      return data as ChatWithProfiles[]
    },
  })

  if (isLoading) return <div className="p-4 text-center text-muted-foreground">Loading chats...</div>

  if (chats.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
        <MessageCircle className="h-12 w-12" />
        <p>No conversations yet</p>
        <p className="text-sm">Start chatting by visiting someone&apos;s profile</p>
      </div>
    )
  }

  return (
    <div className="divide-y">
      {chats.map((chat) => {
        const other = chat.participant1_id === currentUserId ? chat.participant2 : chat.participant1

        return (
          <Link
            key={chat.id}
            href={`/chat/${chat.id}`}
            className="flex items-center gap-3 p-4 hover:bg-accent transition-colors"
          >
            <Avatar className="h-12 w-12">
              <AvatarImage src={getAvatarUrl(other.avatar_url)} />
              <AvatarFallback>{other.username?.[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm">{other.username}</p>
                {chat.last_message_time && (
                  <span className="text-xs text-muted-foreground">
                    {formatTimeAgo(chat.last_message_time)}
                  </span>
                )}
              </div>
              {chat.last_message && (
                <p className="text-sm text-muted-foreground truncate">{chat.last_message}</p>
              )}
            </div>
          </Link>
        )
      })}
    </div>
  )
}
