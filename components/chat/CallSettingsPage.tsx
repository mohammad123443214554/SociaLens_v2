'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, Check, Play, Volume2, Volume1, VolumeX } from 'lucide-react'
import { RINGTONES, previewRingtone, stopRingtone } from '@/lib/utils/ringtone'
import { useCallSettings, useUpdateCallSettings } from '@/lib/hooks/useChatSettings'

interface CallSettingsPageProps {
  userId: string
  onBack: () => void
}

/**
 * Ringtone + call volume, same place for every chat (this is a per-user
 * setting, not per-conversation) - opened from "Call settings" inside any
 * chat's settings page.
 */
export function CallSettingsPage({ userId, onBack }: CallSettingsPageProps) {
  const { data: settings } = useCallSettings(userId)
  const updateSettings = useUpdateCallSettings()
  const [previewing, setPreviewing] = useState<string | null>(null)

  // Local, optimistic copies - the buttons/slider read from these instead
  // of straight off the fetched `settings`, so a tap updates the
  // checkmark and the volume readout instantly instead of waiting on a
  // network round trip (which was the "need to refresh" bug).
  const [ringtone, setRingtone] = useState<string | undefined>(settings?.ringtone)
  const [volume, setVolume] = useState(settings?.volume ?? 1)

  useEffect(() => {
    if (settings?.ringtone) setRingtone(settings.ringtone)
    if (settings?.volume !== undefined) setVolume(settings.volume)
  }, [settings?.ringtone, settings?.volume])

  const handleSelectRingtone = (id: string) => {
    setRingtone(id)
    updateSettings.mutate({ userId, ringtone: id })
    setPreviewing(id)
    previewRingtone(id, volume)
    setTimeout(() => setPreviewing(null), 1500)
  }

  const handleVolumeChange = (v: number) => {
    setVolume(v)
    updateSettings.mutate({ userId, volume: v })
  }

  const handleVolumeCommit = (v: number) => {
    if (ringtone) previewRingtone(ringtone, v)
  }

  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2

  return (
    <div className="absolute inset-0 bg-background z-30 flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b sticky top-0 bg-background z-10">
        <button onClick={() => { stopRingtone(); onBack() }} className="text-muted-foreground hover:text-foreground p-1 -ml-1">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="font-bold text-base">Call settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto max-w-xl w-full mx-auto p-4 space-y-4">
        {/* Volume */}
        <div className="rounded-2xl border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <VolumeIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Ringtone volume</span>
            <span className="ml-auto text-xs text-muted-foreground">{Math.round(volume * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={e => handleVolumeChange(Number(e.target.value))}
            onMouseUp={e => handleVolumeCommit(Number((e.target as HTMLInputElement).value))}
            onTouchEnd={e => handleVolumeCommit(Number((e.target as HTMLInputElement).value))}
            className="w-full accent-pink-500"
          />
          <p className="text-xs text-muted-foreground">
            This is how loud your ringtone plays for incoming and outgoing calls, like a normal phone's ringer volume.
          </p>
        </div>

        {/* Ringtone picker */}
        <div className="rounded-2xl border bg-card divide-y overflow-hidden">
          {RINGTONES.map(rt => (
            <button
              key={rt.id}
              onClick={() => handleSelectRingtone(rt.id)}
              className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-accent transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                  previewing === rt.id ? 'bg-pink-500 text-white' : 'bg-muted text-muted-foreground'
                }`}>
                  <Play className="h-3.5 w-3.5" />
                </div>
                <span className="text-sm font-medium">{rt.name}</span>
              </div>
              {ringtone === rt.id && <Check className="h-4 w-4 text-pink-500 shrink-0" />}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground px-1">
          Tap a ringtone to preview and set it. The same ringtone plays when you're calling someone (ringing...) and when someone is calling you.
        </p>
      </div>
    </div>
  )
}
