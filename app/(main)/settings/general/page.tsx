import Link from 'next/link'
import { ChevronLeft, ChevronRight, User, Palette, Users, TriangleAlert } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

const GENERAL_LINKS = [
  { href: '/settings/general/account', icon: User, title: 'Account', desc: 'Edit profile, saved posts, liked videos, email' },
  { href: '/settings/general/appearance', icon: Palette, title: 'Appearance', desc: 'Dark mode and theme' },
  { href: '/settings/general/accounts', icon: Users, title: 'Multiple Accounts', desc: 'Switch between or add SociaLens accounts' },
]

export default function GeneralSettingsPage() {
  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/settings" className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold">General Settings</h1>
      </div>

      <Card>
        <CardContent className="pt-4 divide-y">
          {GENERAL_LINKS.map(({ href, icon: Icon, title, desc }) => (
            <Link key={href} href={href} className="flex items-center justify-between py-3 hover:text-pink-500 transition-colors">
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5" />
                <div>
                  <span className="text-sm font-medium block">{title}</span>
                  <span className="text-xs text-muted-foreground">{desc}</span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </CardContent>
      </Card>

      <Link
        href="/settings/general/danger-zone"
        className="flex items-center justify-between px-4 py-3 rounded-xl border border-red-500/30 bg-red-500/5 hover:bg-red-500/10 transition-colors"
      >
        <div className="flex items-center gap-3">
          <TriangleAlert className="h-5 w-5 text-red-500" />
          <div>
            <span className="text-sm font-medium block text-red-500">Danger Zone</span>
            <span className="text-xs text-muted-foreground">Account deletion and other irreversible actions</span>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-red-500/60" />
      </Link>
    </div>
  )
}
