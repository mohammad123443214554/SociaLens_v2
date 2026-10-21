'use client'

import { useEffect, useState } from 'react'
import { Loader2, MessageCircle, Play } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { createClient } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/utils/helpers'
import { StoryViewer } from '@/components/stories/StoryViewer'
import { useReshareMentionedStory, type StoryGroup } from '@/lib/hooks/useStories'
import type { StoryWithProfile } from '@/lib/types/database.types'

export function MentionedStoriesPanel({ userId }: { userId: string }) {
  const supabase = createClient()
  const [stories, setStories] = useState<StoryWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedStory, setSelectedStory] = useState<StoryWithProfile | null>(null)
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const reshare = useReshareMentionedStory()

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    ;(async () => {
      const { data: mentions, error: mentionError } = await supabase.from('story_mentions')
        .select('story_id, created_at').eq('mentioned_user_id', userId)
        .order('created_at', { ascending: false }).limit(30)
      if (mentionError) {
        if (active) { setError('Mentioned stories could not be loaded.'); setLoading(false) }
        return
      }
      const ids = Array.from(new Set((mentions || []).map(row => row.story_id)))
      if (!ids.length) {
        if (active) { setStories([]); setLoading(false) }
        return
      }
      const { data: rows, error: storiesError } = await supabase.from('stories')
        .select('*, profiles(*)').in('id', ids)
      if (storiesError) {
        if (active) { setError('Mentioned stories could not be loaded.'); setLoading(false) }
        return
      }
      const byId = new Map(((rows || []) as StoryWithProfile[]).map(row => [row.id, row]))
      const now = Date.now()
      const visible = ids.map(id => byId.get(id)).filter((story): story is StoryWithProfile =>
        !!story && new Date(story.expires_at).getTime() > now && story.user_id !== userId
      )
      if (active) { setStories(visible); setLoading(false) }
    })()
    return () => { active = false }
  }, [userId])

  const handleAddToMyStory = async (story: StoryWithProfile) => {
    setActionError('')
    try {
      await reshare.mutateAsync({ storyId: story.id, userId })
      setSelectedStory(null)
      setNotice('Added to your story for 24 hours.')
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not add this story.')
    }
  }

  if (!loading && !error && stories.length === 0) return null

  const selectedGroup: StoryGroup[] = selectedStory ? [{
    userId: selectedStory.user_id,
    profile: selectedStory.profiles,
    stories: [selectedStory],
  }] : []

  return (
    <>
      <section className="border-b border-border px-4 py-4" aria-label="Stories that mentioned you">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-pink-500/10 text-pink-500"><MessageCircle className="h-4 w-4" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">Stories you're mentioned in</h2>
            <p className="text-xs text-muted-foreground">Open a story or add it to your own story</p>
          </div>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        {error ? (
          <p className="rounded-xl bg-muted px-3 py-3 text-xs text-muted-foreground">{error}</p>
        ) : loading ? (
          <div className="flex gap-3 overflow-hidden">{[0, 1, 2].map(i => <div key={i} className="h-32 w-24 shrink-0 animate-pulse rounded-xl bg-muted" />)}</div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {stories.map(story => {
              const image = story.story_type === 'photo' ? (story.photo_scenes?.[0]?.imageUrl || story.media_url) : story.story_type === 'video' ? (story.video_scenes?.[0]?.videoUrl || story.media_url) : null
              return (
                <button key={story.id} type="button" onClick={() => { setActionError(''); setNotice(''); setSelectedStory(story) }}
                  className="group relative h-32 w-24 shrink-0 overflow-hidden rounded-xl border border-border bg-muted text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                  aria-label={`View story by @${story.profiles?.username || 'user'}`}>
                  {image ? (story.story_type === 'video' ? <video src={image} muted playsInline preload="metadata" className="absolute inset-0 h-full w-full object-cover" /> : <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />) : (
                    <div className="absolute inset-0 flex items-center justify-center p-2" style={{ background: story.background_color || '#25213d' }}><p className="line-clamp-5 text-center text-xs font-semibold text-white">{story.text_content || 'Text story'}</p></div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/5 to-black/10" />
                  <div className="absolute inset-x-2 bottom-2 flex items-center gap-1.5 text-white">
                    <Avatar className="h-6 w-6 shrink-0 border border-white/60"><AvatarImage src={getAvatarUrl(story.profiles?.avatar_url)} /><AvatarFallback>{story.profiles?.username?.[0]?.toUpperCase()}</AvatarFallback></Avatar>
                    <span className="truncate text-[10px] font-semibold">@{story.profiles?.username}</span>
                  </div>
                  <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white"><Play className="h-3 w-3 fill-current" /></span>
                </button>
              )
            })}
          </div>
        )}
        {(notice || actionError) && <p className={`mt-2 text-xs ${actionError ? 'text-red-500' : 'text-emerald-600'}`}>{actionError || notice}</p>}
      </section>
      {selectedStory && (
        <StoryViewer groups={selectedGroup} startGroupIndex={0} currentUserId={userId} onClose={() => setSelectedStory(null)}
          onAddToMyStory={handleAddToMyStory} isAddingToMyStory={reshare.isPending} />
      )}
    </>
  )
}
