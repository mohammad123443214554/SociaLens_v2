'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { StoryWithProfile, TextScene, PhotoScene, VideoScene, GlobalMusic, StoryVisibility, StoryHiddenViewer, StoryMentionOverlay } from '@/lib/types/database.types'
import { compressImageIfNeeded, LONG_CACHE_CONTROL } from '@/lib/utils/imageCompression'

export interface StoryGroup {
  userId: string
  profile: StoryWithProfile['profiles']
  stories: StoryWithProfile[]
}

// Groups this user's own + their followed accounts' active stories by
// Author, most-recently-posted author first. "Active" here just means the
// Row is visible at all - the database RLS policy already hides anything
// past its 24h expires_at, so nothing extra needs to be checked here.
// On top of each individual story's own "who can see this?" audience
// (chosen when it was posted), this also respects the author's account-
// wide Story Privacy default from Settings, so a change there applies
// immediately without needing to touch every existing story row.
export function useActiveStories(userId?: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['active-stories', userId],
    queryFn: async () => {
      if (!userId) return []

      const { data, error } = await supabase
        .from('stories')
        .select('*, profiles!stories_user_id_fkey(*)')
        .order('created_at', { ascending: false })

      if (error) throw error

      let stories = (data as StoryWithProfile[]) || []

      const authorIds = Array.from(new Set(stories.map((s) => s.user_id).filter((id) => id !== userId)))
      if (authorIds.length > 0) {
        const [{ data: iFollow }, { data: followMe }, { data: selectedMe }] = await Promise.all([
          supabase.from('follows').select('following_id').eq('follower_id', userId).eq('status', 'accepted').in('following_id', authorIds),
          supabase.from('follows').select('follower_id').eq('following_id', userId).eq('status', 'accepted').in('follower_id', authorIds),
          supabase.from('privacy_selected_users').select('owner_id').eq('category', 'story').eq('selected_user_id', userId).in('owner_id', authorIds),
        ])
        const iFollowSet = new Set((iFollow || []).map((r: any) => r.following_id))
        const followsMeSet = new Set((followMe || []).map((r: any) => r.follower_id))
        const selectedMeSet = new Set((selectedMe || []).map((r: any) => r.owner_id))

        stories = stories.filter((s) => {
          if (s.user_id === userId) return true
          const level = (s.profiles as any)?.story_privacy ?? 'everyone'
          switch (level) {
            case 'everyone': return true
            // 'followers' = the author's followers, i.e. the viewer must follow the author.
            // 'following' = people the author follows, i.e. the author must follow the viewer.
            case 'followers': return iFollowSet.has(s.user_id)
            case 'following': return followsMeSet.has(s.user_id)
            case 'selected': return selectedMeSet.has(s.user_id)
            case 'none': return false
            default: return true
          }
        })
      }

      const groups = new Map<string, StoryGroup>()

      for (const story of stories) {
        const existing = groups.get(story.user_id)
        if (existing) {
          existing.stories.push(story)
        } else {
          groups.set(story.user_id, {
            userId: story.user_id,
            profile: story.profiles,
            stories: [story],
          })
        }
      }

      // Oldest-first within each person's own story ring, so viewers play
      // in the order they were posted.
      const result = Array.from(groups.values())
      result.forEach((g) => g.stories.reverse())

      // Rank by relationship + how much this viewer actually engages with
      // that author's stories (views/replies/reactions), not just posting
      // time - a close friend's stories from a few hours ago should beat
      // someone barely-followed who just posted, the same way Instagram's
      // story tray reorders itself around who you actually interact with.
      const otherAuthorIds = result.map((g) => g.userId).filter((id) => id !== userId)
      let engagementScore = new Map<string, number>()
      if (otherAuthorIds.length > 0) {
        const authorStoryIds = stories.filter((s) => otherAuthorIds.includes(s.user_id)).map((s) => s.id)
        const [{ data: myViews }, { data: myLikes }, { data: myReactions }, { data: mutualFollowRows }] = await Promise.all([
          supabase.from('story_views').select('story_id').eq('viewer_id', userId).in('story_id', authorStoryIds),
          supabase.from('story_likes').select('story_id').eq('user_id', userId).in('story_id', authorStoryIds),
          supabase.from('story_reactions').select('story_id').eq('user_id', userId).in('story_id', authorStoryIds),
          supabase.from('follows').select('follower_id, following_id').eq('status', 'accepted')
            .or(`and(follower_id.eq.${userId},following_id.in.(${otherAuthorIds.join(',')})),and(following_id.eq.${userId},follower_id.in.(${otherAuthorIds.join(',')}))`),
        ])
        const storyToAuthor = new Map(stories.map((s) => [s.id, s.user_id]))
        const bump = (rows: { story_id: string }[] | null, weight: number) => {
          for (const r of rows || []) {
            const author = storyToAuthor.get(r.story_id)
            if (author) engagementScore.set(author, (engagementScore.get(author) || 0) + weight)
          }
        }
        bump(myViews, 1)
        bump(myLikes, 3)
        bump(myReactions, 2)

        // Mutual follow (both ways) counts as closer than a one-way follow.
        const followsThem = new Set((mutualFollowRows || []).filter((r: any) => r.follower_id === userId).map((r: any) => r.following_id))
        const followsMe = new Set((mutualFollowRows || []).filter((r: any) => r.following_id === userId).map((r: any) => r.follower_id))
        for (const id of otherAuthorIds) {
          if (followsThem.has(id) && followsMe.has(id)) engagementScore.set(id, (engagementScore.get(id) || 0) + 4)
        }
      }

      // Own stories always come first, then everyone else ranked by
      // relationship/engagement score (most-recent story as the tiebreak,
      // preserved via each group's position from the query above).
      const originalOrder = new Map(result.map((g, i) => [g.userId, i]))
      result.sort((a, b) => {
        if (a.userId === userId) return -1
        if (b.userId === userId) return 1
        const scoreDiff = (engagementScore.get(b.userId) || 0) - (engagementScore.get(a.userId) || 0)
        if (scoreDiff !== 0) return scoreDiff
        return (originalOrder.get(a.userId)! - originalOrder.get(b.userId)!)
      })

      return result
    },
    enabled: !!userId,
    staleTime: 30000,
  })
}

