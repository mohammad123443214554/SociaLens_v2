'use client'

import { useRef, useState } from 'react'
import { X, ImagePlus, Video, Upload, Clock, ShieldCheck } from 'lucide-react'
import { PhotoStoryModal } from './PhotoStoryModal'
import { VideoStoryModal } from './VideoStoryModal'
import { useUser } from '@/lib/hooks/useUser'
import { isRestricted } from '@/lib/utils/restrictionCheck'
import { RestrictionPopup } from '@/components/shared/RestrictionPopup'

interface CreateStoryModalProps {
  userId: string
  onClose: () => void
}

type Step = 'select' | 'photo' | 'video'

export function CreateStoryModal({ userId, onClose }: CreateStoryModalProps) {
  const [step, setStep] = useState<Step>('select')
  const [initialFile, setInitialFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const { profile } = useUser()
  const restricted = isRestricted(profile?.restrict_story_until)

  if (step === 'photo' && initialFile && !restricted) {
    return <PhotoStoryModal key={initialFile.name + initialFile.lastModified} userId={userId} initialFile={initialFile} onClose={onClose} onBack={() => { setInitialFile(null); setStep('select') }} />
  }
  if (step === 'video' && initialFile && !restricted) {
    return <VideoStoryModal key={initialFile.name + initialFile.lastModified} userId={userId} initialFile={initialFile} onClose={onClose} onBack={() => { setInitialFile(null); setStep('select') }} />
  }

  if (restricted) {
    return <RestrictionPopup feature="posting stories" until={profile?.restrict_story_until} onClose={onClose} />
  }

  const chooseFile = (kind: 'photo' | 'video', file?: File) => {
    if (!file) return
    setFileError(null)
    const isPhoto = kind === 'photo' && file.type.startsWith('image/')
    const isVideo = kind === 'video' && file.type.startsWith('video/')
    if (!isPhoto && !isVideo) {
      setFileError(kind === 'photo' ? 'Please choose a supported image file.' : 'Please choose a supported video file.')
      return
    }
    setInitialFile(file)
    setStep(kind)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-border px-5 py-5 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pink-500">SociaLens Stories</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight">Create a story</h2>
            <p className="mt-1 text-sm text-muted-foreground">Choose a photo or video from your device.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6">
          <button onClick={() => photoInputRef.current?.click()} className="group rounded-2xl border border-border bg-background p-4 text-left transition hover:border-pink-500/60 hover:bg-pink-500/[0.04] focus:outline-none focus:ring-2 focus:ring-pink-500/40">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600 text-white shadow-sm"><ImagePlus className="h-6 w-6" /></div>
            <p className="font-semibold">Upload photo</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Add a song, text and your favourite font.</p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-pink-500">Choose photo <Upload className="h-3.5 w-3.5" /></span>
          </button>
          <button onClick={() => videoInputRef.current?.click()} className="group rounded-2xl border border-border bg-background p-4 text-left transition hover:border-blue-500/60 hover:bg-blue-500/[0.04] focus:outline-none focus:ring-2 focus:ring-blue-500/40">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-700 text-white shadow-sm"><Video className="h-6 w-6" /></div>
            <p className="font-semibold">Upload video</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Preview your clip, then share it to your story.</p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-500">Choose video <Upload className="h-3.5 w-3.5" /></span>
          </button>
        </div>
        {fileError && <p role="alert" className="px-5 pb-3 text-sm text-red-500 sm:px-6">{fileError}</p>}
        <div className="flex items-center justify-center gap-2 border-t border-border bg-muted/30 px-5 py-3 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Stories disappear after 24 hours <span className="mx-1 text-border">•</span><ShieldCheck className="h-3.5 w-3.5" /> Choose your audience before sharing</div>
        <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" className="hidden" onChange={(e) => { chooseFile('photo', e.target.files?.[0]); e.currentTarget.value = '' }} />
        <input ref={videoInputRef} type="file" accept="video/mp4,video/webm,video/quicktime,video/ogg,video/x-m4v" className="hidden" onChange={(e) => { chooseFile('video', e.target.files?.[0]); e.currentTarget.value = '' }} />
      </div>
    </div>
  )
}
