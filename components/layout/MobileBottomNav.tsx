'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Search, SquarePlay, Plus, Send } from 'lucide-react'
import { cn } from '@/lib/utils/helpers'
import { useUser } from '@/lib/hooks/useUser'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getAvatarUrl } from '@/lib/utils/helpers'
import { createClient } from '@/lib/supabase/client'

// Left-side nav items (before the Create button)
const leftNavItems = [
  { href: '/feed', icon: Home, label: 'Home' },
  { href: '/explore', icon: Search, label: 'Explore' },
  { href: '/reels', icon: SquarePlay, label: 'Reels' },
]

// Right-side nav items (after the Create button)
const rightNavItems = [
  { href: '/chat', icon: Send, label: 'Chat' },
]

export function MobileBottomNav({ className }: { className?: string } = {}) {
  const pathname = usePathname()
  const { profile, user } = useUser()
  const [unreadMessages, setUnreadMessages] = useState(0)
  const supabase = createClient()

  useEffect(() => {
    if (!user) return
    const fetchUnread = async () => {
      const { data } = await supabase
        .from('messages')
        .select('id')
        .eq('is_read', false)
        .neq('sender_id', user.id)
      setUnreadMessages(data?.length || 0)
    }
    fetchUnread()

    // Clear when on chat page
    if (pathname.startsWith('/chat')) {
      setUnreadMessages(0)
    }

    const channel = supabase.channel('mobile-nav-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, fetchUnread)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, fetchUnread)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user, pathname])

  return (
    <>
      <nav className={cn("lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60", className)}>
        <div className="flex items-center justify-around h-14">
          {leftNavItems.map(({ href, icon: Icon, label }) => (
            <Link key={href} href={href}
              className={cn('flex flex-col items-center gap-0.5 p-2 rounded-lg transition-colors relative',
                pathname.startsWith(href) ? 'text-pink-500' : 'text-muted-foreground hover:text-foreground')}>
              <Icon className="h-5 w-5" />
              <span className="text-[10px]">{label}</span>
            </Link>
          ))}

          {/* Open the dedicated Post/Reel editor */}
          <Link href="/create"
            className={cn('flex flex-col items-center gap-0.5 p-2 rounded-lg transition-colors', pathname.startsWith('/create') ? 'text-pink-500' : 'text-muted-foreground hover:text-foreground')}>
            <Plus className="h-5 w-5" />
            <span className="text-[10px]">Create</span>
          </Link>

          {rightNavItems.map(({ href, icon: Icon, label }) => (
            <Link key={href} href={href}
              className={cn('flex flex-col items-center gap-0.5 p-2 rounded-lg transition-colors relative',
                pathname.startsWith(href) ? 'text-pink-500' : 'text-muted-foreground hover:text-foreground')}>
              <div className="relative">
                <Icon className="h-5 w-5" />
                {/* Unread red dot on chat icon */}
                {href === '/chat' && unreadMessages > 0 && !pathname.startsWith('/chat') && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-bold rounded-full min-w-[14px] h-3.5 flex items-center justify-center px-0.5">
                    {unreadMessages > 9 ? '9+' : unreadMessages}
                  </span>
                )}
              </div>
              <span className="text-[10px]">{label}</span>
            </Link>
          ))}

          {profile && (
            <Link href={`/profile/${profile.username}`}
              className={cn('flex flex-col items-center gap-0.5 p-2 rounded-lg transition-colors',
                pathname.startsWith('/profile') ? 'text-pink-500' : 'text-muted-foreground hover:text-foreground')}>
              <Avatar className="h-6 w-6">
                <AvatarImage src={getAvatarUrl(profile.avatar_url)} />
                <AvatarFallback className="text-[10px]">{profile.username?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="text-[10px]">Profile</span>
            </Link>
          )}
        </div>
      </nav>

    </>
  )
}
