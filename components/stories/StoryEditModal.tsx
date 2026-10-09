'use client'

import { useState } from 'react'
import { X, Loader2, Globe, Users, UserCheck, ListChecks, Check } from 'lucide-react'
import { useUpdateStory } from '@/lib/hooks/useStories'
import { StoryAudienceModal } from './StoryAudienceModal'
import type { StoryWithProfile, StoryVisibility, TextScene, PhotoScene, VideoScene } from '@/lib/types/database.types'

interface StoryEditModalProps {
  story: StoryWithProfile
  onClose: () => void
}

const AUDIENCE_LABEL: Record<StoryVisibility, { label: string; icon: typeof Globe }> = {
  everyone: { label: 'Everyone', icon: Globe },
  followers: { label: 'Followers', icon: Users },
  following: { label: 'Following', icon: UserCheck },
  selected: { label: 'Selected people', icon: ListChecks },
}

// Reached from a story's 3-dot menu -> "Edit". Editing the underlying photo
// or video itself isn't supported (that stays a delete-and-repost flow) -
// This covers the text layered on top of it, and who can see it.
export function StoryEditModal({ story, onClose }: StoryEditModalProps) {
  const updateStory = useUpdateStory()
  const [showAudiencePicker, setShowAudiencePicker] = useState(false)
  const [visibility, setVisibility] = useState<StoryVisibility>(story.visibility || 'everyone')
  const [selectedIds, setSelectedIds] = useState<string[]>(story.visibility_selected_ids || [])

  const [textScenes, setTextScenes] = useState<TextScene[] | null>(story.text_scenes ? structuredClone(story.text_scenes) : null)
  const [photoScenes, setPhotoScenes] = useState<PhotoScene[] | null>(story.photo_scenes ? structuredClone(story.photo_scenes) : null)
  const [videoScenes, setVideoScenes] = useState<VideoScene[] | null>(story.video_scenes ? structuredClone(story.video_scenes) : null)
  const [legacyText, setLegacyText] = useState(story.text_content || '')
  const [legacyOverlay, setLegacyOverlay] = useState(story.overlay_text || '')

  const AudienceIcon = AUDIENCE_LABEL[visibility].icon

  const handleSave = async () => {
    try {
      await updateStory.mutateAsync({
        storyId: story.id,
        text: story.story_type === 'text' && !textScenes ? legacyText : undefined,
        overlayText: story.story_type !== 'text' && !photoScenes && !videoScenes ? legacyOverlay : undefined,
        textScenes: textScenes || undefined,
        photoScenes: photoScenes || undefined,
        videoScenes: videoScenes || undefined,
        visibility,
        visibilitySelectedIds: selectedIds,
      })
      onClose()
    } catch {
      // surfaced via updateStory.isError below
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-[130] flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl w-full max-w-sm max-h-[85vh] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-bold text-lg">Edit story</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {story.story_type === 'text' && (
            textScenes ? (
              textScenes.map((scene, i) => (
                <div key={scene.id}>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {textScenes.length > 1 ? `Scene ${i + 1} text` : 'Story text'}
                  </label>
                  <textarea
                    value={scene.text}
                    onChange={(e) => setTextScenes((prev) => prev!.map((s, idx) => (idx === i ? { ...s, text: e.target.value } : s)))}
                    className="w-full bg-muted rounded-xl p-3 text-sm outline-none resize-none"
                    rows={2}
                  />
                </div>
              ))
            ) : (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Story text</label>
                <textarea
                  value={legacyText}
                  onChange={(e) => setLegacyText(e.target.value)}
                  className="w-full bg-muted rounded-xl p-3 text-sm outline-none resize-none"
                  rows={2}
                />
              </div>
            )
          )}

          {story.story_type === 'photo' && (
            photoScenes ? (
              photoScenes.map((scene, i) => (
                <div key={scene.id}>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {photoScenes.length > 1 ? `Photo ${i + 1} caption` : 'Caption'}
                  </label>
                  <textarea
                    value={scene.overlayText || ''}
                    onChange={(e) => setPhotoScenes((prev) => prev!.map((s, idx) => (idx === i ? { ...s, overlayText: e.target.value } : s)))}
                    placeholder="Add a caption..."
                    className="w-full bg-muted rounded-xl p-3 text-sm outline-none resize-none"
                    rows={2}
                  />
                </div>
              ))
            ) : (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Caption</label>
                <textarea
                  value={legacyOverlay}
                  onChange={(e) => setLegacyOverlay(e.target.value)}
                  placeholder="Add a caption..."
                  className="w-full bg-muted rounded-xl p-3 text-sm outline-none resize-none"
                  rows={2}
                />
              </div>
            )
          )}

          {story.story_type === 'video' && (
            videoScenes ? (
              videoScenes.map((scene, i) => (
                <div key={scene.id}>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {videoScenes.length > 1 ? `Clip ${i + 1} caption` : 'Caption'}
                  </label>
                  <textarea
                    value={scene.overlayText || ''}
                    onChange={(e) => setVideoScenes((prev) => prev!.map((s, idx) => (idx === i ? { ...s, overlayText: e.target.value } : s)))}
                    placeholder="Add a caption..."
                    className="w-full bg-muted rounded-xl p-3 text-sm outline-none resize-none"
                    rows={2}
                  />
                </div>
              ))
            ) : (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Caption</label>
                <textarea
                  value={legacyOverlay}
                  onChange={(e) => setLegacyOverlay(e.target.value)}
                  placeholder="Add a caption..."
                  className="w-full bg-muted rounded-xl p-3 text-sm outline-none resize-none"
                  rows={2}
                />
              </div>
            )
          )}

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Who can see this story</label>
            <button
              onClick={() => setShowAudiencePicker(true)}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-muted hover:bg-muted/70 transition-colors"
            >
              <AudienceIcon className="h-5 w-5 text-pink-500 shrink-0" />
              <span className="text-sm font-medium flex-1 text-left">{AUDIENCE_LABEL[visibility].label}</span>
              {visibility === 'selected' && <span className="text-xs text-muted-foreground">{selectedIds.length} chosen</span>}
            </button>
          </div>
        </div>

        <div className="p-3 border-t border-border">
          <button
            onClick={handleSave}
            disabled={updateStory.isPending}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {updateStory.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save changes'}
          </button>
        </div>
      </div>

      {showAudiencePicker && (
        <StoryAudienceModal
          userId={story.user_id}
          confirmLabel="Done"
          onClose={() => setShowAudiencePicker(false)}
          onConfirm={(v, ids) => {
            setVisibility(v)
            setSelectedIds(ids)
            setShowAudiencePicker(false)
          }}
        />
      )}
    </div>
  )
}
