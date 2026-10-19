'use client'

import { useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { Home, Search, SquarePlay, Send, Settings, PlusSquare, Archive } from 'lucide-react'
import { cn } from '@/lib/utils/helpers'
import { useUser } from '@/lib/hooks/useUser'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getAvatarUrl } from '@/lib/utils/helpers'
import { VerifiedBadge } from '@/components/shared/VerifiedBadge'

// CreatePostModal pulls in image compression, video-duration checking,
// and the Aperonix AI caption/hashtag UI - genuinely heavy, and this
// component (the sidebar) renders on every single page. Loading it only
// when someone actually taps "Create Post" instead of bundling it into
// every page's initial JS is what actually shrinks Feed/Reels/Explore's
// first load.
const CreatePostModal = dynamic(() => import('@/components/shared/CreatePostModal').then(m => m.CreatePostModal), { ssr: false })

const navItems = [
  { href: '/feed', icon: Home, label: 'Home' },
  { href: '/explore', icon: Search, label: 'Explore' },
  { href: '/reels', icon: SquarePlay, label: 'Reels' },
  { href: '/chat', icon: Send, label: 'Messages' },
]

export function Sidebar() {
  const pathname = usePathname()
  const { profile } = useUser()
  const [showCreate, setShowCreate] = useState(false)

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

        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors hover:bg-accent text-left w-full"
        >
          <PlusSquare className="h-5 w-5" />
          Create
        </button>

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

      {showCreate && <CreatePostModal onClose={() => setShowCreate(false)} />}
    </>
  )
}
