'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useUser } from '@/lib/hooks/useUser'
import { getAvatarUrl } from '@/lib/utils/helpers'
import { NotificationPanel } from '@/components/shared/NotificationPanel'
import { cn } from '@/lib/utils/helpers'

export function Navbar({ className }: { className?: string } = {}) {
  const { profile } = useUser()

  return (
    <header className={cn("sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60", className)}>
      <div className="flex h-14 items-center px-4 gap-4">
        <Link href="/feed" className="flex items-center gap-2">
          <Image src="/images/socialens-logo.png" alt="SociaLens" width={32} height={32} className="rounded-lg" />
          <span className="font-bold text-lg bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 bg-clip-text text-transparent hidden sm:block">
            SociaLens
          </span>
        </Link>

        <div className="flex-1 max-w-sm mx-auto hidden sm:block">
          <Link href="/explore">
            <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-muted text-muted-foreground text-sm cursor-pointer hover:bg-accent">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span>Search</span>
            </div>
          </Link>
        </div>

        <div className="ml-auto flex items-center gap-1">
          {/* Aperonix AI */}
          <Link href="/aperonix">
            <Button variant="ghost" size="icon" className="gap-1 px-2 w-auto" title="Aperonix AI">
              <Image src="/images/aperonix-logo.png" alt="Aperonix" width={16} height={16} className="rounded-full" />
              <span className="text-xs font-medium hidden sm:inline">Aperonix</span>
            </Button>
          </Link>

          {/* Settings - mobile pe bhi dikhega */}
          <Link href="/settings">
            <Button variant="ghost" size="icon">
              <Settings className="h-4 w-4" />
            </Button>
          </Link>

          {/* Notification */}
          <NotificationPanel />

          {/* Profile */}
          {profile && (
            <Link href={`/profile/${profile.username}`}>
              <Avatar className="h-8 w-8">
                <AvatarImage src={getAvatarUrl(profile.avatar_url)} />
                <AvatarFallback>{profile.username?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
