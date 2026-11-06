'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, Check, Play } from 'lucide-react'
import { RINGTONES, previewRingtone } from '@/lib/utils/ringtone'
import { useCallSettings, useUpdateCallSettings } from '@/lib/hooks/useChatSettings'

interface RingtoneSettingsPageProps { userId: string; onBack: () => void }

export function RingtoneSettingsPage({ userId, onBack }: RingtoneSettingsPageProps) {
  const { data: settings } = useCallSettings(userId)
  const updateSettings = useUpdateCallSettings()
  const [ringtone, setRingtone] = useState(settings?.ringtone)
  const [previewing, setPreviewing] = useState<string | null>(null)

  useEffect(() => { if (settings?.ringtone) setRingtone(settings.ringtone) }, [settings?.ringtone])

  const selectRingtone = (id: string) => {
    setRingtone(id)
    updateSettings.mutate({ userId, ringtone: id })
    setPreviewing(id)
    previewRingtone(id, settings?.volume ?? 1)
    window.setTimeout(() => setPreviewing((current) => current === id ? null : current), 1500)
  }

  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b sticky top-0 bg-background z-10">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/70 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-pink-500/40 hover:text-pink-400 sm:px-3 sm:py-2 sm:text-sm"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>
        <h1 className="font-bold text-base">Ringtone Setting</h1>
      </div>
      <div className="flex-1 overflow-y-auto w-full max-w-xl mx-auto p-4">
        <div className="rounded-2xl border bg-card divide-y overflow-hidden">
          {RINGTONES.map((item) => (
            <button key={item.id} type="button" onClick={() => selectRingtone(item.id)} className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-accent transition-colors">
              <span className="flex min-w-0 items-center gap-3"><span className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${previewing === item.id ? 'bg-pink-500 text-white' : 'bg-muted text-muted-foreground'}`}><Play className="h-3.5 w-3.5" /></span><span className="truncate text-sm font-medium">{item.name}</span></span>
              {ringtone === item.id && <Check className="h-4 w-4 text-pink-500 shrink-0" />}
            </button>
          ))}
        </div>
        <p className="mt-3 px-1 text-xs text-muted-foreground">Tap a ringtone to preview and select it. Adjust its volume from Volume Setting.</p>
      </div>
    </div>
  )
}