// Only server-validated mention records are used to render tappable mentions in published Stories.
export function useStoryMentions(storyId?: string) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['story-mentions', storyId],
    enabled: !!storyId,
    staleTime: 30000,
    queryFn: async (): Promise<StoryMentionOverlay[]> => {
      if (!storyId) return []
      const { data: rows, error } = await supabase
        .from('story_mentions')
        .select('id, story_id, creator_id, mentioned_user_id, overlay_id, username_at_mention, x, y, scale, created_at')
        .eq('story_id', storyId)
      if (error) throw error
      if (!rows?.length) return []
      const userIds = Array.from(new Set(rows.map(row => row.mentioned_user_id)))
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .in('id', userIds)
      if (profileError) throw profileError
      const profileById = new Map((profiles || []).map(profile => [profile.id, profile]))
      return rows.flatMap(row => {
        const profile = profileById.get(row.mentioned_user_id)
        if (!profile) return []
        return [{
          id: row.overlay_id || row.id,
          userId: row.mentioned_user_id,
          username: profile.username || row.username_at_mention,
          fullName: profile.full_name,
          avatarUrl: profile.avatar_url,
          x: row.x,
          y: row.y,
          scale: row.scale,
        }]
      })
    },
  })
}

// Every story-creation input takes the audience choice made in the "Who can
// see this?" popup shown right before posting - defaults to 'everyone' if
// somehow skipped, so a story never accidentally ends up unviewable.
interface StoryAudienceInput {
  visibility?: StoryVisibility
  visibilitySelectedIds?: string[]
  // Set when this story is created from something shared in from another
  // app/website (see /share/handle) - shows an "Open in X" pill on the
  // story that jumps back to that content.
  linkUrl?: string | null
  linkLabel?: string | null
}

interface CreateTextStoryInput extends StoryAudienceInput {
  userId: string
  scenes: TextScene[]
  globalMusic?: GlobalMusic | null
  globalFont?: string | null
}

interface CreateMediaStoryInput extends StoryAudienceInput {
  userId: string
  file: File
  storyType: 'photo' | 'video'
  overlayText?: string
  overlayX?: number
  overlayY?: number
  musicUrl?: string
  musicTitle?: string
  musicArtist?: string
  musicArtworkUrl?: string
  durationSeconds?: number
  overlayTextColor?: string
  overlayFontFamily?: string
}

