'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { Heart, MoreHorizontal, Trash2, EyeOff, Eye, MessageCircle, Flag } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { CommentReactionPicker } from '@/components/shared/CommentReactionPicker'
import { CommentReactorsDialog } from '@/components/shared/CommentReactorsDialog'
import { ReportModal } from '@/components/shared/ReportModal'
import { VerifiedBadge } from '@/components/shared/VerifiedBadge'
import {
  CommentTarget,
  useToggleCommentLike,
  useSetCommentReaction,
  useRemoveCommentReaction,
  useDeleteComment,
  useDeleteCommentForMe,
  useSetCommentHidden,
} from '@/lib/hooks/useComments'
import { EnrichedComment } from '@/lib/types/database.types'
import { formatTimeAgo, formatCount, getAvatarUrl } from '@/lib/utils/helpers'

interface CommentItemProps {
  comment: EnrichedComment
  target: CommentTarget
  targetId: string
  currentUserId?: string
  ownerId?: string
  isReply?: boolean
  onReply: (target: { topLevelId: string; commentId: string; userId: string; username: string; content: string }) => void
}

export function CommentItem({ comment, target, targetId, currentUserId, ownerId, isReply, onReply }: CommentItemProps) {
  const [showReactionPicker, setShowReactionPicker] = useState(false)
  const [showReactorsList, setShowReactorsList] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const reactButtonRef = useRef<HTMLButtonElement>(null)

  const toggleLike = useToggleCommentLike(target)
  const setReaction = useSetCommentReaction(target)
  const removeReaction = useRemoveCommentReaction(target)
  const deleteComment = useDeleteComment(target)
  const deleteForMe = useDeleteCommentForMe(target)
  const setHidden = useSetCommentHidden(target)

  const isMine = !!currentUserId && currentUserId === comment.user_id

  const handleLike = () => {
    if (!currentUserId) return
    toggleLike.mutate({
      commentId: comment.id, userId: currentUserId, liked: comment.is_liked, targetId,
      commentAuthorId: comment.user_id, commentContent: comment.content,
    })
  }

  const handleReact = (emoji: string) => {
    if (!currentUserId) return
    if (comment.my_reaction === emoji) {
      removeReaction.mutate({ commentId: comment.id, userId: currentUserId, targetId })
    } else {
      setReaction.mutate({
        commentId: comment.id, userId: currentUserId, emoji, targetId,
        commentAuthorId: comment.user_id, commentContent: comment.content,
      })
    }
    setShowReactionPicker(false)
  }

  const totalReactions = Object.values(comment.reaction_counts).reduce((a, b) => a + b, 0)
  const topReactionEmojis = Object.entries(comment.reaction_counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([emoji]) => emoji)
  // Only the post/story owner gets to see who reacted and with what -
  // Everyone else just sees the compact count, Same as everyone else's view.
  const isOwnerViewing = !!currentUserId && !!ownerId && currentUserId === ownerId

  return (
    <div className={`flex items-start gap-2 ${isReply ? 'mt-2.5' : ''}`}>
      <Link href={`/profile/${comment.profiles?.username}`} className="shrink-0">
        <Avatar className={isReply ? 'h-6 w-6' : 'h-7 w-7'}>
          <AvatarImage src={getAvatarUrl(comment.profiles?.avatar_url)} />
          <AvatarFallback className="text-[10px]">{comment.profiles?.username?.[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>
      </Link>

      <div className="flex-1 min-w-0">
        <p className="text-sm break-words">
          <Link href={`/profile/${comment.profiles?.username}`} className="font-semibold mr-1 hover:underline">
            {comment.profiles?.username}
          </Link>
          {comment.profiles?.is_verified && (
            <VerifiedBadge type={comment.profiles.verification_type} className="text-xs mr-1" />
          )}
          {comment.content}
        </p>

        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
          <span>{formatTimeAgo(comment.created_at)}</span>

          {comment.likes_count > 0 && <span>{formatCount(comment.likes_count)} like{comment.likes_count !== 1 ? 's' : ''}</span>}

          {totalReactions > 0 && (
            isOwnerViewing ? (
              <button
                type="button"
                onClick={() => setShowReactorsList(true)}
                className="flex items-center gap-0.5 hover:text-foreground"
              >
                <span>{topReactionEmojis.join('')}</span> {formatCount(totalReactions)}
              </button>
            ) : (
              <span className="flex items-center gap-0.5">
                {topReactionEmojis.join('')} {formatCount(totalReactions)}
              </span>
            )
          )}

          <button onClick={handleLike} disabled={!currentUserId} className="font-semibold hover:text-foreground">
            {comment.is_liked ? 'Liked' : 'Like'}
          </button>

          <div className="relative">
            <button
              ref={reactButtonRef}
              onClick={() => setShowReactionPicker((v) => !v)}
              disabled={!currentUserId}
              className={`font-semibold hover:text-foreground ${comment.my_reaction ? 'text-foreground' : ''}`}
            >
              {comment.my_reaction ? comment.my_reaction : 'React'}
            </button>
            {showReactionPicker && (
              <CommentReactionPicker anchorRef={reactButtonRef} onSelect={handleReact} onClose={() => setShowReactionPicker(false)} />
            )}
          </div>

          <button
            onClick={() =>
              onReply({
                topLevelId: isReply ? (comment.parent_id as string) : comment.id,
                commentId: comment.id,
                userId: comment.user_id,
                username: comment.profiles?.username,
                content: comment.content,
              })
            }
            disabled={!currentUserId}
            className="font-semibold hover:text-foreground"
          >
            Reply
          </button>

          {comment.hidden && isMine && (
            <span className="flex items-center gap-1 italic text-muted-foreground/80">
              <EyeOff className="h-3 w-3" /> Only you & the owner see this
            </span>
          )}
        </div>

        {!isReply && comment.replies.length > 0 && (
          <div className="pl-3 border-l-2 border-muted mt-1">
            {comment.replies.map((reply) => (
              <CommentItem
                key={reply.id}
                comment={reply}
                target={target}
                targetId={targetId}
                currentUserId={currentUserId}
                ownerId={ownerId}
                isReply
                onReply={onReply}
              />
            ))}
          </div>
        )}
      </div>

      {isMine ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="text-muted-foreground hover:text-foreground shrink-0 p-1 -mr-1">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => deleteComment.mutate({ commentId: comment.id, targetId })}
            >
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => currentUserId && deleteForMe.mutate({ commentId: comment.id, userId: currentUserId, targetId })}
            >
              <Trash2 className="h-4 w-4 mr-2" /> Delete for me
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setHidden.mutate({ commentId: comment.id, hidden: !comment.hidden, targetId })}
            >
              {comment.hidden ? (
                <>
                  <Eye className="h-4 w-4 mr-2" /> Unhide comment
                </>
              ) : (
                <>
                  <EyeOff className="h-4 w-4 mr-2" /> Hide comment
                </>
              )}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : currentUserId ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="text-muted-foreground hover:text-foreground shrink-0 p-1 -mr-1">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="text-destructive" onClick={() => setShowReport(true)}>
              <Flag className="h-4 w-4 mr-2" /> Report
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {isOwnerViewing && totalReactions > 0 && (
        <CommentReactorsDialog
          target={target}
          commentId={comment.id}
          open={showReactorsList}
          onOpenChange={setShowReactorsList}
        />
      )}

      {showReport && currentUserId && (
        <ReportModal
          reporterId={currentUserId}
          reportedUserId={comment.user_id}
          targetType={target === 'story' ? 'story_comment' : 'comment'}
          targetId={comment.id}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  )
}
