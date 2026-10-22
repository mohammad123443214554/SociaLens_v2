'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { X, Music, MoreVertical, Heart, MessageCircle, Send, EyeOff, Trash2, Loader2, Eye, Flag, ExternalLink } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getAvatarUrl, formatTimeAgo, cn } from '@/lib/utils/helpers'
import { useDeleteStory, useStoryMentions } from '@/lib/hooks/useStories'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import type { StoryGroup } from '@/lib/hooks/useStories'
import {
  STORY_REACTION_EMOJIS,
  useStoryLike,
  useToggleStoryLike,
  useStoryReaction,
  useSetStoryReaction,
  useRemoveStoryReaction,
  useReplyToStory,
  useRecordStoryView,
  useStoryViews,
  useStoryLikers,
  useStoryReactors,
} from '@/lib/hooks/useStoryInteractions'
import { useCommentThread, countThread } from '@/lib/hooks/useComments'
import { CommentThread } from '@/components/shared/CommentThread'
import { useUser } from '@/lib/hooks/useUser'
import { StoryHideViewersModal } from './StoryHideViewersModal'
import { ReportModal } from '@/components/shared/ReportModal'
import { VerifiedBadge } from '@/components/shared/VerifiedBadge'
import { loadGoogleFont } from '@/lib/utils/googleFonts'
import { resolveBackgroundCss, getTextFillStyle } from '@/lib/utils/storyStyle'
import type { TextScene, PhotoScene, VideoScene, StoryWithProfile } from '@/lib/types/database.types'

interface StoryViewerProps {
  groups: StoryGroup[]
  startGroupIndex: number
  /** Which story within the starting group to open on - defaults to the
   *  first one. Used when re-entering at the end of the list (e.g.
   *  coming back from the trailing sponsored story), so the person lands
   *  back on the exact story they left rather than that user's first. */
  startStoryIndex?: number
  currentUserId?: string
  onClose: () => void
  /** Called instead of onClose when advancing (auto or via a next-tap)
   *  past the very last story of the very last group - lets the caller
   *  chain into the trailing sponsored story instead of just closing. */
  onReachEnd?: () => void
  /** Optional action used by the mentioned-story inbox popup. */
  onAddToMyStory?: (story: StoryWithProfile) => void | Promise<void>
  isAddingToMyStory?: boolean
  /** Shows original-author attribution for a story opened from a mention message. */
  showOriginalAttribution?: boolean
}

// Figures out which scene should be showing right now, given how far into
// The story's total duration we are - Mirrors how the timeline strip laid
// Scenes out one after another in the composer. Works for either text or
// Photo scenes since both just need { duration }.
function getActiveScene<T extends { duration: number }>(scenes: T[] | null, elapsedSeconds: number): T | null {
  if (!scenes || scenes.length === 0) return null
  let cursor = 0
  for (const scene of scenes) {
    cursor += scene.duration
    if (elapsedSeconds < cursor) return scene
  }
  return scenes[scenes.length - 1]
}

