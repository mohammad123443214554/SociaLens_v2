'use client'

import { useUser } from '@/lib/hooks/useUser'
import { CommentThread } from '@/components/shared/CommentThread'

export function CommentSection({ postId, postOwnerId }: { postId: string; postOwnerId?: string }) {
  const { user } = useUser()

  return (
    <div className="px-4 pb-4 border-t pt-3">
      <CommentThread
        target="post"
        targetId={postId}
        currentUserId={user?.id}
        ownerId={postOwnerId}
        emptyText="No comments yet. Be the first!"
        listClassName="max-h-60 mb-3"
      />
    </div>
  )
} 
