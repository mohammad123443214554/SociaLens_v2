'use client'

import Link from 'next/link'
import { Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useFollowRequests, useRespondToFollowRequest } from '@/lib/hooks/useFollow'
import { getAvatarUrl } from '@/lib/utils/helpers'
import { VerifiedBadge } from '@/components/shared/VerifiedBadge'

export function FollowRequestsDialog({ userId }: { userId: string }) {
  const { data: requests = [] } = useFollowRequests(userId)
  const respondMutation = useRespondToFollowRequest()

  if (requests.length === 0) return null

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Users className="h-4 w-4" />
          Follow Requests ({requests.length})
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Follow Requests</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {requests.map((req: any) => (
            <div key={req.id} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Link href={`/profile/${req.profiles?.username}`}>
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={getAvatarUrl(req.profiles?.avatar_url)} />
                    <AvatarFallback>{req.profiles?.username?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                </Link>
                <div>
                  <Link href={`/profile/${req.profiles?.username}`} className="font-semibold text-sm hover:underline flex items-center gap-1">
                    {req.profiles?.username}
                    {req.profiles?.is_verified && <VerifiedBadge type={req.profiles.verification_type} className="text-xs" />}
                  </Link>
                  <p className="text-xs text-muted-foreground">{req.profiles?.full_name}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    respondMutation.mutate({
                      followId: req.id,
                      followerId: req.follower_id,
                      followingId: userId,
                      action: 'accepted',
                    })
                  }
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    respondMutation.mutate({
                      followId: req.id,
                      followerId: req.follower_id,
                      followingId: userId,
                      action: 'rejected',
                    })
                  }
                >
                  Decline
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}  
