'use client'

import { useEffect, useState } from 'react'
import { Loader2, Play, Video, MoreHorizontal, Trash2, Plus } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { createClient } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/utils/helpers'
import { StoryViewer } from '@/components/stories/StoryViewer'
import { MessageActionConfirmDialog } from '@/components/chat/MessageActionConfirmDialog'
import { useReshareMentionedStory, type StoryGroup } from '@/lib/hooks/useStories'
import type { StoryWithProfile } from '@/lib/types/database.types'

/** A real mentioned Story rendered as a received media item in the relevant DM. */
export function MentionedStoryMessages({ userId, otherUserId }: { userId: string; otherUserId: string }) {
  const supabase = createClient()
  const [stories, setStories] = useState<StoryWithProfile[]>([])
  const [alreadyAddedStoryIds, setAlreadyAddedStoryIds] = useState<Set<string>>(() => new Set())
  const [loading, setLoading] = useState(true)
  const [selectedStory, setSelectedStory] = useState<StoryWithProfile | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const [openMenuStoryId, setOpenMenuStoryId] = useState<string | null>(null)
  const [confirmDeleteStory, setConfirmDeleteStory] = useState<StoryWithProfile | null>(null)
  const [deletingStory, setDeletingStory] = useState(false)
  const [mentionCreatedAt, setMentionCreatedAt] = useState<Map<string, string>>(() => new Map())
  const reshare = useReshareMentionedStory()

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    ;(async () => {
      const { data: mentionRows, error: mentionError } = await supabase.from('story_mentions')
        .select('story_id, created_at').eq('creator_id', otherUserId).eq('mentioned_user_id', userId)
        .order('created_at', { ascending: true }).limit(30)
      if (mentionError) {
        if (active) { setStories([]); setError('Mentioned media is unavailable right now.'); setLoading(false) }
        return
      }
      const rows = mentionRows || []
      const ids = Array.from(new Set(rows.map(row => row.story_id)))
      if (active) setMentionCreatedAt(new Map(rows.map(row => [row.story_id, row.created_at])))
      if (!ids.length) {
        if (active) { setStories([]); setLoading(false) }
        return
      }
      const { data: storyRows, error: storyError } = await supabase.from('stories')
        .select('*, profiles!stories_user_id_fkey(*)').in('id', ids)
      if (storyError) {
        if (active) { setStories([]); setError('Mentioned media is unavailable right now.'); setLoading(false) }
        return
      }
      const byId = new Map(((storyRows || []) as StoryWithProfile[]).map(story => [story.id, story]))
      const { data: existingReshares } = await supabase.from('stories').select('original_story_id').eq('user_id', userId).in('original_story_id', ids)
      const alreadyAdded = new Set((existingReshares || []).map(row => row.original_story_id).filter((id): id is string => !!id))
      if (active) setAlreadyAddedStoryIds(alreadyAdded)
      const now = Date.now()
      const visible = ids.map(id => byId.get(id)).filter((story): story is StoryWithProfile =>
        !!story && story.user_id === otherUserId && new Date(story.expires_at).getTime() > now
      )
      if (active) { setStories(visible); setLoading(false) }
    })()
    return () => { active = false }
  }, [userId, otherUserId])

  const deleteForMe = async (story: StoryWithProfile) => {
    setActionError('')
    setNotice('')
    setDeletingStory(true)
    const { data: deleted, error: deleteError } = await supabase.rpc('delete_story_mention_for_me', {
      p_story_id: story.id,
      p_creator_id: otherUserId,
    })
    setDeletingStory(false)
    if (deleteError || deleted !== true) {
      setActionError(deleteError?.message
        ? 'Could not delete this mention for you. Please try again.'
        : 'This story mention was not found or was already removed.')
      return
    }
    setStories(previous => previous.filter(item => item.id !== story.id))
    setOpenMenuStoryId(null)
    setConfirmDeleteStory(null)
    setNotice('Story mention deleted for you.')
  }

  const addToMyStory = async (story: StoryWithProfile) => {
    setActionError('')
    setNotice('')
    try {
      await reshare.mutateAsync({ storyId: story.id, userId, sourceStory: story })
      setAlreadyAddedStoryIds(previous => new Set(previous).add(story.id))
      setSelectedStory(null)
      setNotice('Successful Added')
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
      <div className="mb-3 flex flex-col items-start gap-2" aria-label="Stories you were mentioned in">
        {loading && <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading shared story…</div>}
        {error && <p className="max-w-[85%] rounded-2xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">{error}</p>}
        {stories.map(story => {
          const preview = story.story_type === 'video'
            ? (story.video_scenes?.[0]?.videoUrl || story.media_url)
            : story.story_type === 'photo' ? (story.photo_scenes?.[0]?.imageUrl || story.media_url) : null
          const isVideo = story.story_type === 'video'
          return (
            <div key={story.id} className="w-full max-w-[min(240px,72%)] sm:max-w-[min(260px,72%)]">
              <div role="button" tabIndex={0} onClick={() => { setActionError(''); setNotice(''); setSelectedStory(story) }}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setActionError(''); setNotice(''); setSelectedStory(story) } }}
                className="group relative block aspect-[9/12] w-full overflow-hidden rounded-2xl border border-border bg-muted text-left shadow-sm transition hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={`Open story shared by @${story.profiles?.username || 'user'}`}>
                {preview ? (isVideo
                  ? <video src={preview} muted autoPlay loop playsInline preload="metadata" className="absolute inset-0 h-full w-full object-cover" />
                  : <img src={preview} alt="" className="absolute inset-0 h-full w-full object-cover" />)
                  : <div className="absolute inset-0 flex items-center justify-center p-5" style={{ background: story.background_color || '#25213d' }}><p className="line-clamp-7 text-center text-lg font-semibold text-white">{story.text_content || 'Story'}</p></div>}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
                <div className="absolute right-2 top-2 z-10">
                  <button type="button" onClick={(event) => { event.stopPropagation(); setOpenMenuStoryId(openMenuStoryId === story.id ? null : story.id) }}
                    aria-label="Story mention options" className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm hover:bg-black/75">
                    <MoreHorizontal className="h-5 w-5" />
                  </button>
                  {openMenuStoryId === story.id && (
                    <>
                      <button type="button" aria-label="Close story menu" className="fixed inset-0 z-20 cursor-default" onClick={() => setOpenMenuStoryId(null)} />
                      <div className="absolute right-0 top-9 z-30 w-44 overflow-hidden rounded-xl border border-white/10 bg-[#171923] p-1 text-white shadow-xl">
                        <button type="button" onClick={() => { setOpenMenuStoryId(null); if (!alreadyAddedStoryIds.has(story.id)) void addToMyStory(story) }}
                          disabled={alreadyAddedStoryIds.has(story.id) || reshare.isPending}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs hover:bg-white/10 disabled:opacity-50">
                          <Plus className="h-4 w-4" /> {alreadyAddedStoryIds.has(story.id) ? 'Already added' : 'Add to my story'}
                        </button>
                        <button type="button" onClick={() => { setOpenMenuStoryId(null); setConfirmDeleteStory(story) }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs text-red-300 hover:bg-white/10">
                          <Trash2 className="h-4 w-4" /> Delete for me
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <div className="absolute left-3 right-12 top-3 flex items-center gap-2 text-white">
                  <Avatar className="h-7 w-7 border border-white/70"><AvatarImage src={getAvatarUrl(story.profiles?.avatar_url)} /><AvatarFallback>{story.profiles?.username?.[0]?.toUpperCase() || '?'}</AvatarFallback></Avatar>
                  <div className="min-w-0 flex-1"><p className="truncate text-[11px] font-semibold">@{story.profiles?.username || 'user'}</p><p className="text-[9px] text-white/75">Mentioned you in a story</p></div>
                </div>
                <span className="absolute inset-0 flex items-center justify-center text-white"><span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/60 bg-black/40 shadow-lg backdrop-blur-sm transition group-hover:scale-105">{isVideo ? <Play className="ml-1 h-5 w-5 fill-current" /> : <Video className="h-5 w-5" />}</span></span>
                <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2.5 py-1 text-[9px] font-semibold text-white backdrop-blur-sm">Tap to view story</span>
              </div>
            </div>
          )
        })}
        {(notice || actionError) && <p className={`rounded-lg px-3 py-2 text-xs ${actionError ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-600'}`}>{actionError || notice}</p>}
      </div>
      <MessageActionConfirmDialog
        action={confirmDeleteStory ? 'delete' : null}
        open={!!confirmDeleteStory}
        pending={deletingStory}
        onCancel={() => setConfirmDeleteStory(null)}
        onConfirm={() => { if (confirmDeleteStory) void deleteForMe(confirmDeleteStory) }}
      />
      {selectedStory && <StoryViewer groups={selectedGroup} startGroupIndex={0} currentUserId={userId} onClose={() => setSelectedStory(null)} onAddToMyStory={alreadyAddedStoryIds.has(selectedStory.id) ? undefined : addToMyStory} isAddingToMyStory={reshare.isPending} showOriginalAttribution />}
    </>
  )
}
