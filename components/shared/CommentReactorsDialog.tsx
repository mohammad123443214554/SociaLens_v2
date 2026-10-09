'use client'

import Link from 'next/link'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { CommentTarget, useCommentReactors } from '@/lib/hooks/useComments'
import { getAvatarUrl } from '@/lib/utils/helpers'
import { VerifiedBadge } from '@/components/shared/VerifiedBadge'

interface CommentReactorsDialogProps {
  target: CommentTarget
  commentId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Owner-only breakdown of exactly who reacted to a comment and with
// which emoji - never shown to anyone else, no matter how many
// Reactions pile up.
export function CommentReactorsDialog({ target, commentId, open, onOpenChange }: CommentReactorsDialogProps) {
  const { data: reactors = [], isLoading } = useCommentReactors(target, commentId, open)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Reactions {reactors.length > 0 ? `(${reactors.length})` : ''}</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto scrollbar-hide space-y-1 -mx-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-6">Loading...</p>
          ) : reactors.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No reactions yet.</p>
          ) : (
            reactors.map((r, i) => (
              <Link
                key={i}
                href={`/profile/${r.profiles?.username}`}
                className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-accent"
              >
                <Avatar className="h-9 w-9">
                  <AvatarImage src={getAvatarUrl(r.profiles?.avatar_url)} />
                  <AvatarFallback>{r.profiles?.username?.[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="flex-1 min-w-0 text-sm font-medium truncate flex items-center gap-1">
                  {r.profiles?.username}
                  {r.profiles?.is_verified && <VerifiedBadge type={r.profiles.verification_type} className="text-xs shrink-0" />}
                </span>
                <span className="text-xl leading-none shrink-0">{r.emoji}</span>
              </Link>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
