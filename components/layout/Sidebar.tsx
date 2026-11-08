'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Search, SquarePlay, Send, Settings, PlusSquare, Archive, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils/helpers'
import { useUser } from '@/lib/hooks/useUser'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getAvatarUrl } from '@/lib/utils/helpers'
import { VerifiedBadge } from '@/components/shared/VerifiedBadge'

const navItems = [
  { href: '/feed', icon: Home, label: 'Home' },
  { href: '/explore', icon: Search, label: 'Explore' },
  { href: '/reels', icon: SquarePlay, label: 'Reels' },
  { href: '/chat', icon: Send, label: 'Messages' },
]

export function Sidebar() {
  const pathname = usePathname()
  const { profile } = useUser()

  return (
    <>
      <aside className="hidden lg:flex flex-col w-60 xl:w-72 border-r bg-background h-[calc(100vh-3.5rem)] sticky top-14 overflow-y-auto p-4 gap-1">
        {navItems.map(({ href, icon: Icon, label }) => (
          <Link key={href} href={href}
            className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors hover:bg-accent',
              pathname.startsWith(href) && 'bg-accent text-accent-foreground')}>
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        ))}

        <Link href="/create/options" className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors hover:bg-accent text-left w-full', pathname.startsWith('/create') && 'bg-accent text-accent-foreground')}>
          <PlusSquare className="h-5 w-5" />
          Create
        </Link>

        <Link href="/studio" className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors hover:bg-accent text-left w-full', pathname.startsWith('/studio') && 'bg-accent text-accent-foreground')}>
          <Sparkles className="h-5 w-5" />
          SociaLens Studio
        </Link>

        <div className="mt-auto pt-4 border-t space-y-1">
          {profile && (
            <Link href={`/profile/${profile.username}`}
              className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors hover:bg-accent',
                pathname.startsWith('/profile') && 'bg-accent')}>
              <Avatar className="h-6 w-6">
                <AvatarImage src={getAvatarUrl(profile.avatar_url)} />
                <AvatarFallback>{profile.username?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="flex items-center gap-1">
                {profile.username}
                {profile.is_verified && <VerifiedBadge type={profile.verification_type} className="text-xs" />}
              </span>
            </Link>
          )}
          <Link href="/chat/archive"
            className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors hover:bg-accent',
              pathname.startsWith('/chat/archive') && 'bg-accent')}>
            <Archive className="h-5 w-5" />
            Archive
          </Link>
          <Link href="/settings"
            className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors hover:bg-accent',
              pathname.startsWith('/settings') && 'bg-accent')}>
            <Settings className="h-5 w-5" />
            Settings
          </Link>
        </div>
      </aside>

    </>
  )
}
