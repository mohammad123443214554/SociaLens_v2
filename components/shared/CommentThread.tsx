'use client'

import { useState } from 'react'
import { Send, X } from 'lucide-react'
import { CommentItem } from '@/components/shared/CommentItem'
import { CommentTarget, useCommentThread, useAddComment } from '@/lib/hooks/useComments'
import { isRestricted } from '@/lib/utils/restrictionCheck'
import { RestrictionPopup } from '@/components/shared/RestrictionPopup'

interface CommentThreadProps {
  target: CommentTarget
  targetId: string
  currentUserId?: string
  /** Id of the post/story owner - lets them still see comments their
   *  Commenters have hidden from everyone else. */
  ownerId?: string
  /** Deadline from the viewer's own profile.restrict_comment_until, if
   *  any - blocks new comments/replies until it passes. */
  commentRestrictedUntil?: string | null
  emptyText?: string
  /** Compact list styling for tight spaces (e.g. inside a reel/story
   *  overlay panel) vs the roomier feed card layout. */
  variant?: 'compact' | 'default'
  /** Hide the "add a comment" composer entirely (e.g. story owners don't
   *  post fresh top-level comments on their own story, same as before -
   *  they can still like/react/reply to existing ones). */
  hideComposer?: boolean
  className?: string
  listClassName?: string
}

export function CommentThread({
  target,
  targetId,
  currentUserId,
  ownerId,
  commentRestrictedUntil,
  emptyText = 'No comments yet!',
  variant = 'default',
  hideComposer = false,
  className = '',
  listClassName = '',
}: CommentThreadProps) {
  const { data: thread = [], isLoading } = useCommentThread(target, targetId, currentUserId, ownerId)
  const addComment = useAddComment(target)

  const [input, setInput] = useState('')
  const [replyTo, setReplyTo] = useState<{ topLevelId: string; commentId: string; userId: string; username: string; content: string } | null>(null)
  const [showRestrictionPopup, setShowRestrictionPopup] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUserId || !input.trim()) return
    if (isRestricted(commentRestrictedUntil)) {
      setShowRestrictionPopup(true)
      return
    }
    await addComment.mutateAsync({
      targetId,
      userId: currentUserId,
      content: input.trim(),
      replyParentId: replyTo?.topLevelId,
      ownerId,
      replyToCommentId: replyTo?.commentId,
      replyToUserId: replyTo?.userId,
      replyToContent: replyTo?.content,
    })
    setInput('')
    setReplyTo(null)
  }

  return (
    <div className={className}>
      {showRestrictionPopup && (
        <RestrictionPopup feature="commenting" until={commentRestrictedUntil} onClose={() => setShowRestrictionPopup(false)} />
      )}
      <div className={`space-y-3 overflow-y-auto overflow-x-hidden scrollbar-hide ${listClassName}`}>
        {isLoading ? (
          <p className="text-xs text-muted-foreground text-center py-4">Loading comments...</p>
        ) : thread.length === 0 ? (
          <p className={`text-muted-foreground text-center ${variant === 'compact' ? 'text-sm py-6' : 'text-xs py-2'}`}>{emptyText}</p>
        ) : (
          thread.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              target={target}
              targetId={targetId}
              currentUserId={currentUserId}
              ownerId={ownerId}
              onReply={setReplyTo}
            />
          ))
        )}
      </div>

      {currentUserId && !hideComposer && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-1.5 pt-2">
          {replyTo && (
            <div className="flex items-center justify-between bg-muted/60 rounded-md px-2.5 py-1 text-xs">
              <span className="text-muted-foreground">
                Replying to <span className="font-semibold text-foreground">@{replyTo.username}</span>
              </span>
              <button type="button" onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={replyTo ? `Reply to @${replyTo.username}...` : 'Add a comment...'}
              className="flex-1 bg-muted rounded-full px-3 py-2 text-sm outline-none border border-transparent focus:border-pink-500"
            />
            <button type="submit" disabled={!input.trim() || addComment.isPending} className="text-pink-500 disabled:opacity-40 shrink-0">
              <Send className="h-5 w-5" />
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
