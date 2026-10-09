import Link from 'next/link'
import { ChevronLeft, ChevronRight, Headset, FileText, ScrollText } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

const SUPPORT_LINKS = [
  { href: '/settings/support/contact', icon: Headset, title: 'Contact Support', desc: "Report a problem or ask us something" },
  { href: '/privacy-policy', icon: FileText, title: 'Privacy Policy', desc: 'How we handle your information' },
  { href: '/terms', icon: ScrollText, title: 'Terms & Conditions', desc: 'The rules for using SociaLens' },
]

export default function SupportPage() {
  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/settings" className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold">Support</h1>
      </div>

      <Card>
        <CardContent className="pt-4 divide-y">
          {SUPPORT_LINKS.map(({ href, icon: Icon, title, desc }) => (
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
    </div>
  )
}