// A photo scene still holding a local File (not uploaded yet) - used while
// editing, before "Share to Story" actually uploads everything.
export interface DraftPhotoScene extends Omit<PhotoScene, 'imageUrl'> {
  file: File
}

export interface DraftVideoScene extends Omit<VideoScene, 'videoUrl'> {
  file: File
}

interface CreatePhotoStoryInput extends StoryAudienceInput {
  userId: string
  scenes: DraftPhotoScene[]
  globalMusic?: GlobalMusic | null
  globalFont?: string | null
}

interface CreateVideoStoryInput extends StoryAudienceInput {
  userId: string
  scenes: DraftVideoScene[]
  globalMusic?: GlobalMusic | null
  globalFont?: string | null
}

export function useCreateStory() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const invalidate = (userId: string) => {
    queryClient.invalidateQueries({ queryKey: ['active-stories', userId] })
  }

  const createTextStory = useMutation({
    mutationFn: async ({ userId, scenes, globalMusic, globalFont, visibility, visibilitySelectedIds, linkUrl, linkLabel }: CreateTextStoryInput) => {
      const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0) || 5
      const first = scenes[0]
      // Legacy top-level music_* fields mirror whichever song plays first -
      // the global one if there is one, otherwise the first scene's own
      // separate song, if any.
      const legacyMusic = globalMusic
        ? { url: globalMusic.url, title: globalMusic.title, artist: globalMusic.artist, artworkUrl: globalMusic.artworkUrl }
        : { url: first?.musicUrl, title: first?.musicTitle, artist: first?.musicArtist, artworkUrl: first?.musicArtworkUrl }

      const { error } = await supabase.from('stories').insert({
        user_id: userId,
        story_type: 'text',
        text_content: first?.text || '',
        text_scenes: scenes,
        global_music: globalMusic || null,
        global_font_family: globalFont || null,
        background_color: first?.backgroundColor || null,
        music_url: legacyMusic.url || null,
        music_title: legacyMusic.title || null,
        music_artist: legacyMusic.artist || null,
        music_artwork_url: legacyMusic.artworkUrl || null,
        duration_seconds: totalDuration,
        text_color: first?.textColor || null,
        font_family: first?.fontFamily || globalFont || null,
        visibility: visibility || 'everyone',
        visibility_selected_ids: visibility === 'selected' ? (visibilitySelectedIds || []) : [],
        link_url: linkUrl || null,
        link_label: linkLabel || null,
      })
      if (error) throw error
    },
    onSuccess: (_, { userId }) => invalidate(userId),
  })

  const createMediaStory = useMutation({
    mutationFn: async ({ userId, file, storyType, overlayText, overlayX, overlayY, musicUrl, musicTitle, musicArtist, musicArtworkUrl, durationSeconds, overlayTextColor, overlayFontFamily, visibility, visibilitySelectedIds, linkUrl, linkLabel }: CreateMediaStoryInput) => {
      const fileToUpload = storyType === 'photo' ? await compressImageIfNeeded(file) : file
      const ext = fileToUpload.name.split('.').pop()
      const path = `${userId}/${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage.from('stories').upload(path, fileToUpload, {
        cacheControl: LONG_CACHE_CONTROL,
      })
      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from('stories').getPublicUrl(path)

      const { error } = await supabase.from('stories').insert({
        user_id: userId,
        story_type: storyType,
        media_url: urlData.publicUrl,
        overlay_text: overlayText || null,
        overlay_x: overlayX ?? 50,
        overlay_y: overlayY ?? 50,
        music_url: musicUrl || null,
        music_title: musicTitle || null,
        music_artist: musicArtist || null,
        music_artwork_url: musicArtworkUrl || null,
        duration_seconds: storyType === 'photo' ? (durationSeconds ?? 5) : 5,
        overlay_text_color: overlayTextColor || null,
        overlay_font_family: overlayFontFamily || null,
        visibility: visibility || 'everyone',
        visibility_selected_ids: visibility === 'selected' ? (visibilitySelectedIds || []) : [],
        link_url: linkUrl || null,
        link_label: linkLabel || null,
      })
      if (error) throw error
    },
    onSuccess: (_, { userId }) => invalidate(userId),
  })

  // Multi-photo ("multi-scene") story: uploads every scene's image first,
  // then saves one story row with a photo_scenes array - same overall shape
  // as the text story's scene system.
  const createPhotoStory = useMutation({
    mutationFn: async ({ userId, scenes, globalMusic, globalFont, visibility, visibilitySelectedIds, linkUrl, linkLabel }: CreatePhotoStoryInput) => {
      const uploaded: PhotoScene[] = []
      for (const scene of scenes) {
        const fileToUpload = await compressImageIfNeeded(scene.file)
        const ext = fileToUpload.name.split('.').pop()
        const path = `${userId}/${Date.now()}-${uploaded.length}.${ext}`
        const { error: uploadError } = await supabase.storage.from('stories').upload(path, fileToUpload, {
          cacheControl: LONG_CACHE_CONTROL,
        })
        if (uploadError) throw uploadError
        const { data: urlData } = supabase.storage.from('stories').getPublicUrl(path)
        const { file, ...rest } = scene
        uploaded.push({ ...rest, imageUrl: urlData.publicUrl })
      }

      const totalDuration = uploaded.reduce((sum, s) => sum + s.duration, 0) || 5
      const first = uploaded[0]
      const legacyMusic = globalMusic
        ? { url: globalMusic.url, title: globalMusic.title, artist: globalMusic.artist, artworkUrl: globalMusic.artworkUrl }
        : { url: first?.musicUrl, title: first?.musicTitle, artist: first?.musicArtist, artworkUrl: first?.musicArtworkUrl }

      const { data: createdStory, error } = await supabase.from('stories').insert({
        user_id: userId,
        story_type: 'photo',
        media_url: first?.imageUrl || null,
        photo_scenes: uploaded,
        global_music: globalMusic || null,
        global_font_family: globalFont || null,
        overlay_text: first?.overlayText || null,
        overlay_x: first?.overlayX ?? 50,
        overlay_y: first?.overlayY ?? 50,
        overlay_text_color: first?.overlayTextColor || null,
        overlay_font_family: first?.overlayFontFamily || globalFont || null,
        music_url: legacyMusic.url || null,
        music_title: legacyMusic.title || null,
        music_artist: legacyMusic.artist || null,
        music_artwork_url: legacyMusic.artworkUrl || null,
        duration_seconds: totalDuration,
        visibility: visibility || 'everyone',
        visibility_selected_ids: visibility === 'selected' ? (visibilitySelectedIds || []) : [],
        link_url: linkUrl || null,
        link_label: linkLabel || null,
      }).select('id').single()
      if (error) throw error

      const mentionRows = uploaded.flatMap(scene => (scene.mentions || []).map(mention => ({
        story_id: createdStory.id,
        creator_id: userId,
        mentioned_user_id: mention.userId,
        overlay_id: mention.id,
        username_at_mention: mention.username,
        x: mention.x,
        y: mention.y,
        scale: mention.scale,
      })))
      const uniqueMentions = Array.from(new Map(mentionRows.map(mention => [mention.mentioned_user_id, mention])).values())
      if (uniqueMentions.length) {
        const { error: mentionError } = await supabase.from('story_mentions').insert(uniqueMentions)
        if (mentionError) {
          await supabase.from('stories').delete().eq('id', createdStory.id)
          throw new Error('Story mention validation failed. Please remove blocked or unavailable mentions and try again.')
        }
      }
    },
    onSuccess: (_, { userId }) => invalidate(userId),
  })

  // Multi-clip ("multi-scene") video story: uploads every scene's video
  // first, then saves one story row with a video_scenes array - same shape
  // as the photo story's scene system.
  const createVideoStory = useMutation({
    mutationFn: async ({ userId, scenes, globalMusic, globalFont, visibility, visibilitySelectedIds, linkUrl, linkLabel }: CreateVideoStoryInput) => {
      const uploaded: VideoScene[] = []
      for (const scene of scenes) {
        const ext = scene.file.name.split('.').pop()
        const path = `${userId}/${Date.now()}-${uploaded.length}.${ext}`
        const { error: uploadError } = await supabase.storage.from('stories').upload(path, scene.file, {
          cacheControl: LONG_CACHE_CONTROL,
        })
        if (uploadError) throw uploadError
        const { data: urlData } = supabase.storage.from('stories').getPublicUrl(path)
        const { file, ...rest } = scene
        uploaded.push({ ...rest, videoUrl: urlData.publicUrl })
      }

      const totalDuration = uploaded.reduce((sum, s) => sum + s.duration, 0) || 5
      const first = uploaded[0]
      const legacyMusic = globalMusic
        ? { url: globalMusic.url, title: globalMusic.title, artist: globalMusic.artist, artworkUrl: globalMusic.artworkUrl }
        : { url: first?.musicUrl, title: first?.musicTitle, artist: first?.musicArtist, artworkUrl: first?.musicArtworkUrl }

      const { data: createdStory, error } = await supabase.from('stories').insert({
        user_id: userId,
        story_type: 'video',
        media_url: first?.videoUrl || null,
        video_scenes: uploaded,
        global_music: globalMusic || null,
        global_font_family: globalFont || null,
        overlay_text: first?.overlayText || null,
        overlay_x: first?.overlayX ?? 50,
        overlay_y: first?.overlayY ?? 50,
        overlay_font_family: first?.overlayFontFamily || globalFont || null,
        music_url: legacyMusic.url || null,
        music_title: legacyMusic.title || null,
        music_artist: legacyMusic.artist || null,
        music_artwork_url: legacyMusic.artworkUrl || null,
        duration_seconds: totalDuration,
        visibility: visibility || 'everyone',
        visibility_selected_ids: visibility === 'selected' ? (visibilitySelectedIds || []) : [],
        link_url: linkUrl || null,
        link_label: linkLabel || null,
      }).select('id').single()
      if (error) throw error

      const mentionRows = uploaded.flatMap(scene => (scene.mentions || []).map(mention => ({
        story_id: createdStory.id,
        creator_id: userId,
        mentioned_user_id: mention.userId,
        overlay_id: mention.id,
        username_at_mention: mention.username,
        x: mention.x,
        y: mention.y,
        scale: mention.scale,
      })))
      const uniqueMentions = Array.from(new Map(mentionRows.map(mention => [mention.mentioned_user_id, mention])).values())
      if (uniqueMentions.length) {
        const { error: mentionError } = await supabase.from('story_mentions').insert(uniqueMentions)
        if (mentionError) {
          await supabase.from('stories').delete().eq('id', createdStory.id)
          throw new Error('Story mention validation failed. Please remove blocked or unavailable mentions and try again.')
        }
      }
    },
    onSuccess: (_, { userId }) => invalidate(userId),
  })

  return { createTextStory, createMediaStory, createPhotoStory, createVideoStory }
}


/**
 * Adds a story that mentioned the current user to their own Story tray.
 * A database trigger re-validates the mention, visibility, blocks and expiry;
 * the inserted row receives the normal 24-hour expiry from the database.
 */
export function useReshareMentionedStory() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ storyId, userId, sourceStory }: { storyId: string; userId: string; sourceStory: StoryWithProfile }) => {
      // Reuse the story already loaded by the viewer instead of fetching the
      // same row again. The database trigger remains the final authority for
      // source-story validity, expiry, visibility, blocks and mention status.
      const source = sourceStory
      if (source.id !== storyId || new Date(source.expires_at).getTime() <= Date.now()) {
        throw new Error('This story is no longer available.')
      }

      // Do not perform a separate story_mentions SELECT here. Its RLS policy
      // joins back to stories and can be very slow under load. The insert's
      // SECURITY DEFINER validation trigger checks the mention, expiry, privacy,
      // blocks and visibility atomically, so this extra round-trip is redundant.

      const { data: created, error } = await supabase.from('stories').insert({
        user_id: userId,
        story_type: source.story_type,
        media_url: source.media_url,
        text_content: source.text_content,
        background_color: source.background_color,
        overlay_text: source.overlay_text,
        overlay_x: source.overlay_x,
        overlay_y: source.overlay_y,
        music_url: source.music_url,
        music_title: source.music_title,
        music_artist: source.music_artist,
        music_artwork_url: source.music_artwork_url,
        duration_seconds: source.duration_seconds,
        text_color: source.text_color,
        font_family: source.font_family,
        overlay_text_color: source.overlay_text_color,
        overlay_font_family: source.overlay_font_family,
        text_scenes: source.text_scenes,
        photo_scenes: source.photo_scenes,
        video_scenes: source.video_scenes,
        global_music: source.global_music,
        global_font_family: source.global_font_family,
        visibility: 'everyone',
        visibility_selected_ids: [],
        link_url: source.link_url,
        link_label: source.link_label,
        original_story_id: source.id,
      }).select('id').single()
      if (error) {
        if (error.code === '23505') {
          throw new Error('You have already added this story to your story.')
        }
        throw error
      }
      return created
    },
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: ['active-stories', userId] })
      queryClient.invalidateQueries({ queryKey: ['mentioned-stories', userId] })
    },
  })
}

export function useDeleteStory() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ storyId, mediaUrl }: { storyId: string; mediaUrl?: string | null }) => {
      await supabase.from('stories').delete().eq('id', storyId)

      // Best-effort - also remove the file immediately rather than waiting
      // for the 24h cleanup job, since the user chose to delete it early.
      if (mediaUrl) {
        const marker = '/storage/v1/object/public/stories/'
        const idx = mediaUrl.indexOf(marker)
        if (idx !== -1) {
          const path = mediaUrl.slice(idx + marker.length)
          await supabase.storage.from('stories').remove([path])
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-stories'] })
    },
  })
}

// Story edit - lets an owner change the text on each scene (or the legacy
// flat fields for older single-scene stories), and the audience it's
// visible to, on an already-posted story. Re-uploading the underlying
// photo/video isn't supported here (that stays a "delete and repost" flow),
// only the text layered on top of it plus who can see it.
interface UpdateStoryInput {
  storyId: string
  text?: string
  overlayText?: string
  textScenes?: TextScene[]
  photoScenes?: PhotoScene[]
  videoScenes?: VideoScene[]
  visibility?: StoryVisibility
  visibilitySelectedIds?: string[]
}

export function useUpdateStory() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ storyId, text, overlayText, textScenes, photoScenes, videoScenes, visibility, visibilitySelectedIds }: UpdateStoryInput) => {
      const patch: Record<string, any> = {}
      if (text !== undefined) patch.text_content = text
      if (overlayText !== undefined) patch.overlay_text = overlayText
      if (textScenes !== undefined) patch.text_scenes = textScenes
      if (photoScenes !== undefined) patch.photo_scenes = photoScenes
      if (videoScenes !== undefined) patch.video_scenes = videoScenes
      if (visibility !== undefined) {
        patch.visibility = visibility
        patch.visibility_selected_ids = visibility === 'selected' ? (visibilitySelectedIds || []) : []
      }
      const { error } = await supabase.from('stories').update(patch).eq('id', storyId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-stories'] })
    },
  })
}

// The owner's persistent "hide my story from" list - stays in effect across
// every story they post until they remove someone from it again.
export function useHiddenViewers(ownerId?: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['story-hidden-viewers', ownerId],
    queryFn: async () => {
      if (!ownerId) return []
      const { data, error } = await supabase
        .from('story_hidden_viewers')
        .select('*, profiles!story_hidden_viewers_hidden_user_id_fkey(*)')
        .eq('owner_id', ownerId)
      if (error) throw error
      return (data || []) as unknown as (StoryHiddenViewer & { profiles: any })[]
    },
    enabled: !!ownerId,
  })
}

export function useToggleHiddenViewer() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ ownerId, hiddenUserId, hide }: { ownerId: string; hiddenUserId: string; hide: boolean }) => {
      if (hide) {
        const { error } = await supabase.from('story_hidden_viewers').insert({ owner_id: ownerId, hidden_user_id: hiddenUserId })
        if (error) throw error
      } else {
        const { error } = await supabase.from('story_hidden_viewers').delete().eq('owner_id', ownerId).eq('hidden_user_id', hiddenUserId)
        if (error) throw error
      }
    },
    onSuccess: (_, { ownerId }) => {
      queryClient.invalidateQueries({ queryKey: ['story-hidden-viewers', ownerId] })
      queryClient.invalidateQueries({ queryKey: ['active-stories'] })
    },
  })
}
