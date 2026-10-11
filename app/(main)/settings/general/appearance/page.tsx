'use client'

import Link from 'next/link'
import { useTheme } from 'next-themes'
import { ChevronLeft, Moon, Sun, Monitor } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', description: 'Use a bright appearance', icon: Sun },
  { value: 'dark', label: 'Dark', description: 'Use a dark appearance', icon: Moon },
  { value: 'system', label: 'System', description: 'Follow your device setting', icon: Monitor },
] as const

export default function AppearanceSettingsPage() {
  const { theme, setTheme, resolvedTheme } = useTheme()

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/settings/general" className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold">Appearance</h1>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-2">
          <h2 className="text-sm font-semibold">Theme</h2>
          <p className="text-sm text-muted-foreground">Choose how SociaLens looks across the app.</p>
          <div className="grid gap-2 pt-2">
            {THEME_OPTIONS.map(({ value, label, description, icon: Icon }) => {
              const selected = theme === value
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTheme(value)}
                  aria-pressed={selected}
                  className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    selected
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-background hover:bg-accent hover:text-accent-foreground'
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{label}</span>
                    <span className="block text-xs text-muted-foreground">{description}</span>
                  </span>
                  <span className={`h-4 w-4 rounded-full border-2 ${
                    selected ? 'border-primary bg-primary' : 'border-muted-foreground'
                  }`} aria-hidden="true" />
                </button>
              )
            })}
          </div>
          <p className="pt-2 text-xs text-muted-foreground">
            {theme === 'system'
              ? `Currently using ${resolvedTheme === 'dark' ? 'dark' : 'light'} appearance based on your device.`
              : `Your ${theme} appearance is applied throughout SociaLens.`}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
