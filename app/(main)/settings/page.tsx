'use client'

import { useRouter } from 'next/navigation'
import { LogOut, ChevronRight, User, ShieldCheck, ShieldAlert, Headset } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useUser } from '@/lib/hooks/useUser'
import { createClient } from '@/lib/supabase/client'
import { PageLoader } from '@/components/shared/LoadingSpinner'
import Link from 'next/link'

export default function SettingsPage() {
  const { profile, loading } = useUser()
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) return <PageLoader />
  if (!profile) return null

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      <h1 className="text-xl font-bold">Settings</h1>

      {/* Account */}
      <Card>
        <CardContent className="pt-4 divide-y">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide pb-2">Account</p>
          <Link href="/settings/general" className="flex items-center justify-between py-3 hover:text-pink-500 transition-colors">
            <div className="flex items-center gap-3">
              <User className="h-5 w-5" />
              <div>
                <span className="text-sm font-medium block">General Settings</span>
                <span className="text-xs text-muted-foreground">Edit profile, accounts, saved posts</span>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </CardContent>
      </Card>

      {/* Privacy */}
      <Card>
        <CardContent className="pt-4 divide-y">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide pb-2">Privacy</p>
          <Link href="/settings/privacy" className="flex items-center justify-between py-3 hover:text-pink-500 transition-colors">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5" />
              <div>
                <span className="text-sm font-medium block">Privacy Settings</span>
                <span className="text-xs text-muted-foreground">Account privacy, policy & terms</span>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </CardContent>
      </Card>

      {/* Support */}
      <Card>
        <CardContent className="pt-4 divide-y">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide pb-2">Support</p>
          <Link href="/settings/support" className="flex items-center justify-between py-3 hover:text-pink-500 transition-colors">
            <div className="flex items-center gap-3">
              <Headset className="h-5 w-5" />
              <div>
                <span className="text-sm font-medium block">Support</span>
                <span className="text-xs text-muted-foreground">Contact us, privacy policy & terms</span>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </CardContent>
      </Card>

      {/* Admin - only ever visible to the one account with is_admin = true */}
      {profile.is_admin && (
        <Card className="border-pink-500/30">
          <CardContent className="pt-4 divide-y">
            <p className="text-xs text-pink-500 font-semibold uppercase tracking-wide pb-2">Admin</p>
            <Link href="/settings/admin" className="flex items-center justify-between py-3 hover:text-pink-500 transition-colors">
              <div className="flex items-center gap-3">
                <ShieldAlert className="h-5 w-5 text-pink-500" />
                <div>
                  <span className="text-sm font-medium block">Admin Panel</span>
                  <span className="text-xs text-muted-foreground">Reports, suspensions & restrictions</span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Logout */}
      <Button variant="destructive" className="w-full gap-2" onClick={handleLogout}>
        <LogOut className="h-4 w-4" />
        Log Out
      </Button>

      <p className="text-center text-xs text-muted-foreground pb-4">SociaLens v1.0.0</p>
    </div>
  )
}
