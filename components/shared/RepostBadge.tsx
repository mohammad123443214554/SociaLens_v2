'use client'

import Link from 'next/link'
import { Repeat2 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getAvatarUrl } from '@/lib/utils/helpers'
import { VerifiedBadge } from '@/components/shared/VerifiedBadge'

type Reposter = { id: string; username: string; avatar_url: string | null; is_verified?: boolean; verification_type?: 'blue' | 'yellow' | null }

interface RepostBadgeProps {
  reposters: Reposter[]
  /** 'overlay' = floating pill for reels (dark bg, absolute positioned by parent).
   *  'inline' = plain row for the feed card header. */
  variant?: 'overlay' | 'inline'
  className?: string
}

// Shows who reposted this - One avatar for a single repost, a neat
// overlapping stack (max 3 shown) plus "and N others" when several
// different people reposted the same post/reel, so it never collapses
// Down to just one name even when many people reposted it.
export function RepostBadge({ reposters, variant = 'overlay', className = '' }: RepostBadgeProps) {
  if (!reposters || reposters.length === 0) return null

  const visible = reposters.slice(0, 3)
  const extraCount = reposters.length - visible.length

  const names = reposters.slice(0, 2).map((r) => r.username)
  let label: string
  if (reposters.length === 1) {
    label = `${names[0]} reposted`
  } else if (reposters.length === 2) {
    label = `${names[0]} and ${names[1]} reposted`
  } else {
    label = `${names[0]} and ${reposters.length - 1} others reposted`
  }

  const avatarSize = variant === 'overlay' ? 'h-6 w-6' : 'h-4 w-4'

  const stack = (
    <div className="flex items-center shrink-0">
      {visible.map((r, i) => (
        <Avatar
          key={r.id}
          className={`${avatarSize} ${i > 0 ? '-ml-2.5' : ''} ${variant === 'overlay' ? 'border border-black/60' : 'border border-background'} animate-repost-in`}
          style={{ zIndex: visible.length - i }}
        >
          <AvatarImage src={getAvatarUrl(r.avatar_url)} />
          <AvatarFallback className="text-[8px]">{r.username?.[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>
      ))}
      {extraCount > 0 && (
        <div
          className={`${avatarSize} -ml-2.5 rounded-full flex items-center justify-center text-[9px] font-semibold ${
            variant === 'overlay' ? 'bg-white/20 text-white border border-black/60' : 'bg-muted text-muted-foreground border border-background'
          }`}
          style={{ zIndex: 0 }}
        >
          +{extraCount}
        </div>
      )}
    </div>
  )

  if (variant === 'overlay') {
    return (
      <Link
        href={`/profile/${visible[0].username}`}
        className={`absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-black/40 backdrop-blur-sm rounded-full pl-1 pr-3 py-1 max-w-[85%] ${className}`}
      >
        <div className="relative shrink-0">
          {stack}
          <div className="absolute -bottom-0.5 -right-0.5 bg-purple-500 rounded-full p-[3px] border border-black">
            <Repeat2 className="h-2 w-2 text-white" />
          </div>
        </div>
        <span className="text-white text-[11px] font-medium truncate flex items-center gap-1">
          {label}
          {reposters.length === 1 && visible[0].is_verified && <VerifiedBadge type={visible[0].verification_type} className="text-[10px]" />}
        </span>
      </Link>
    )
  }

  return (
    <Link href={`/profile/${visible[0].username}`} className={`flex items-center gap-2 px-4 pt-3 text-xs text-muted-foreground hover:text-foreground ${className}`}>
      {stack}
      <Repeat2 className="h-3.5 w-3.5 shrink-0" />
      <span className="font-medium truncate flex items-center gap-1">
        {label}
        {reposters.length === 1 && visible[0].is_verified && <VerifiedBadge type={visible[0].verification_type} className="text-xs" />}
      </span>
    </Link>
  )
}
