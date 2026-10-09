import Link from 'next/link'
import {
  ChevronLeft, ChevronRight, ShieldCheck, Bell,
  Image as ImageIcon, MessageCircle, Search, Users, Clock, MessageSquare,
  MessagesSquare, Phone, Circle,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

const PRIVACY_LINKS = [
  { href: '/settings/privacy/account', icon: ShieldCheck, title: 'Account Privacy', desc: 'Make your account private' },
  { href: '/settings/privacy/posts', icon: ImageIcon, title: 'Post Privacy', desc: 'Who can see your posts' },
  { href: '/settings/privacy/messages', icon: MessageCircle, title: 'Message Privacy', desc: 'Who can message you' },
  { href: '/settings/privacy/search', icon: Search, title: 'Search Result Privacy', desc: 'Who can find you in search' },
  { href: '/settings/privacy/suggestions', icon: Users, title: 'Suggestions Privacy', desc: 'Who sees you in suggestions' },
  { href: '/settings/privacy/story', icon: Clock, title: 'Story Privacy', desc: 'Who can see your story' },
  { href: '/settings/privacy/post-comments', icon: MessageSquare, title: 'Post Comment Privacy', desc: 'Who can see comments on your posts' },
  { href: '/settings/privacy/story-comments', icon: MessagesSquare, title: 'Story Comment Privacy', desc: 'Who can see comments on your story' },
  { href: '/settings/privacy/calls', icon: Phone, title: 'Call Privacy', desc: "Who can call you" },
  { href: '/settings/privacy/status', icon: Circle, title: 'Status Privacy', desc: 'Who can see when you\'re Active or Online' },
]

export default function PrivacySettingsPage() {
  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/settings" className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold">Privacy Settings</h1>
      </div>

      <Card>
        <CardContent className="pt-4 divide-y">
          {PRIVACY_LINKS.map(({ href, icon: Icon, title, desc }) => (
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
          <Link href="/settings/privacy/notifications" className="flex items-center justify-between py-3 hover:text-pink-500 transition-colors">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5" />
              <div>
                <span className="text-sm font-medium block">Notifications</span>
                <span className="text-xs text-muted-foreground">Choose what you get notified about</span>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </CardContent>
      </Card>
    </div>
  )
} 
