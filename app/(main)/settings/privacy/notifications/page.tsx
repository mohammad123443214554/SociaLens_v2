'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Bell, BellOff, Users } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent } from '@/components/ui/card'
import { useUser } from '@/lib/hooks/useUser'
import { createClient } from '@/lib/supabase/client'
import { PageLoader } from '@/components/shared/LoadingSpinner'
import { SelectedPeoplePicker } from '@/components/shared/SelectedPeoplePicker'

export default function NotificationsSettingsPage() {
  const { user, profile, loading, refreshProfile } = useUser()
  const supabase = createClient()
  const [pushEnabled, setPushEnabled] = useState(true)
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    if (profile) setMuted(!!(profile as any).notifications_muted)
    const stored = localStorage.getItem('socialens-push-enabled')
    setPushEnabled(stored !== 'false')
  }, [profile])

  const togglePush = (checked: boolean) => {
    setPushEnabled(checked)
    localStorage.setItem('socialens-push-enabled', String(checked))
  }

  const toggleMuted = async (checked: boolean) => {
    if (!user) return
    setMuted(checked)
    await supabase.from('profiles').update({ notifications_muted: checked }).eq('id', user.id)
    await refreshProfile()
  }

  if (loading) return <PageLoader />
  if (!user) return null

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/settings/privacy" className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold">Notifications</h1>
      </div>

      <Card>
        <CardContent className="pt-4 divide-y">
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5" />
              <div>
                <p className="text-sm font-medium">Push Notifications</p>
                <p className="text-xs text-muted-foreground max-w-[220px]">
                  Turn this off to stop all push notifications on this device
                </p>
              </div>
            </div>
            <Switch checked={pushEnabled} onCheckedChange={togglePush} />
          </div>

          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <BellOff className="h-5 w-5" />
              <div>
                <p className="text-sm font-medium">All Notifications</p>
                <p className="text-xs text-muted-foreground max-w-[220px]">
                  Turn this on and no notifications will come in at all, from anyone
                </p>
              </div>
            </div>
            <Switch checked={muted} onCheckedChange={toggleMuted} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-3 mb-1">
            <Users className="h-5 w-5" />
            <div>
              <p className="text-sm font-semibold">Notify me about</p>
              <p className="text-xs text-muted-foreground">Choose whose activity (likes, comments, messages, follows) notifies you</p>
            </div>
          </div>
          <div className="pt-2">
            <SelectedPeoplePicker userId={user.id} category="notify" emptyHint="Leave empty to get notified about everyone. Add people to only get notified about them." />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
