'use client'

import Link from 'next/link'
import { ChevronLeft, Lock } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent } from '@/components/ui/card'
import { useUser } from '@/lib/hooks/useUser'
import { createClient } from '@/lib/supabase/client'
import { PageLoader } from '@/components/shared/LoadingSpinner'
import { useState } from 'react'

// Turning Private Account ON locks the account down completely: nobody
// can see your posts, story, message you, or call you - except people
// YOU follow (not just anyone who follows you). The account still shows
// up in search/suggestions as usual, just marked locked - people can
// still find it and send a follow request, they just can't see anything
// or reach you until you follow them back.
const LOCK_DOWN_FIELDS = ['post_privacy', 'story_privacy', 'message_privacy', 'call_privacy'] as const

export default function AccountPrivacyPage() {
  const { user, profile, loading, refreshProfile } = useUser()
  const supabase = createClient()
  const [privacyLoading, setPrivacyLoading] = useState(false)

  const togglePrivateAccount = async () => {
    if (!user || !profile) return
    setPrivacyLoading(true)
    const goingPrivate = !profile.is_private
    const update: Record<string, any> = { is_private: goingPrivate }
    for (const field of LOCK_DOWN_FIELDS) {
      update[field] = goingPrivate ? 'following' : 'everyone'
    }
    await supabase.from('profiles').update(update).eq('id', user.id)
    await refreshProfile()
    setPrivacyLoading(false)
  }

  if (loading) return <PageLoader />
  if (!profile || !user) return null

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/settings/privacy" className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold">Account Privacy</h1>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-3">
              <Lock className="h-5 w-5" />
              <div>
                <p className="text-sm font-medium">Private Account</p>
                <p className="text-xs text-muted-foreground max-w-[260px]">
                  Locks your account completely - only people you follow can see your
                  posts and story, or message and call you. Your account still shows
                  up in search and suggestions, just marked as private.
                </p>
              </div>
            </div>
            <Switch checked={profile.is_private} onCheckedChange={togglePrivateAccount} disabled={privacyLoading} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
