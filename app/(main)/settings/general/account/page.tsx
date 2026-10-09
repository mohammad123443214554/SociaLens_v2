'use client'

import Link from 'next/link'
import { ChevronLeft, ChevronRight, User, Bookmark, Heart, Ban } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useUser } from '@/lib/hooks/useUser'
import { PageLoader } from '@/components/shared/LoadingSpinner'

export default function AccountSettingsPage() {
  const { user, profile, loading } = useUser()

  if (loading) return <PageLoader />
  if (!profile) return null

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/settings/general" className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold">Account</h1>
      </div>

      <Card>
        <CardContent className="pt-4 divide-y">
          <Link href="/profile/edit" className="flex items-center justify-between py-3 hover:text-pink-500 transition-colors">
            <div className="flex items-center gap-3">
              <User className="h-5 w-5" />
              <span className="text-sm font-medium">Edit Profile</span>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
          <Link href="/saved" className="flex items-center justify-between py-3 hover:text-pink-500 transition-colors">
            <div className="flex items-center gap-3">
              <Bookmark className="h-5 w-5" />
              <span className="text-sm font-medium">Saved Posts</span>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
          <Link href="/liked" className="flex items-center justify-between py-3 hover:text-pink-500 transition-colors">
            <div className="flex items-center gap-3">
              <Heart className="h-5 w-5" />
              <span className="text-sm font-medium">Liked Videos</span>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
          <Link href="/settings/general/account/blocked" className="flex items-center justify-between py-3 hover:text-pink-500 transition-colors">
            <div className="flex items-center gap-3">
              <Ban className="h-5 w-5" />
              <span className="text-sm font-medium">Block List</span>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
          <div className="flex items-center justify-between py-3">
            <span className="text-sm font-medium">Email</span>
            <span className="text-sm text-muted-foreground">{user?.email}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
