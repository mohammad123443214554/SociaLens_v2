'use client'

import { Bell } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useNotifications } from '@/lib/hooks/useNotifications'

// Just the bell icon + unread badge that lives in the navbar. Tapping it
// takes you to the full /notifications page (see app/(main)/notifications)
// instead of opening a small dropdown - this instance stays mounted across
// every page (it lives in the persistent Navbar) so it's what keeps the
// badge count and native/background notifications up to date at all times.
export function NotificationPanel() {
  const router = useRouter()
  const { unreadCount } = useNotifications({ notifyNative: true })

  return (
    <button
      onClick={() => router.push('/notifications')}
      className="relative p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
    >
      <Bell className="h-5 w-5" />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  )
}
