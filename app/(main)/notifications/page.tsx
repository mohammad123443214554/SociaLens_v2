'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Bell, Search, Trash2, X } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { VerifiedBadge } from '@/components/shared/VerifiedBadge'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { PageLoader } from '@/components/shared/LoadingSpinner'
import { formatTimeAgo, getAvatarUrl, cn } from '@/lib/utils/helpers'
import { useNotifications, getNotifText, getNotifLink, AppNotification } from '@/lib/hooks/useNotifications'

// A proper, dedicated full-screen Notifications page - replaces the old
// small dropdown popup so there's room for a real header, a back button,
// and a search box to find an older notification, instead of a cramped
// 320px-wide list.
export default function NotificationsPage() {
  const router = useRouter()
  const { notifications, unreadCount, loading, markAllRead, clearAll } = useNotifications({ notifyNative: false })
  const [query, setQuery] = useState('')
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  // Opening this page is what actually clears the "unread" state, same
  // as opening the old dropdown used to.
  useEffect(() => {
    if (unreadCount > 0) markAllRead()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadCount > 0])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return notifications
    return notifications.filter((n: AppNotification) => {
      const text = getNotifText(n).toLowerCase()
      const username = n.actor?.username?.toLowerCase() ?? ''
      return username.includes(q) || text.includes(q)
    })
  }, [notifications, query])

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
        <div className="max-w-2xl mx-auto flex items-center gap-3 px-4 h-14">
          <button onClick={() => router.back()} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="font-semibold flex-1">Notifications</span>
          {notifications.length > 0 && (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear all
            </button>
          )}
        </div>

        <div className="max-w-2xl mx-auto px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notifications"
              className="w-full h-10 pl-9 pr-9 rounded-xl border bg-muted/40 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/30 focus:bg-background transition-colors"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto">
        {loading ? (
          <PageLoader />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-24 text-muted-foreground px-4 text-center">
            <Bell className="h-10 w-10 opacity-30" />
            <p className="text-sm">
              {query ? `No notifications match "${query}".` : 'No notifications yet'}
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((n) => (
              <Link
                key={n.id}
                href={getNotifLink(n)}
                className={cn('flex items-start gap-3 px-4 py-3.5 hover:bg-accent transition-colors', !n.is_read && 'bg-primary/5')}
              >
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarImage src={getAvatarUrl(n.actor?.avatar_url)} />
                  <AvatarFallback>{n.actor?.username?.[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-snug">
                    <span className="font-semibold">{n.actor?.username}</span>
                    {n.actor?.is_verified && <VerifiedBadge type={n.actor.verification_type} className="text-xs mx-1" />}
                    {' '}<span className="text-muted-foreground">{getNotifText(n)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{formatTimeAgo(n.created_at)}</p>
                </div>
                {!n.is_read && <div className="h-2 w-2 rounded-full bg-pink-500 shrink-0 mt-1.5" />}
              </Link>
            ))}
          </div>
        )}
      </main>

      {showClearConfirm && (
        <ConfirmDialog
          title="Clear all notifications?"
          description="This can't be undone. All of your notifications will be permanently removed."
          confirmLabel="Clear all"
          onCancel={() => setShowClearConfirm(false)}
          onConfirm={() => { setShowClearConfirm(false); clearAll() }}
        />
      )}
    </div>
  )
}
