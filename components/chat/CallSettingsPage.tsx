'use client'

import { ArrowLeft, ChevronRight, Music2, Volume2 } from 'lucide-react'

interface CallSettingsPageProps {
  onBack: () => void
  onOpenVolume: () => void
  onOpenRingtone: () => void
}

export function CallSettingsPage({ onBack, onOpenVolume, onOpenRingtone }: CallSettingsPageProps) {
  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b sticky top-0 bg-background z-10">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/70 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-pink-500/40 hover:text-pink-400 sm:px-3 sm:py-2 sm:text-sm">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <h1 className="font-bold text-base">Call Setting</h1>
      </div>
      <div className="flex-1 w-full max-w-xl mx-auto p-4">
        <div className="rounded-2xl border bg-card divide-y overflow-hidden">
          <button type="button" onClick={onOpenVolume} className="w-full flex items-center justify-between px-4 py-4 text-left hover:bg-accent transition-colors">
            <span className="flex items-center gap-3"><Volume2 className="h-5 w-5 text-muted-foreground" /><span className="text-sm font-medium">Volume</span></span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
          <button type="button" onClick={onOpenRingtone} className="w-full flex items-center justify-between px-4 py-4 text-left hover:bg-accent transition-colors">
            <span className="flex items-center gap-3"><Music2 className="h-5 w-5 text-muted-foreground" /><span className="text-sm font-medium">Ringtone</span></span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>
    </div>
  )
}
