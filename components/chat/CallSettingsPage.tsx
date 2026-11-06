'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, Check, Headphones, Mic, Music2, Pause, Play, Volume2 } from 'lucide-react'
import { RINGTONES, previewRingtone, stopRingtonePreview } from '@/lib/utils/ringtone'
import { useCallSettings, useUpdateCallSettings } from '@/lib/hooks/useChatSettings'

interface CallSettingsPageProps {
  userId: string
  onBack: () => void
}

function VolumeSlider({ label, description, value, max = 100, icon: Icon, onChange }: {
  label: string
  description: string
  value: number
  max?: number
  icon: typeof Volume2
  onChange: (value: number) => void
}) {
  return (
    <section className="px-4 py-4 space-y-3">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">{label}</h3>
            <span className="text-sm tabular-nums text-muted-foreground">{value}%</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
      <input type="range" min={0} max={max} step={1} value={value} onChange={(event) => onChange(Number(event.target.value))} aria-label={label} className="w-full cursor-pointer accent-pink-500" />
      <div className="flex justify-between text-[11px] text-muted-foreground"><span>0%</span><span>{max}%</span></div>
    </section>
  )
}

export function CallSettingsPage({ userId, onBack }: CallSettingsPageProps) {
  const { data: settings } = useCallSettings(userId)
  const updateSettings = useUpdateCallSettings()
  const [outputVolume, setOutputVolume] = useState(settings?.outputVolume ?? 100)
  const [inputVolume, setInputVolume] = useState(settings?.inputVolume ?? 100)
  const [ringtoneVolume, setRingtoneVolume] = useState(Math.round((settings?.volume ?? 1) * 100))
  const [ringtone, setRingtone] = useState(settings?.ringtone ?? RINGTONES[0].id)
  const [previewing, setPreviewing] = useState<string | null>(null)

  useEffect(() => {
    if (!settings) return
    setOutputVolume(settings.outputVolume)
    setInputVolume(settings.inputVolume)
    setRingtoneVolume(Math.round(settings.volume * 100))
    setRingtone(settings.ringtone ?? RINGTONES[0].id)
  }, [settings?.outputVolume, settings?.inputVolume, settings?.volume, settings?.ringtone])

  useEffect(() => () => stopRingtonePreview(), [])

  const save = (values: { outputVolume?: number; inputVolume?: number; volume?: number; ringtone?: string }) => {
    updateSettings.mutate({ userId, ...values })
  }

  const chooseRingtone = (id: string) => {
    setRingtone(id)
    save({ ringtone: id })
    setPreviewing(id)
    previewRingtone(id, ringtoneVolume / 100)
  }

  const togglePreview = (id: string) => {
    if (previewing === id) {
      stopRingtonePreview()
      setPreviewing(null)
      return
    }
    setPreviewing(id)
    previewRingtone(id, ringtoneVolume / 100)
  }

  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b sticky top-0 bg-background z-10">
        <button type="button" onClick={() => { stopRingtonePreview(); onBack() }} className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/70 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-pink-500/40 hover:text-pink-400 sm:px-3 sm:py-2 sm:text-sm">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <h1 className="font-bold text-base">Call Setting</h1>
      </div>

      <div className="flex-1 overflow-y-auto w-full max-w-xl mx-auto p-4">
        <div className="space-y-4">
        <div className="rounded-2xl border bg-card divide-y overflow-hidden">
          <div className="px-4 py-3 bg-muted/20">
            <div className="flex items-center gap-2"><Volume2 className="h-4 w-4 text-muted-foreground" /><h2 className="text-sm font-semibold">Volume</h2></div>
            <p className="mt-1 text-xs text-muted-foreground">Manage call audio levels for all four call types.</p>
          </div>
          <VolumeSlider label="Output Volume" description="Controls how loudly you hear other people in voice and video calls." value={outputVolume} icon={Headphones} onChange={(value) => { setOutputVolume(value); save({ outputVolume: value }) }} />
          <VolumeSlider label="Input Volume" description="Controls the microphone level sent to other people in all call types." value={inputVolume} max={200} icon={Mic} onChange={(value) => { setInputVolume(value); save({ inputVolume: value }) }} />
          <VolumeSlider label="Ringtone Volume" description="Controls ringtone loudness for incoming calls and outgoing ringing." value={ringtoneVolume} icon={Music2} onChange={(value) => { setRingtoneVolume(value); save({ volume: value / 100 }); if (previewing) previewRingtone(previewing, value / 100) }} />

        </div>
        <div className="rounded-2xl border bg-card divide-y overflow-hidden">
          <div className="px-4 py-3 bg-muted/20">
            <div className="flex items-center gap-2"><Music2 className="h-4 w-4 text-muted-foreground" /><h2 className="text-sm font-semibold">Ringtones</h2><span className="ml-auto text-xs text-muted-foreground">50 tones</span></div>
            <p className="mt-1 text-xs text-muted-foreground">Choose your ringtone. Tap the play icon to preview it.</p>
          </div>
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
          <p className="px-4 py-3 text-xs text-muted-foreground">Your selected ringtone and volume preferences are saved to your account and apply across normal voice, group voice, normal video and group video calls. Previews repeat continuously until stopped or you leave this page.</p>
        </div>
        </div>
      </div>
    </div>
  )
}
