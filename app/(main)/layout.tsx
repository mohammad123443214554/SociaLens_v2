import { AuthGuard } from '@/components/shared/AuthGuard'
import { ResponsiveLayout } from '@/components/layout/ResponsiveLayout'
import { PresenceProvider } from '@/lib/contexts/PresenceContext'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <PresenceProvider>
        <ResponsiveLayout>{children}</ResponsiveLayout>
      </PresenceProvider>
    </AuthGuard>
  )
}
