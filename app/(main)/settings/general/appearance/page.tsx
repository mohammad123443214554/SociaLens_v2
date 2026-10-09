'use client'

import Link from 'next/link'
import { useTheme } from 'next-themes'
import { ChevronLeft, Moon, Sun } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'

export default function AppearanceSettingsPage() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/settings/general" className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold">Appearance</h1>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-3">
              {theme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
              <span className="text-sm font-medium">Dark Mode</span>
            </div>
            <Switch checked={theme === 'dark'} onCheckedChange={checked => setTheme(checked ? 'dark' : 'light')} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
