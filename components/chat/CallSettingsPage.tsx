'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, ChevronRight, Headphones, Loader2, Mic, Music2, Pause, Play, Upload, Volume2, X } from 'lucide-react'
import { CALL_RINGTONE_BUCKET, CUSTOM_RINGTONE_PREFIX, DEFAULT_RINGTONE_ID, RINGTONES, getCustomRingtonePath, isCustomRingtoneId, preloadRingtone, previewRingtone, stopRingtonePreview } from '@/lib/utils/ringtone'
import { useCallSettings, useUpdateCallSettings } from '@/lib/hooks/useChatSettings'
import { createClient } from '@/lib/supabase/client'

interface CallSettingsPageProps {
  userId: string
  onBack: () => void
}

const MAX_CUSTOM_RINGTONE_BYTES = 10 * 1024 * 1024
const CUSTOM_AUDIO_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  webm: 'audio/webm',
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
    <section className="space-y-3 px-4 py-4">
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
  const [supabase] = useState(() => createClient())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [outputVolume, setOutputVolume] = useState(settings?.outputVolume ?? 100)
  const [inputVolume, setInputVolume] = useState(settings?.inputVolume ?? 100)
  const [ringtoneVolume, setRingtoneVolume] = useState(Math.round((settings?.volume ?? 1) * 100))
  const [ringtone, setRingtone] = useState(settings?.ringtone ?? DEFAULT_RINGTONE_ID)
  const [previewing, setPreviewing] = useState<string | null>(null)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [selectedAudioFile, setSelectedAudioFile] = useState<File | null>(null)
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!settings) return
    setOutputVolume(settings.outputVolume)
    setInputVolume(settings.inputVolume)
    setRingtoneVolume(Math.round(settings.volume * 100))
    setRingtone(settings.ringtone ?? DEFAULT_RINGTONE_ID)
  }, [settings?.outputVolume, settings?.inputVolume, settings?.volume, settings?.ringtone])

  useEffect(() => () => stopRingtonePreview(), [])
  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl)
    }
  }, [filePreviewUrl])

  const save = (values: { outputVolume?: number; inputVolume?: number; volume?: number; ringtone?: string }) => {
    updateSettings.mutate({ userId, ...values })
  }

  const togglePreview = (id: string) => {
    setSettingsMessage(null)
    if (previewing === id) {
      stopRingtonePreview()
      setPreviewing(null)
      return
    }
    setPreviewing(id)
    previewRingtone(id, ringtoneVolume / 100)
  }

  const removePreviousCustomFile = async (previousRingtone: string, nextRingtone: string) => {
    const previousPath = getCustomRingtonePath(previousRingtone)
    if (!previousPath || previousRingtone === nextRingtone) return
    const { error } = await supabase.storage.from(CALL_RINGTONE_BUCKET).remove([previousPath])
    if (error) console.warn('[SociaLens ringtone] previous custom sound could not be removed:', error.message)
  }

  const chooseRingtone = async (id: string) => {
    const previousRingtone = ringtone
    setRingtone(id)
    setSettingsMessage(null)
    try {
      await updateSettings.mutateAsync({ userId, ringtone: id })
      stopRingtonePreview()
      setPreviewing(null)
      await removePreviousCustomFile(previousRingtone, id)
      setPreviewing(id)
      previewRingtone(id, ringtoneVolume / 100)
    } catch (error) {
      setRingtone(previousRingtone)
      setSettingsMessage(error instanceof Error ? error.message : 'Could not save this ringtone. Please try again.')
    }
  }

  const openUploadModal = () => {
    stopRingtonePreview()
    setPreviewing(null)
    setSelectedAudioFile(null)
    setFilePreviewUrl(null)
    setUploadError(null)
    setUploadModalOpen(true)
  }

  const closeUploadModal = () => {
    if (uploading) return
    setUploadModalOpen(false)
    setSelectedAudioFile(null)
    setFilePreviewUrl(null)
    setUploadError(null)
  }

  const handleAudioFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0] ?? null
    event.target.value = ''
    if (!picked) return

    const extension = picked.name.split('.').pop()?.toLowerCase() || ''
    if (!CUSTOM_AUDIO_TYPES[extension]) {
      setSelectedAudioFile(null)
      setFilePreviewUrl(null)
      setUploadError('Choose an MP3, WAV, M4A, AAC, OGG or WEBM audio file.')
      return
    }
    if (picked.size > MAX_CUSTOM_RINGTONE_BYTES) {
      setSelectedAudioFile(null)
      setFilePreviewUrl(null)
      setUploadError('The audio file must be 10 MB or smaller.')
      return
    }
    if (picked.size === 0) {
      setSelectedAudioFile(null)
      setFilePreviewUrl(null)
      setUploadError('This audio file is empty. Choose another file.')
      return
    }

    setUploadError(null)
    setSelectedAudioFile(picked)
    setFilePreviewUrl(URL.createObjectURL(picked))
  }

  const uploadCustomRingtone = async () => {
    if (!selectedAudioFile || uploading) return
    const extension = selectedAudioFile.name.split('.').pop()?.toLowerCase() || ''
    const contentType = CUSTOM_AUDIO_TYPES[extension]
    if (!contentType) {
      setUploadError('This audio format is not supported.')
      return
    }

    setUploading(true)
    setUploadError(null)
    const previousRingtone = ringtone
    const originalName = selectedAudioFile.name.split(/[\\/]/).pop() || ('custom-ringtone.' + extension)
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-72) || ('custom-ringtone.' + extension)
    const uniqueId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : String(Date.now()) + '-' + Math.random().toString(36).slice(2)
    const storagePath = userId + '/' + Date.now() + '-' + uniqueId + '-' + safeName
    const normalizedFile = new File([selectedAudioFile], safeName, { type: contentType })

    try {
      const { error: uploadStorageError } = await supabase.storage
        .from(CALL_RINGTONE_BUCKET)
        .upload(storagePath, normalizedFile, {
          cacheControl: '3600',
          contentType,
          upsert: false,
        })
      if (uploadStorageError) throw uploadStorageError

      const customRingtoneId = CUSTOM_RINGTONE_PREFIX + storagePath
      try {
        await updateSettings.mutateAsync({ userId, ringtone: customRingtoneId })
      } catch (saveError) {
        await supabase.storage.from(CALL_RINGTONE_BUCKET).remove([storagePath])
        throw saveError
      }

      setRingtone(customRingtoneId)
      // Decode the uploaded sound before closing the upload flow so the
      // preview and the next call can start without a network wait.
      await preloadRingtone(customRingtoneId)
      stopRingtonePreview()
      setPreviewing(customRingtoneId)
      previewRingtone(customRingtoneId, ringtoneVolume / 100)
      await removePreviousCustomFile(previousRingtone, customRingtoneId)
      setSettingsMessage('Your uploaded ringtone is now selected for all call types.')
      setUploadModalOpen(false)
      setSelectedAudioFile(null)
      setFilePreviewUrl(null)
    } catch (error) {
      console.error('[SociaLens ringtone] custom ringtone upload failed:', error)
      setUploadError(error instanceof Error ? error.message : 'Could not upload your ringtone. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  const customRingtoneSelected = isCustomRingtoneId(ringtone)

  return (
    <div className="flex min-h-[100dvh] w-full flex-col bg-background">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background px-4 py-3">
        <button type="button" onClick={() => { stopRingtonePreview(); onBack() }} className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/70 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-pink-500/40 hover:text-pink-400 sm:px-3 sm:py-2 sm:text-sm">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <h1 className="text-base font-bold">Call Setting</h1>
      </div>

      <div className="mx-auto w-full max-w-xl flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border bg-card">
            <div className="border-b bg-muted/20 px-4 py-3">
              <div className="flex items-center gap-2"><Volume2 className="h-4 w-4 text-muted-foreground" /><h2 className="text-sm font-semibold">Volume</h2></div>
              <p className="mt-1 text-xs text-muted-foreground">Manage call audio levels for all four call types.</p>
            </div>
            <div className="divide-y">
              <VolumeSlider label="Output Volume" description="Controls how loudly you hear other people in voice and video calls." value={outputVolume} icon={Headphones} onChange={(value) => { setOutputVolume(value); save({ outputVolume: value }) }} />
              <VolumeSlider label="Input Volume" description="Controls the microphone level sent to other people in all call types." value={inputVolume} max={200} icon={Mic} onChange={(value) => { setInputVolume(value); save({ inputVolume: value }) }} />
              <VolumeSlider label="Ringtone Volume" description="Controls ringtone loudness for incoming calls and outgoing ringing." value={ringtoneVolume} icon={Music2} onChange={(value) => { setRingtoneVolume(value); save({ volume: value / 100 }); if (previewing) previewRingtone(previewing, value / 100) }} />
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border bg-card">
            <div className="flex items-center gap-2">
              <button type="button" onClick={openUploadModal} className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent">
                <span className="flex min-w-0 items-center gap-3">
                  <Upload className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">Set Custom Ringtone</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{customRingtoneSelected ? 'Your uploaded ringtone is active for all calls.' : 'Upload your own sound for voice and video calls.'}</span>
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
              {customRingtoneSelected && (
                <button type="button" onClick={() => togglePreview(ringtone)} aria-label={previewing === ringtone ? 'Stop custom ringtone preview' : 'Preview custom ringtone'} className={'mr-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ' + (previewing === ringtone ? 'bg-pink-500 text-white' : 'bg-muted text-muted-foreground hover:bg-pink-500/10 hover:text-pink-500')}>
                  {previewing === ringtone ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
              )}
            </div>
          </div>

          {settingsMessage && <p role="status" className="rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">{settingsMessage}</p>}

          <div className="overflow-hidden rounded-2xl border bg-card">
            <div className="border-b bg-muted/20 px-4 py-3">
              <div className="flex items-center gap-2"><Music2 className="h-4 w-4 text-muted-foreground" /><h2 className="text-sm font-semibold">Ringtones</h2><span className="ml-auto text-xs text-muted-foreground">50 tones</span></div>
              <p className="mt-1 text-xs text-muted-foreground">Choose your ringtone. Tap the play icon to preview it.</p>
            </div>
            {RINGTONES.map((item) => {
              const selected = ringtone === item.id
              const playing = previewing === item.id
              return (
                <div key={item.id} className={'flex items-center gap-3 border-b border-border/80 px-3 py-2.5 transition-colors last:border-b-0 ' + (selected ? 'bg-pink-500/[0.06]' : 'hover:bg-accent')}>
                  <button type="button" onClick={() => void chooseRingtone(item.id)} className="flex min-w-0 flex-1 items-center gap-3 py-1 text-left" aria-pressed={selected}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">{item.id.slice(-2)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</span>
                    {selected && <Check className="h-4 w-4 shrink-0 text-pink-500" />}
                  </button>
                  <button type="button" onClick={() => togglePreview(item.id)} aria-label={playing ? 'Stop ' + item.name + ' preview' : 'Play ' + item.name + ' preview'} className={'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ' + (playing ? 'bg-pink-500 text-white' : 'bg-muted text-muted-foreground hover:bg-pink-500/10 hover:text-pink-500')}>
                    {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </button>
                </div>
              )
            })}
            <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">Your selected ringtone and volume preferences are saved to your account and apply across normal voice, group voice, normal video and group video calls. Previews repeat continuously until stopped or you leave this page.</p>
          </div>
        </div>
      </div>

      {uploadModalOpen && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeUploadModal() }}>
          <section role="dialog" aria-modal="true" aria-labelledby="custom-ringtone-title" aria-describedby="custom-ringtone-description" className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
              <div className="flex items-center gap-2">
                <Music2 className="h-5 w-5 text-pink-500" />
                <h2 id="custom-ringtone-title" className="text-base font-semibold">Set Custom Ringtone</h2>
              </div>
              <button type="button" onClick={closeUploadModal} disabled={uploading} aria-label="Close upload dialog" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4 p-4">
              <p id="custom-ringtone-description" className="text-sm text-muted-foreground">Upload a sound from your device. It will be saved privately to your account and used for incoming and outgoing voice and video calls on your signed-in devices.</p>
              <input ref={fileInputRef} type="file" accept=".mp3,.wav,.m4a,.mp4,.aac,.ogg,.webm,audio/*" className="hidden" onChange={handleAudioFileChange} />
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-4 text-sm font-medium transition-colors hover:border-pink-500/60 hover:bg-pink-500/5 disabled:opacity-50">
                <Upload className="h-4 w-4 text-pink-500" />
                {selectedAudioFile ? 'Choose a different audio file' : 'Choose audio file'}
              </button>

              {selectedAudioFile && filePreviewUrl && (
                <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Music2 className="h-4 w-4 shrink-0 text-pink-500" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{selectedAudioFile.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{(selectedAudioFile.size / (1024 * 1024)).toFixed(2)} MB</span>
                  </div>
                  <audio src={filePreviewUrl} controls loop preload="metadata" className="w-full" />
                </div>
              )}

              <p className="text-xs text-muted-foreground">Supported formats: MP3, WAV, M4A, AAC, OGG and WEBM. Maximum file size: 10 MB.</p>
              {uploadError && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500">{uploadError}</p>}
            </div>
            <div className="flex gap-3 border-t border-border p-4">
              <button type="button" onClick={closeUploadModal} disabled={uploading} className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50">Cancel</button>
              <button type="button" onClick={() => void uploadCustomRingtone()} disabled={!selectedAudioFile || uploading} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {uploading ? 'Uploading…' : 'Save ringtone'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
