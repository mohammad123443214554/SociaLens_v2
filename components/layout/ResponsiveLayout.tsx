'use client'

import { usePathname } from 'next/navigation'
import { Navbar } from './Navbar'
import { Sidebar } from './Sidebar'
import { MobileBottomNav } from './MobileBottomNav'
import { BackButton } from './BackButton'
import { CallProvider } from '@/components/call/CallProvider'
import { GlobalToast } from '@/components/shared/GlobalToast'

export function ResponsiveLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  // On phones only, an open conversation or the Aperonix chatbot should
  // take the whole screen the way every other chat app does - the top
  // navbar and bottom tab bar were eating into already-tight space there.
  // Desktop has plenty of room, so it keeps the normal chrome around it.
  // /chat/archive is a static page, NOT a chat thread - it must not match
  // the /chat/[chatId] pattern below, or the navbar disappears on mobile
  // there too and the page's own sticky header ends up overlapping its
  // first list item (there's no more navbar height for it to stick under).
  const isImmersivePage =
    (/^\/chat\/[^/]+$/.test(pathname || '') && pathname !== '/chat/archive') ||
    pathname === '/aperonix' || pathname === '/reels'

  return (
    <CallProvider>
      <div className="min-h-screen bg-background">
        <Navbar className={isImmersivePage ? 'hidden lg:block' : undefined} />
        <div className="flex">
          <Sidebar />
          <main className={`flex-1 min-w-0 ${isImmersivePage ? 'pb-0 lg:pb-0' : 'pb-16 lg:pb-0'}`}>
            {children}
          </main>
        </div>
        <MobileBottomNav className={isImmersivePage ? 'hidden' : undefined} />
        <BackButton />
        <GlobalToast />
      </div>
    </CallProvider>
  )
}
