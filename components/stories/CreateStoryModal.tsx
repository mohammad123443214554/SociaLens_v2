'use client'

import { useState } from 'react'
import { X, Type, ImageIcon, Video } from 'lucide-react'
import { TextStoryModal } from './TextStoryModal'
import { PhotoStoryModal } from './PhotoStoryModal'
import { VideoStoryModal } from './VideoStoryModal'
import { useUser } from '@/lib/hooks/useUser'
import { isRestricted } from '@/lib/utils/restrictionCheck'
import { RestrictionPopup } from '@/components/shared/RestrictionPopup'

interface CreateStoryModalProps {
  userId: string
  onClose: () => void
}

type Step = 'select' | 'text' | 'photo' | 'video'

export function CreateStoryModal({ userId, onClose }: CreateStoryModalProps) {
  const [step, setStep] = useState<Step>('select')
  const { profile } = useUser()
  const restricted = isRestricted(profile?.restrict_story_until)

  if (step === 'text' && !restricted) {
    return <TextStoryModal userId={userId} onClose={onClose} onBack={() => setStep('select')} />
  }
  if (step === 'photo' && !restricted) {
    return <PhotoStoryModal userId={userId} onClose={onClose} onBack={() => setStep('select')} />
  }
  if (step === 'video' && !restricted) {
    return <VideoStoryModal userId={userId} onClose={onClose} onBack={() => setStep('select')} />
  }

  if (restricted) {
    return <RestrictionPopup feature="posting stories" until={profile?.restrict_story_until} onClose={onClose} />
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[100] flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-2xl w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg">Create Story</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-2">
          <button
            onClick={() => setStep('text')}
            className="w-full flex items-center gap-3 p-3 rounded-xl border hover:border-pink-500/40 hover:bg-pink-500/5 transition-colors"
          >
            <div className="h-11 w-11 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shrink-0">
              <Type className="h-5 w-5 text-white" />
            </div>
            <div className="text-left">
              <p className="font-medium text-sm">Create a text story</p>
              <p className="text-xs text-muted-foreground">Share your thoughts with a colorful background</p>
            </div>
          </button>

          <button
            onClick={() => setStep('photo')}
            className="w-full flex items-center gap-3 p-3 rounded-xl border hover:border-pink-500/40 hover:bg-pink-500/5 transition-colors"
          >
            <div className="h-11 w-11 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center shrink-0">
              <ImageIcon className="h-5 w-5 text-white" />
            </div>
            <div className="text-left">
              <p className="font-medium text-sm">Create a photo story</p>
              <p className="text-xs text-muted-foreground">Upload a photo and add text on top</p>
            </div>
          </button>

          <button
            onClick={() => setStep('video')}
            className="w-full flex items-center gap-3 p-3 rounded-xl border hover:border-pink-500/40 hover:bg-pink-500/5 transition-colors"
          >
            <div className="h-11 w-11 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0">
              <Video className="h-5 w-5 text-white" />
            </div>
            <div className="text-left">
              <p className="font-medium text-sm">Create a video story</p>
              <p className="text-xs text-muted-foreground">Upload a video and add text on top</p>
            </div>
          </button>
        </div>

        <p className="text-[11px] text-muted-foreground text-center mt-4">Your story disappears after 24 hours</p>
      </div>
    </div>
  )
} 
