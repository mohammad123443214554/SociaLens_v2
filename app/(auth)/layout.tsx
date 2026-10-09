import { GuestGuard } from '@/components/shared/AuthGuard'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <GuestGuard>
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 via-purple-50 to-cyan-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 p-4">
        {children}
      </div>
    </GuestGuard>
  )
}