export function StoryViewer({ groups, startGroupIndex, startStoryIndex = 0, currentUserId, onClose, onReachEnd, onAddToMyStory, isAddingToMyStory = false, showOriginalAttribution = false }: StoryViewerProps) {
  const { profile } = useUser()
  const router = useRouter()
  const supabase = createClient()
  const [originalStoryInfo, setOriginalStoryInfo] = useState<StoryWithProfile | null>(null)
  const [originalStoryToOpen, setOriginalStoryToOpen] = useState<StoryWithProfile | null>(null)
  const [groupIndex, setGroupIndex] = useState(startGroupIndex)
  const [storyIndex, setStoryIndex] = useState(startStoryIndex)
  const [progress, setProgress] = useState(0)
  const progressRef = useRef(0)
  useEffect(() => { progressRef.current = progress }, [progress])
  const [videoSceneIndex, setVideoSceneIndex] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const loopCheckRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const deleteStory = useDeleteStory()

  // --- Interaction UI state -------------------------------------------
  const [showMenu, setShowMenu] = useState(false)
  const [showHideViewers, setShowHideViewers] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [showReactionBar, setShowReactionBar] = useState(false)
  const [showViews, setShowViews] = useState(false)
  const [showLikers, setShowLikers] = useState(false)
  const [showReactors, setShowReactors] = useState(false)
  const [messageText, setMessageText] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const [messageSent, setMessageSent] = useState(false)

  const group = groups[groupIndex]
  const story = group?.stories[storyIndex]
  const isOwn = currentUserId === story?.user_id

  // Anything that opens a panel or has the person actively typing pauses
  // the auto-advance timer/video, same as Instagram.
  const paused = isAddingToMyStory || showMenu || showHideViewers || showDeleteConfirm || showComments || showReactionBar || showViews || showLikers || showReactors || messageText.length > 0 || !!originalStoryToOpen
  const pausedRef = useRef(paused)
  useEffect(() => { pausedRef.current = paused }, [paused])

  // Reset all per-story interaction UI whenever the story being shown changes.
  useEffect(() => {
    setShowMenu(false)
    setShowComments(false)
    setShowReactionBar(false)
    setShowViews(false)
    setShowLikers(false)
    setShowReactors(false)
    setMessageText('')
    setSendError(null)
    setMessageSent(false)
  }, [groupIndex, storyIndex])

  const { data: mentionRecords = [] } = useStoryMentions(story?.id)

  useEffect(() => {
    let active = true
    if (!story?.original_story_id) { setOriginalStoryInfo(null); return }
    supabase.from('stories').select('*, profiles!stories_user_id_fkey(*)').eq('id', story.original_story_id).maybeSingle().then(({ data }) => {
      if (active) setOriginalStoryInfo(data as StoryWithProfile | null)
    })
    return () => { active = false }
  }, [story?.id, story?.original_story_id])
  const { data: likeData } = useStoryLike(story?.id, currentUserId)
  const toggleLike = useToggleStoryLike()
  const { data: myReaction } = useStoryReaction(story?.id, currentUserId)
  const setReaction = useSetStoryReaction()
  const removeReaction = useRemoveStoryReaction()
  const { data: commentThread = [] } = useCommentThread('story', story?.id, currentUserId, story?.user_id)
  const replyToStory = useReplyToStory()
  const recordView = useRecordStoryView()
  const { data: views = [] } = useStoryViews(story?.id, isOwn)
  const { data: likers = [] } = useStoryLikers(story?.id, showLikers)
  const { data: reactors = [] } = useStoryReactors(story?.id, showReactors)

  // Log a view the moment a non-owner lands on this story (once per story,
  // guarded server-side too via the unique story_id+viewer_id constraint).
  useEffect(() => {
    if (story && currentUserId && !isOwn) {
      recordView.mutate({ storyId: story.id, viewerId: currentUserId })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id, currentUserId, isOwn])

  const goNextStory = () => {
    if (!group) return
    if (storyIndex < group.stories.length - 1) {
      setStoryIndex((i) => i + 1)
    } else if (groupIndex < groups.length - 1) {
      setGroupIndex((g) => g + 1)
      setStoryIndex(0)
    } else if (onReachEnd) {
      onReachEnd()
    } else {
      onClose()
    }
  }

  const goPrevStory = () => {
    if (!group) return
    if (storyIndex > 0) {
      setStoryIndex((i) => i - 1)
    } else if (groupIndex > 0) {
      const prevGroup = groups[groupIndex - 1]
      setGroupIndex((g) => g - 1)
      setStoryIndex(prevGroup.stories.length - 1)
    }
  }

  // Progress + auto-advance timer for text/photo stories. Tracks elapsed
  // time itself (rather than just diffing against a fixed start) so that
  // pausing (typing a reply, opening comments/menu, etc.) truly freezes the
  // clock instead of the bar jumping ahead once resumed.
  useEffect(() => {
    setProgress(0)
    if (timerRef.current) clearInterval(timerRef.current)
    if (!story || story.story_type === 'video') return

    let elapsed = 0
    let last = Date.now()
    const durationMs = (story.duration_seconds || 5) * 1000
    timerRef.current = setInterval(() => {
      const now = Date.now()
      const delta = now - last
      last = now
      if (!pausedRef.current) elapsed += delta
      const pct = Math.min(100, (elapsed / durationMs) * 100)
      setProgress(pct)
      if (pct >= 100) {
        if (timerRef.current) clearInterval(timerRef.current)
        goNextStory()
      }
    }, 50)

    return () => { if (timerRef.current) clearInterval(timerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupIndex, storyIndex])

  // Progress for video stories, driven by actual playback time. Advances
  // through each clip in a multi-scene video story before moving on to the
  // next story post.
  useEffect(() => {
    setVideoSceneIndex(0)
  }, [groupIndex, storyIndex])

  useEffect(() => {
    if (!story || story.story_type !== 'video') return
    const video = videoRef.current
    if (!video) return

    const scenes = story.video_scenes
    const scene = scenes?.[videoSceneIndex]
    const trimStart = Math.max(0, scene?.trimStart ?? 0)
    const trimEnd = Math.max(trimStart + 0.1, scene?.trimEnd ?? (trimStart + (scene?.duration ?? video.duration ?? 1)))
    const priorDuration = scenes ? scenes.slice(0, videoSceneIndex).reduce((s, x) => s + x.duration, 0) : 0
    let completed = false

    const advance = () => {
      if (completed) return
      completed = true
      video.pause()
      if (scenes && videoSceneIndex < scenes.length - 1) {
        setVideoSceneIndex((i) => i + 1)
      } else {
        goNextStory()
      }
    }
    const onTimeUpdate = () => {
      if (video.currentTime < trimStart) {
        video.currentTime = trimStart
        return
      }
      const elapsedInClip = Math.max(0, Math.min(scene?.duration ?? trimEnd - trimStart, video.currentTime - trimStart))
      const total = story.duration_seconds || video.duration || 1
      setProgress(Math.min(100, ((priorDuration + elapsedInClip) / total) * 100))
      if (video.currentTime >= trimEnd - 0.05) advance()
    }
    const onEnded = () => advance()

    if (video.readyState >= 1 && Math.abs(video.currentTime - trimStart) > 0.1) {
      video.currentTime = trimStart
    }
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('ended', onEnded)
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('ended', onEnded)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupIndex, storyIndex, videoSceneIndex])

  // Pause/resume the video element itself when a panel opens/closes or the
  // person starts typing.
  useEffect(() => {
    const video = videoRef.current
    if (!video || !story || story.story_type !== 'video') return
    if (paused) video.pause()
    else video.play().catch(() => {})
  }, [paused, story])

  // Pause/resume the background music the same way.
  useEffect(() => {
    if (!audioRef.current) return
    if (paused) audioRef.current.pause()
    else audioRef.current.play().catch(() => {})
  }, [paused])

  if (!group || !story) return null

  // For multi-scene stories, figure out which scene should be showing right
  // now, and pull that scene's own style/position/music from it. Falls
  // back to the story's top-level fields for single-scene or legacy posts.
  const totalDuration = story.duration_seconds || 5
  const elapsedSeconds = (progress / 100) * totalDuration
  const activeScene = story.story_type === 'text' ? getActiveScene<TextScene>(story.text_scenes, elapsedSeconds) : null
  const activePhotoScene = story.story_type === 'photo' ? getActiveScene<PhotoScene>(story.photo_scenes, elapsedSeconds) : null
  const activeVideoScene: VideoScene | null = story.story_type === 'video' && story.video_scenes ? (story.video_scenes[videoSceneIndex] ?? null) : null

  const displayText = activeScene ? activeScene.text : story.text_content
  const displayBackground = activeScene ? activeScene.backgroundColor : story.background_color
  const displayTextColor = activeScene ? activeScene.textColor : story.text_color
  const displayFont = activeScene ? (activeScene.fontFamily || story.global_font_family) : story.font_family
  const displayTextX = activeScene?.textX ?? 50
  const displayTextY = activeScene?.textY ?? 50
  const displayTextSize = activeScene?.textSize ?? 32

  const displayImageUrl = activePhotoScene ? activePhotoScene.imageUrl : story.media_url
  const displayVideoUrl = activeVideoScene ? activeVideoScene.videoUrl : story.media_url
  const photoTextInWindow = !!activePhotoScene?.overlayText && elapsedSeconds >= (activePhotoScene.overlayStart ?? 0) && elapsedSeconds < (activePhotoScene.overlayStart ?? 0) + (activePhotoScene.overlayDuration ?? totalDuration)
  const displayOverlayText = activePhotoScene ? (photoTextInWindow ? activePhotoScene.overlayText : null) : (activeVideoScene ? activeVideoScene.overlayText : story.overlay_text)
  const displayOverlayColor = activePhotoScene ? activePhotoScene.overlayTextColor : story.overlay_text_color
  const displayOverlayFont = activePhotoScene
    ? (activePhotoScene.overlayFontFamily || story.global_font_family)
    : activeVideoScene
      ? (activeVideoScene.overlayFontFamily || story.global_font_family)
      : story.overlay_font_family
  const displayOverlayX = activePhotoScene?.overlayX ?? activeVideoScene?.overlayX ?? story.overlay_x
  const displayOverlayY = activePhotoScene?.overlayY ?? activeVideoScene?.overlayY ?? story.overlay_y

  const sceneMusicUrl = activeScene?.musicUrl || activePhotoScene?.musicUrl || activeVideoScene?.musicUrl
  const activeMusicUrl = sceneMusicUrl || (story.story_type !== 'video' ? story.global_music?.url : undefined) || story.music_url || null
  const musicSource = sceneMusicUrl
    ? {
        title: activeScene?.musicTitle ?? activePhotoScene?.musicTitle ?? activeVideoScene?.musicTitle,
        artist: activeScene?.musicArtist ?? activePhotoScene?.musicArtist ?? activeVideoScene?.musicArtist,
        artwork: activeScene?.musicArtworkUrl ?? activePhotoScene?.musicArtworkUrl ?? activeVideoScene?.musicArtworkUrl,
        start: (activeScene?.musicStart ?? activePhotoScene?.musicStart ?? activeVideoScene?.musicStart) ?? 0,
        clipDuration: activeScene?.musicDuration ?? activePhotoScene?.musicDuration ?? activeVideoScene?.musicDuration,
      }
    : story.global_music
      ? { title: story.global_music.title, artist: story.global_music.artist, artwork: story.global_music.artworkUrl, start: story.global_music.start, clipDuration: story.global_music.duration }
      : { title: story.music_title, artist: story.music_artist, artwork: story.music_artwork_url, start: 0, clipDuration: undefined }
  const activeMusicTitle = musicSource.title
  const activeMusicArtist = musicSource.artist
  const activeMusicArtwork = musicSource.artwork
  const activeMusicLicenseUrl = story.global_music?.licenseUrl || null
  const musicStart = musicSource.start
  const musicClipDuration = musicSource.clipDuration
  const musicTimelineStart = story.story_type === 'photo' && !sceneMusicUrl ? (story.global_music?.timelineStart ?? 0) : 0

  // Load whichever font this particular scene/story needs (only fetched
  // once per font, cached after that - see loadGoogleFont).
  const activeFont = story.story_type === 'text' ? displayFont : (story.story_type === 'photo' || story.story_type === 'video' ? displayOverlayFont : story.overlay_font_family)
  if (activeFont) loadGoogleFont(activeFont)
  const activeOverlayTexts = activePhotoScene?.overlayTexts ?? activeVideoScene?.overlayTexts ?? []
  activeOverlayTexts.forEach(layer => { if (layer.fontFamily) loadGoogleFont(layer.fontFamily) })
  const activeMentions = mentionRecords

  // Play whichever song is active right now. Deliberately keyed on the
  // resolved music URL (not the scene id) - as long as consecutive scenes
  // keep resolving to the SAME song (the shared global one), this effect
  // won't re-run and the audio just keeps playing straight through instead
  // of restarting at every scene change. It only restarts when the song
  // actually changes (a scene's own separate song taking over, or back).
  useEffect(() => {
    audioRef.current?.pause()
    audioRef.current = null
    if (loopCheckRef.current) clearInterval(loopCheckRef.current)

    if (!activeMusicUrl) return

    const audio = new Audio(activeMusicUrl)
    audio.currentTime = musicStart
    audioRef.current = audio
    let hasStarted = false

    // Photo-story music can be positioned on the timeline. Start it only
    // inside its selected window and stop it when that window ends.
    loopCheckRef.current = setInterval(() => {
      const elapsed = (progressRef.current / 100) * (story.duration_seconds || 5)
      const trackStart = musicTimelineStart
      const trackEnd = trackStart + (musicClipDuration || (story.duration_seconds || 5))
      if (elapsed < trackStart || elapsed >= trackEnd) {
        audio.pause()
        if (elapsed >= trackEnd) hasStarted = false
        return
      }
      if (!hasStarted) {
        audio.currentTime = musicStart
        hasStarted = true
      }
      if (audio.paused) audio.play().catch(() => {})
      if (musicClipDuration && audio.currentTime >= musicStart + musicClipDuration) {
        audio.currentTime = musicStart
      }
    }, 100)

    if (story.story_type !== 'photo' || musicTimelineStart === 0) {
      audio.play().catch(() => {
        // Autoplay can be blocked in some browsers - not critical, the story
        // still plays fine without sound in that edge case.
      })
    } else {
      audio.pause()
    }

    return () => {
      audio.pause()
      if (loopCheckRef.current) clearInterval(loopCheckRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupIndex, storyIndex, activeMusicUrl])

  const handleDelete = async () => {
    setShowDeleteConfirm(false)
    audioRef.current?.pause()
    await deleteStory.mutateAsync({ storyId: story.id, mediaUrl: story.media_url })
    if (group.stories.length <= 1) {
      onClose()
    } else {
      goNextStory()
    }
  }

  const handleLike = () => {
    if (!currentUserId || !likeData) return
    toggleLike.mutate({ storyId: story.id, userId: currentUserId, liked: likeData.liked, storyOwnerId: story.user_id })
  }

  const handleReact = (emoji: string) => {
    if (!currentUserId) return
    if (myReaction === emoji) {
      removeReaction.mutate({ storyId: story.id, userId: currentUserId })
    } else {
      setReaction.mutate({ storyId: story.id, userId: currentUserId, emoji, storyOwnerId: story.user_id })
    }
    setShowReactionBar(false)
  }

  const handleSendMessage = async () => {
    if (!messageText.trim() || !currentUserId) return
    try {
      await replyToStory.mutateAsync({
        storyId: story.id,
        storyOwnerId: story.user_id,
        senderId: currentUserId,
        content: messageText.trim(),
      })
      setMessageText('')
      setMessageSent(true)
      setTimeout(() => setMessageSent(false), 2000)
    } catch (e: any) {
      setSendError(e?.message || 'Message could not be sent.')
      setTimeout(() => setSendError(null), 3000)
    }
  }

  return (
    <div className="fixed inset-0 bg-black z-[100] flex items-center justify-center">
      <div className="relative w-full h-full sm:max-w-sm sm:h-[90vh] sm:rounded-2xl overflow-hidden bg-black">
        {/* Progress bars */}
        <div className="absolute top-2 left-2 right-2 z-20 flex gap-1">
          {group.stories.map((_, i) => (
            <div key={i} className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full"
                style={{
                  width: i < storyIndex ? '100%' : i === storyIndex ? `${progress}%` : '0%',
                  transition: i === storyIndex ? 'width 50ms linear' : undefined,
                }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute top-5 left-2 right-2 z-20 flex items-center justify-between">
          <button
            onClick={() => router.push(`/profile/${group.profile?.username}`)}
            className="flex items-center gap-2"
          >
            <Avatar className="h-8 w-8 border border-white/30">
              <AvatarImage src={getAvatarUrl(group.profile?.avatar_url)} />
              <AvatarFallback>{group.profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-white text-sm font-medium leading-none flex items-center gap-1">
                {group.profile?.username}
                {group.profile?.is_verified && <VerifiedBadge type={group.profile.verification_type} className="text-xs" />}
              </p>
              <p className="text-white/60 text-xs mt-0.5">{formatTimeAgo(story.created_at)}</p>
            </div>
          </button>
          <div className="flex items-center gap-3">
            {isOwn ? (
              <div className="relative">
                <button onClick={() => setShowMenu((v) => !v)} className="text-white/80 hover:text-white">
                  <MoreVertical className="h-5 w-5" />
                </button>
                {showMenu && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setShowMenu(false)} />
                    <div className="absolute right-0 top-8 bg-card rounded-xl shadow-xl overflow-hidden w-48 z-30 text-foreground">
                      <button
                        onClick={() => { setShowMenu(false); setShowHideViewers(true) }}
                        className="w-full flex items-center gap-2.5 px-4 py-3 text-sm hover:bg-muted transition-colors"
                      >
                        <EyeOff className="h-4 w-4" /> Hide Story from...
                      </button>
                      <button
                        onClick={() => { setShowMenu(false); setShowDeleteConfirm(true) }}
                        className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" /> Delete Story
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : currentUserId ? (
              <div className="relative">
                <button onClick={() => setShowMenu((v) => !v)} className="text-white/80 hover:text-white">
                  <MoreVertical className="h-5 w-5" />
                </button>
                {showMenu && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setShowMenu(false)} />
                    <div className="absolute right-0 top-8 bg-card rounded-xl shadow-xl overflow-hidden w-48 z-30 text-foreground">
                      <button
                        onClick={() => { setShowMenu(false); setShowReport(true) }}
                        className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
                      >
                        <Flag className="h-4 w-4" /> Report
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : null}
            <button onClick={onClose} className="text-white/80 hover:text-white">
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
          {story.story_type === 'text' && (
            <div
              className="w-full h-full relative"
              style={{ background: resolveBackgroundCss(displayBackground) }}
            >
              <p
                style={{
                  position: 'absolute',
                  left: `${displayTextX}%`,
                  top: `${displayTextY}%`,
                  transform: 'translate(-50%, -50%)',
                  ...getTextFillStyle(displayTextColor),
                  fontFamily: displayFont ? `'${displayFont}', sans-serif` : undefined,
                  fontSize: `${displayTextSize}px`,
                }}
                className="text-center font-semibold break-words max-w-[85%]"
              >
                {displayText}
              </p>
            </div>
          )}

          {story.story_type === 'photo' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={displayImageUrl || ''} alt="Story" className="max-w-full max-h-full object-contain" style={{ transform: `translate(${activePhotoScene?.photoOffsetX ?? 0}%, ${activePhotoScene?.photoOffsetY ?? 0}%) scale(${activePhotoScene?.photoScale ?? 1})`, transformOrigin: 'center center' }} />
          )}

          {story.story_type === 'video' && (
            <video
              key={activeVideoScene?.id || story.id}
              ref={videoRef}
              src={displayVideoUrl || ''}
              className="max-w-full max-h-full object-contain"
              autoPlay
              playsInline
              // If a song was picked, the clip's own sound is muted so the
              // chosen song plays instead - same as Instagram/Reels behavior.
              muted={!!activeMusicUrl}
              onLoadedMetadata={event => {
                const start = Math.max(0, activeVideoScene?.trimStart ?? 0)
                if (Math.abs(event.currentTarget.currentTime - start) > 0.1) event.currentTarget.currentTime = start
              }}
            />
          )}

          {activeOverlayTexts.length > 0 && story.story_type !== 'text' ? activeOverlayTexts.filter(layer => story.story_type === 'video' || (elapsedSeconds >= (layer.start ?? 0) && elapsedSeconds < (layer.start ?? 0) + (layer.duration ?? totalDuration))).map(layer => (
            <div key={layer.id} style={{ left: `${layer.x}%`, top: `${layer.y}%`, transform: `translate(-50%, -50%) rotate(${layer.rotation ?? 0}deg)`, fontSize: `${20 * layer.scale}px`, color: layer.color || undefined, pointerEvents: 'none' }} className="absolute max-w-[85%] px-2 text-center font-bold break-words">
              <p style={{ ...(layer.color ? { color: layer.color } : getTextFillStyle(displayOverlayColor)), textShadow: '0 1px 6px rgba(0,0,0,0.6)', fontFamily: layer.fontFamily !== undefined ? (layer.fontFamily ? `'${layer.fontFamily}', sans-serif` : undefined) : (displayOverlayFont ? `'${displayOverlayFont}', sans-serif` : undefined) }}>{layer.text}</p>
            </div>
          )) : displayOverlayText && story.story_type !== 'text' && (
            <div style={{ left: `${displayOverlayX}%`, top: `${displayOverlayY}%`, transform: 'translate(-50%, -50%)' }} className="absolute max-w-[85%] text-center px-2">
              <p className="text-xl font-bold break-words" style={{ ...getTextFillStyle(displayOverlayColor), textShadow: displayOverlayColor?.startsWith('gradient:') ? undefined : '0 1px 6px rgba(0,0,0,0.6)', fontFamily: displayOverlayFont ? `'${displayOverlayFont}', sans-serif` : undefined }}>{displayOverlayText}</p>
            </div>
          )}

          {activeMentions.map(mention => (
            <button key={mention.id} type="button" onPointerDown={event => { event.stopPropagation() }} onClick={event => { event.stopPropagation(); router.push(`/profile/${encodeURIComponent(mention.username)}`) }} aria-label={`Open @${mention.username}'s profile`} className="absolute z-20 flex max-w-[88%] items-center gap-2 rounded-full border border-white/50 bg-black/75 px-3 py-2 text-left text-white shadow-lg backdrop-blur-sm hover:bg-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400" style={{ left: `${mention.x}%`, top: `${mention.y}%`, transform: `translate(-50%, -50%) scale(${mention.scale})` }}>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pink-500/25 text-xs font-bold text-pink-100">@</span>
              <span className="max-w-40 truncate text-sm font-semibold">@{mention.username}</span>
            </button>
          ))}
          {activeMusicTitle && (
            <div
              className="absolute z-10 max-w-[88%]"
              style={{
                left: `${story.global_music?.stickerX ?? 50}%`,
                top: `${story.global_music?.stickerY ?? 82}%`,
                transform: `translate(-50%, -50%) rotate(${story.global_music?.stickerRotation ?? 0}deg) scale(${story.global_music?.stickerScale ?? 1})`,
                transformOrigin: 'center',
              }}
            >
              {(story.global_music?.stickerStyle ?? 'pill') === 'pill' && (
                <div className="flex max-w-full items-center gap-2 rounded-full bg-black/50 py-1.5 pl-1.5 pr-3 text-white shadow backdrop-blur-sm">
                  {activeMusicArtwork ? <img src={activeMusicArtwork} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" /> : <Music className="h-4 w-4 shrink-0" />}
                  <span className="max-w-56 truncate text-xs font-medium">{activeMusicTitle}{activeMusicArtist ? ` · ${activeMusicArtist}` : ''}</span>
                  {activeMusicLicenseUrl && <a href={activeMusicLicenseUrl} onClick={e => e.stopPropagation()} target="_blank" rel="noreferrer" aria-label="View music licence" className="shrink-0 text-[10px] underline">Licence</a>}
                </div>
              )}
              {(story.global_music?.stickerStyle ?? 'pill') === 'cover' && (
                <div className="flex w-56 max-w-full items-center gap-2 rounded-lg border border-white/15 bg-black/75 p-2 text-white shadow-lg backdrop-blur">
                  {activeMusicArtwork && <img src={activeMusicArtwork} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />}
                  <div className="min-w-0"><p className="truncate text-sm font-bold">{activeMusicTitle}</p><p className="truncate text-xs text-white/75">{activeMusicArtist}</p><div className="mt-1 h-1 rounded-full bg-white/25"><div className="h-full w-2/3 rounded-full bg-white/80" /></div></div>
                </div>
              )}
              {(story.global_music?.stickerStyle ?? 'pill') === 'square' && (
                <div className="w-36 max-w-full overflow-hidden rounded-xl bg-white text-black shadow-xl">
                  {activeMusicArtwork && <img src={activeMusicArtwork} alt="" className="aspect-square w-full object-cover" />}
                  <div className="px-2.5 py-2"><p className="truncate text-sm font-semibold">{activeMusicTitle}</p><p className="truncate text-xs text-neutral-600">♫ {activeMusicArtist}</p></div>
                </div>
              )}
              {(story.global_music?.stickerStyle ?? 'pill') === 'vinyl' && (
                <div className="flex max-w-full items-center gap-2 rounded-xl bg-neutral-950/90 p-2 text-white shadow-xl">
                  <div className="relative h-12 w-12 shrink-0 rounded-full border border-white/20 bg-gradient-to-br from-neutral-700 via-black to-neutral-900 p-1"><div className="h-full w-full rounded-full border border-white/15 p-1">{activeMusicArtwork ? <img src={activeMusicArtwork} alt="" className="h-full w-full rounded-full object-cover" /> : <Music className="h-full w-full p-2" />}</div></div>
                  <div className="min-w-0"><p className="max-w-40 truncate text-sm font-bold">{activeMusicTitle}</p><p className="max-w-40 truncate text-xs text-white/70">{activeMusicArtist}</p><div className="mt-1 flex items-center gap-[2px]">{Array.from({ length: 16 }, (_, i) => <span key={i} className="w-[2px] rounded-full bg-white/75" style={{ height: `${4 + (i * 7 % 11)}px` }} />)}</div></div>
                </div>
              )}
              {(story.global_music?.stickerStyle ?? 'pill') === 'waveform' && (
                <div className="flex w-60 max-w-full items-center gap-2 rounded-md bg-neutral-950/85 px-3 py-2 text-white shadow-lg">
                  {activeMusicArtwork && <img src={activeMusicArtwork} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />}
                  <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{activeMusicTitle}</p><p className="truncate text-[10px] text-white/70">{activeMusicArtist}</p></div>
                  <div className="flex h-7 items-center gap-[2px]">{Array.from({ length: 13 }, (_, i) => <span key={i} className="w-[2px] rounded-full bg-white/80" style={{ height: `${5 + (i * 5 % 19)}px` }} />)}</div>
                </div>
              )}
            </div>
          )}

          {story.link_url && (
            // Tapping just opens the link normally - on a phone where the
            // source app (YouTube, Instagram, etc.) is installed and
            // registered for that domain as an App Link/Universal Link,
            // the OS opens the app itself; otherwise it opens in the
            // browser. That's the standard, reliable way this works
            // across Android/iOS without fragile custom URL-scheme hacks.
            <a
              href={story.link_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-white text-black rounded-full px-4 py-2 text-sm font-semibold shadow-lg z-20"
            >
              <ExternalLink className="h-4 w-4" />
              {story.link_label ? `Open in ${story.link_label}` : 'Open link'}
            </a>
          )}
        </div>

        {/* Tap zones for prev/next - kept short of the bottom action bar so
            taps there don't get swallowed as a "next story" tap. */}
        <button onClick={goPrevStory} className="absolute left-0 top-0 h-[calc(100%-84px)] w-1/3 z-10" aria-label="Previous story" />
        <button onClick={goNextStory} className="absolute right-0 top-0 h-[calc(100%-84px)] w-2/3 z-10" aria-label="Next story" />

        {(story.original_story_id || showOriginalAttribution) && (
          <button type="button" onClick={(event) => {
            event.stopPropagation()
            if (story.original_story_id) {
              if (originalStoryInfo) setOriginalStoryToOpen(originalStoryInfo)
            } else {
              const username = story.profiles?.username
              if (username) router.push(`/profile/${encodeURIComponent(username)}`)
            }
          }} disabled={story.original_story_id ? !originalStoryInfo : !story.profiles?.username}
            className="absolute bottom-[88px] left-3 z-30 max-w-[68%] truncate rounded-full border border-white/20 bg-black/65 px-3 py-2 text-left text-[11px] font-semibold text-white shadow-lg backdrop-blur-md disabled:cursor-default disabled:opacity-80"
            aria-label={`View original story by @${story.original_story_username || originalStoryInfo?.profiles?.username || story.profiles?.username || 'user'}`}>
            ↗ Original Story by @{story.original_story_username || originalStoryInfo?.profiles?.username || story.profiles?.username || 'user'}
          </button>
        )}

        {onAddToMyStory && !isOwn && (
          <button type="button" onClick={(event) => { event.stopPropagation(); onAddToMyStory(story) }} disabled={isAddingToMyStory}
            className="absolute bottom-[88px] right-3 z-30 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-xs font-bold text-black shadow-xl transition hover:bg-white/90 disabled:opacity-60">
            {isAddingToMyStory ? <Loader2 className="h-4 w-4 animate-spin" /> : <span aria-hidden="true">↗</span>}
            {isAddingToMyStory ? 'Adding…' : 'Add to My Story'}
          </button>
        )}

        {/* Bottom action bar */}
        <div className="absolute bottom-0 left-0 right-0 z-30 px-3 pb-4 pt-3 bg-gradient-to-t from-black/60 to-transparent">
          {showReactionBar && (
            <div className="flex items-center gap-2.5 mb-3 bg-black/40 backdrop-blur-sm rounded-full py-2 px-3 mx-auto max-w-[85vw] overflow-x-auto flex-nowrap scrollbar-hide">
              {STORY_REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleReact(emoji)}
                  className={cn('text-2xl shrink-0 transition-transform hover:scale-125', myReaction === emoji && 'scale-125')}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {sendError && (
            <p className="text-center text-xs text-red-400 mb-2">{sendError}</p>
          )}
          {messageSent && (
            <p className="text-center text-xs text-green-400 mb-2">Message sent!</p>
          )}

          {isOwn ? (
            <div className="w-full flex items-center justify-between text-white/90 text-sm py-1">
              <button onClick={() => setShowViews(true)} className="flex items-center gap-1.5">
                <Eye className="h-4 w-4" /> {views.length}
              </button>
              <div className="flex items-center gap-4">
                <button onClick={() => setShowLikers(true)} className="flex items-center gap-1.5">
                  <Heart className="h-4 w-4" /> {likeData?.count ?? 0}
                </button>
                <button onClick={() => setShowReactors(true)} className="flex items-center gap-1.5">
                  <span className="text-base leading-none">😊</span> {reactors.length}
                </button>
                <button onClick={() => setShowComments(true)} className="flex items-center gap-1.5">
                  <MessageCircle className="h-4 w-4" /> {countThread(commentThread)}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSendMessage() }}
                placeholder="Send message"
                className="flex-1 min-w-0 bg-white/10 backdrop-blur-sm border border-white/30 rounded-full px-4 py-2.5 text-white text-sm placeholder-white/60 outline-none"
              />
              {messageText.trim() ? (
                <button
                  onClick={handleSendMessage}
                  disabled={replyToStory.isPending}
                  className="text-white shrink-0"
                >
                  {replyToStory.isPending ? <Loader2 className="h-6 w-6 animate-spin" /> : <Send className="h-6 w-6" />}
                </button>
              ) : (
                <>
                  <button onClick={handleLike} className="text-white shrink-0">
                    <Heart className={cn('h-6 w-6', likeData?.liked && 'fill-red-500 text-red-500')} />
                  </button>
                  <button onClick={() => setShowReactionBar((v) => !v)} className="text-2xl leading-none shrink-0">
                    {myReaction || '😊'}
                  </button>
                  <button onClick={() => setShowComments(true)} className="text-white shrink-0">
                    <MessageCircle className="h-6 w-6" />
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Views panel (owner only) */}
        {showViews && (
          <div className="absolute inset-0 z-40 flex flex-col justify-end">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowViews(false)} />
            <div className="relative bg-card rounded-t-2xl max-h-[60%] flex flex-col text-foreground">
              <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
                <h3 className="font-bold">Viewed by {views.length}</h3>
                <button onClick={() => setShowViews(false)} className="p-1 rounded-full hover:bg-muted">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="overflow-y-auto flex-1 p-3 space-y-3">
                {views.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No views yet.</p>
                ) : (
                  views.map((v) => (
                    <div key={v.viewer_id} className="flex items-center gap-2.5">
                      <Link href={`/profile/${v.profiles?.username}`} onClick={e => e.stopPropagation()}>
                        <Avatar className="h-9 w-9 shrink-0">
                          <AvatarImage src={getAvatarUrl(v.profiles?.avatar_url)} />
                          <AvatarFallback>{v.profiles?.username?.[0]?.toUpperCase()}</AvatarFallback>
                        </Avatar>
                      </Link>
                      <Link href={`/profile/${v.profiles?.username}`} onClick={e => e.stopPropagation()} className="flex-1 min-w-0 flex items-center gap-1">
                        <p className="text-sm font-medium truncate hover:underline">{v.profiles?.username}</p>
                        {v.profiles?.is_verified && <VerifiedBadge type={v.profiles.verification_type} className="text-xs shrink-0" />}
                      </Link>
                      <p className="text-[11px] text-muted-foreground shrink-0">{formatTimeAgo(v.viewed_at)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Likers panel (owner only) */}
        {showLikers && (
          <div className="absolute inset-0 z-40 flex flex-col justify-end">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowLikers(false)} />
            <div className="relative bg-card rounded-t-2xl max-h-[60%] flex flex-col text-foreground">
              <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
                <h3 className="font-bold">Liked by {likers.length}</h3>
                <button onClick={() => setShowLikers(false)} className="p-1 rounded-full hover:bg-muted">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="overflow-y-auto flex-1 p-3 space-y-3">
                {likers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No likes yet.</p>
                ) : (
                  likers.map((l) => (
                    <div key={l.user_id} className="flex items-center gap-2.5">
                      <Link href={`/profile/${l.profiles?.username}`} onClick={e => e.stopPropagation()}>
                        <Avatar className="h-9 w-9 shrink-0">
                          <AvatarImage src={getAvatarUrl(l.profiles?.avatar_url)} />
                          <AvatarFallback>{l.profiles?.username?.[0]?.toUpperCase()}</AvatarFallback>
                        </Avatar>
                      </Link>
                      <Link href={`/profile/${l.profiles?.username}`} onClick={e => e.stopPropagation()} className="flex-1 min-w-0 flex items-center gap-1">
                        <p className="text-sm font-medium truncate hover:underline">{l.profiles?.username}</p>
                        {l.profiles?.is_verified && <VerifiedBadge type={l.profiles.verification_type} className="text-xs shrink-0" />}
                      </Link>
                      <Heart className="h-4 w-4 fill-red-500 text-red-500 shrink-0" />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Reactors panel (owner only) */}
        {showReactors && (
          <div className="absolute inset-0 z-40 flex flex-col justify-end">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowReactors(false)} />
            <div className="relative bg-card rounded-t-2xl max-h-[60%] flex flex-col text-foreground">
              <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
                <h3 className="font-bold">Reactions ({reactors.length})</h3>
                <button onClick={() => setShowReactors(false)} className="p-1 rounded-full hover:bg-muted">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="overflow-y-auto flex-1 p-3 space-y-3">
                {reactors.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No reactions yet.</p>
                ) : (
                  reactors.map((r) => (
                    <div key={r.user_id} className="flex items-center gap-2.5">
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarImage src={getAvatarUrl(r.profiles?.avatar_url)} />
                        <AvatarFallback>{r.profiles?.username?.[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0 flex items-center gap-1">
                        <p className="text-sm font-medium truncate">{r.profiles?.username}</p>
                        {r.profiles?.is_verified && <VerifiedBadge type={r.profiles.verification_type} className="text-xs shrink-0" />}
                      </div>
                      <span className="text-xl leading-none shrink-0">{r.emoji}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Comments panel */}
        {showComments && (
          <div className="absolute inset-0 z-40 flex flex-col justify-end">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowComments(false)} />
            <div className="relative bg-card rounded-t-2xl max-h-[60%] flex flex-col text-foreground">
              <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
                <h3 className="font-bold">Comments</h3>
                <button onClick={() => setShowComments(false)} className="p-1 rounded-full hover:bg-muted">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-3 flex-1 overflow-hidden flex flex-col">
                <CommentThread
                  target="story"
                  targetId={story.id}
                  currentUserId={currentUserId}
                  ownerId={story.user_id}
                  commentRestrictedUntil={profile?.restrict_comment_until}
                  hideComposer={isOwn}
                  emptyText="No comments yet."
                  variant="compact"
                  className="flex-1 flex flex-col min-h-0"
                  listClassName="flex-1"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {showHideViewers && (
        <StoryHideViewersModal ownerId={story.user_id} onClose={() => setShowHideViewers(false)} />
      )}
      {showReport && currentUserId && (
        <ReportModal
          reporterId={currentUserId}
          reportedUserId={story.user_id}
          targetType="story"
          targetId={story.id}
          onClose={() => setShowReport(false)}
        />
      )}
      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete this story?"
          description="This can't be undone. Your story will be permanently removed."
          confirmLabel="Delete"
          loading={deleteStory.isPending}
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={handleDelete}
        />
      )}
      {originalStoryToOpen && (
        <StoryViewer groups={[{ userId: originalStoryToOpen.user_id, profile: originalStoryToOpen.profiles, stories: [originalStoryToOpen] }]} startGroupIndex={0} currentUserId={currentUserId} onClose={() => setOriginalStoryToOpen(null)} />
      )}
    </div>
  )
}
