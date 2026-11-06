'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, Headphones, Mic, Music2, Volume2 } from 'lucide-react'
import { useCallSettings, useUpdateCallSettings } from '@/lib/hooks/useChatSettings'

interface VolumeSettingsPageProps { userId: string; onBack: () => void }

function VolumeSlider({ label, description, value, min = 0, max = 100, icon: Icon, onChange }: {
  label: string; description: string; value: number; min?: number; max?: number
  icon: typeof Volume2; onChange: (value: number) => void
}) {
  return (
    <section className="rounded-2xl border bg-card p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">{label}</h2><span className="text-sm tabular-nums text-muted-foreground">{value}%</span></div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
      <input type="range" min={min} max={max} step="1" value={value} onChange={(event) => onChange(Number(event.target.value))} aria-label={label} className="w-full cursor-pointer accent-pink-500" />
      <div className="flex justify-between text-[11px] text-muted-foreground"><span>{min}%</span><span>{max}%</span></div>
    </section>
  )
}

export function VolumeSettingsPage({ userId, onBack }: VolumeSettingsPageProps) {
  const { data: settings } = useCallSettings(userId)
  const updateSettings = useUpdateCallSettings()
  const [outputVolume, setOutputVolume] = useState(settings?.outputVolume ?? 100)
  const [inputVolume, setInputVolume] = useState(settings?.inputVolume ?? 100)
  const [ringtoneVolume, setRingtoneVolume] = useState(Math.round((settings?.volume ?? 1) * 100))

  useEffect(() => {
    if (!settings) return
    setOutputVolume(settings.outputVolume)
    setInputVolume(settings.inputVolume)
    setRingtoneVolume(Math.round(settings.volume * 100))
  }, [settings?.outputVolume, settings?.inputVolume, settings?.volume])

  const save = (values: { outputVolume?: number; inputVolume?: number; volume?: number }) => updateSettings.mutate({ userId, ...values })

  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b sticky top-0 bg-background z-10">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/70 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-pink-500/40 hover:text-pink-400 sm:px-3 sm:py-2 sm:text-sm"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>
        <h1 className="font-bold text-base">Volume Setting</h1>
      </div>
      <div className="flex-1 overflow-y-auto w-full max-w-xl mx-auto p-4 space-y-4">
        <VolumeSlider label="Output Volume" description="Controls how loudly you hear other people in normal voice, group voice, normal video and group video calls." value={outputVolume} icon={Headphones} onChange={(value) => { setOutputVolume(value); save({ outputVolume: value }) }} />
        <VolumeSlider label="Input Volume" description="Controls the microphone level sent to other people in all four call types. 100% is the normal microphone level." value={inputVolume} max={200} icon={Mic} onChange={(value) => { setInputVolume(value); save({ inputVolume: value }) }} />
        <VolumeSlider label="Ringtone Volume" description="Controls ringtone loudness for incoming calls and outgoing ringing." value={ringtoneVolume} icon={Music2} onChange={(value) => { setRingtoneVolume(value); save({ volume: value / 100 }) }} />
        <p className="px-1 text-xs text-muted-foreground">These preferences are saved to your account and apply across your devices.</p>
      </div>
    </div>
  )
}
