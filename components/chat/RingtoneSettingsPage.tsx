'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, Check, Pause, Play } from 'lucide-react'
import { RINGTONES, previewRingtone, stopRingtonePreview } from '@/lib/utils/ringtone'
import { useCallSettings, useUpdateCallSettings } from '@/lib/hooks/useChatSettings'

interface RingtoneSettingsPageProps { userId: string; onBack: () => void }

export function RingtoneSettingsPage({ userId, onBack }: RingtoneSettingsPageProps) {
  const { data: settings } = useCallSettings(userId)
  const updateSettings = useUpdateCallSettings()
  const [ringtone, setRingtone] = useState(settings?.ringtone ?? RINGTONES[0].id)
  const [previewing, setPreviewing] = useState<string | null>(null)

  useEffect(() => {
    if (settings?.ringtone) setRingtone(settings.ringtone)
  }, [settings?.ringtone])

  useEffect(() => () => stopRingtonePreview(), [])

  const chooseRingtone = (id: string) => {
    setRingtone(id)
    updateSettings.mutate({ userId, ringtone: id })
    setPreviewing(id)
    previewRingtone(id, settings?.volume ?? 1)
  }

  const togglePreview = (id: string) => {
    if (previewing === id) {
      stopRingtonePreview()
      setPreviewing(null)
      return
    }
    setPreviewing(id)
    previewRingtone(id, settings?.volume ?? 1)
  }

  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b sticky top-0 bg-background z-10">
        <button type="button" onClick={() => { stopRingtonePreview(); onBack() }} className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/70 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-pink-500/40 hover:text-pink-400 sm:px-3 sm:py-2 sm:text-sm"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>
        <h1 className="font-bold text-base">Ringtone Setting</h1>
      </div>
      <div className="flex-1 overflow-y-auto w-full max-w-xl mx-auto p-4">
        <div className="rounded-2xl border bg-card divide-y overflow-hidden">
          {RINGTONES.map((item) => {
            const selected = ringtone === item.id
            const playing = previewing === item.id
            return (
              <div key={item.id} className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${selected ? 'bg-pink-500/[0.06]' : 'hover:bg-accent'}`}>
                <button type="button" onClick={() => chooseRingtone(item.id)} className="flex min-w-0 flex-1 items-center gap-3 py-1 text-left" aria-pressed={selected}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">{item.id.slice(-2)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</span>
                  {selected && <Check className="h-4 w-4 shrink-0 text-pink-500" />}
                </button>
                <button type="button" onClick={() => togglePreview(item.id)} aria-label={playing ? `Stop ${item.name} preview` : `Play ${item.name} preview`} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${playing ? 'bg-pink-500 text-white' : 'bg-muted text-muted-foreground hover:bg-pink-500/10 hover:text-pink-500'}`}>
                  {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
              </div>
            )
          })}
        </div>
        <p className="mt-3 px-1 text-xs text-muted-foreground">Choose any ringtone to save it. Use the play button to preview; previews repeat continuously until stopped or you leave this page. Ringtone volume is controlled in Volume Setting.</p>
      </div>
    </div>
  )
}
