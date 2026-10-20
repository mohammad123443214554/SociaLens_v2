'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Loader2, Video, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCreateStory, DraftVideoScene } from '@/lib/hooks/useStories'
import { StoryAudienceModal } from './StoryAudienceModal'
import { LimitAlertDialog } from '@/components/shared/LimitAlertDialog'
import type { StoryVisibility } from '@/lib/types/database.types'
import { clearStoryDraft, saveStoryDraft, type StoryDraftRecord } from '@/lib/utils/storyDraft'

interface VideoStoryModalProps {
  userId: string
  onClose: () => void
  onBack: () => void
  initialFile?: File
  initialDraft?: StoryDraftRecord | null
}

const MAX_STORY_VIDEO_SECONDS = 5 * 60

export function VideoStoryModal({ userId, onClose, onBack, initialFile, initialDraft }: VideoStoryModalProps) {
  const [file, setFile] = useState<File | null>(initialFile || null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [duration, setDuration] = useState(initialDraft?.video?.duration ?? 0)
  const [showAudience, setShowAudience] = useState(false)
  const [showLimit, setShowLimit] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const replaceInput = useRef<HTMLInputElement>(null)
  const { createVideoStory } = useCreateStory()

  useEffect(() => {
    if (!file) { setPreviewUrl(null); setDuration(0); return }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  useEffect(() => {
    if (!file) return
    const draft: StoryDraftRecord = {
      userId, kind: 'video', file, fileName: file.name, fileType: file.type, lastModified: file.lastModified,
      video: { duration },
      updatedAt: Date.now(),
    }
    void saveStoryDraft(draft).catch(() => {})
  }, [userId, file, duration])

  const onVideoMetadata = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const seconds = event.currentTarget.duration
    if (!Number.isFinite(seconds) || seconds <= 0) {
      setError('This video could not be read. Please choose another video.')
      return
    }
    if (seconds > MAX_STORY_VIDEO_SECONDS) {
      setDuration(seconds)
      setShowLimit(true)
      setError('Videos must be 5 minutes or shorter.')
      return
    }
    setDuration(seconds)
    setError(null)
  }

  const onShare = () => {
    if (!file || !previewUrl) { setError('Choose a video before sharing your story.'); return }
    if (!duration || duration > MAX_STORY_VIDEO_SECONDS) { setError('Please choose a valid video that is 5 minutes or shorter.'); return }
    setError(null)
    setShowAudience(true)
  }

  const confirmShare = async (visibility: StoryVisibility, selectedIds: string[]) => {
    if (!file || !duration || duration > MAX_STORY_VIDEO_SECONDS || createVideoStory.isPending) return
    const scene: DraftVideoScene = {
      id: Math.random().toString(36).slice(2, 10),
      file,
      duration: Math.max(1, Math.round(duration)),
      overlayX: 50,
      overlayY: 50,
    }
    try {
      await createVideoStory.mutateAsync({ userId, scenes: [scene], visibility, visibilitySelectedIds: selectedIds })
      setShowAudience(false)
      await clearStoryDraft(userId).catch(() => {})
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? 'Could not publish your video story: ' + cause.message : 'Could not publish your video story. Please try again.')
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-3 sm:px-5">
        <button onClick={onBack} aria-label="Back to story upload choices" className="rounded-full p-2 hover:bg-muted"><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="text-sm font-semibold sm:text-base">Video story</h1>
        <button onClick={onClose} aria-label="Close story creator" className="rounded-full p-2 hover:bg-muted"><X className="h-5 w-5" /></button>
      </header>

      <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-auto p-3 sm:p-6">
        <div className="flex min-h-[220px] w-full max-w-sm items-center justify-center overflow-hidden rounded-2xl bg-black sm:max-h-[calc(100dvh-180px)]">
          {previewUrl ? (
            <video key={previewUrl} src={previewUrl} controls playsInline preload="metadata" onLoadedMetadata={onVideoMetadata} onError={() => setError('This video could not be played. Please choose another supported video file.')} className="max-h-[calc(100dvh-210px)] w-full object-contain" />
          ) : (
            <div className="p-8 text-center text-white/70"><Video className="mx-auto mb-2 h-10 w-10" /><p>No video selected</p></div>
          )}
        </div>
        <div className="w-full max-w-sm space-y-3">
          {file && <p className="truncate text-center text-sm text-muted-foreground">{file.name}{duration > 0 && duration <= MAX_STORY_VIDEO_SECONDS ? ' · ' + Math.round(duration) + ' sec' : ''}</p>}
          <div className="flex gap-2">
            <Button variant="outline" className="shrink-0" onClick={() => replaceInput.current?.click()}>Replace video</Button>
            <Button className="flex-1" onClick={onShare} disabled={!file || !duration || duration > MAX_STORY_VIDEO_SECONDS || createVideoStory.isPending}>
              {createVideoStory.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Publishing…</> : 'Share'}
            </Button>
          </div>
          <input ref={replaceInput} type="file" accept="video/*" className="hidden" onChange={(e) => { const next = e.target.files?.[0]; e.currentTarget.value = ''; if (next && next.type.startsWith('video/')) { setFile(next); setDuration(0); setError(null) } else if (next) setError('Please choose a supported video file.') }} />
          {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        </div>
      </main>

      {showAudience && <StoryAudienceModal userId={userId} isPending={createVideoStory.isPending} confirmLabel="Confirm Share" onClose={() => setShowAudience(false)} onConfirm={confirmShare} />}
      {showLimit && <LimitAlertDialog title="Video is too long" description="Story videos must be 5 minutes or shorter. Please choose a shorter clip." onClose={() => setShowLimit(false)} />}
    </div>
  )
}
