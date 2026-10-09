'use client'

import { Ban } from 'lucide-react'
import { cn } from '@/lib/utils/helpers'

export function UnavailableMessage({ isOwn }: { isOwn: boolean }) {
  return (
    <div className={cn(
      'flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs italic text-muted-foreground border border-dashed border-border',
      isOwn ? 'rounded-br-sm' : 'rounded-bl-sm'
    )}>
      <Ban className="h-3.5 w-3.5 shrink-0" /> Message unavailable
    </div>
  )
}
