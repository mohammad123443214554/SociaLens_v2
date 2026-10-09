'use client'

import { useState, useRef } from 'react'
import { X, ImageIcon, Film, ArrowLeft, Hash, FileText, Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useUser } from '@/lib/hooks/useUser'
import { createClient } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/utils/helpers'
import { compressImageIfNeeded, LONG_CACHE_CONTROL } from '@/lib/utils/imageCompression'
import { isRestricted } from '@/lib/utils/restrictionCheck'
import { RestrictionPopup } from '@/components/shared/RestrictionPopup'
import { LimitAlertDialog } from '@/components/shared/LimitAlertDialog'
import { PostShareAdOverlay } from '@/components/ads/PostShareAdOverlay'
import { useQueryClient } from '@tanstack/react-query'

interface CreatePostModalProps {
  onClose: () => void
}

// Media gets sent to Aperonix as inline data, which keeps things simple but
// Is limited by the server's request size limit - So anything much bigger
// Than this is turned away up front with a friendly message instead of
// Attempting the request and failing with a confusing technical error.
const MAX_AI_MEDIA_BYTES = 3.5 * 1024 * 1024 // ~3.5MB raw file (safely under Vercel's ~4.5MB request limit once base64-encoded)
const MAX_POST_VIDEO_SECONDS = 20 * 60 // 20 minutes

// Curated SociaLens hashtag suggestions - shown as autocomplete while typing
const SUGGESTED_HASHTAGS = [
  'socialens', 'reels', 'trending', 'viral', 'explore', 'photography',
  'travel', 'foodie', 'fashion', 'nature', 'love', 'instagood',
  'fitness', 'art', 'music', 'throwback', 'selfie', 'friends',
  'memories', 'life', 'sunset', 'ootd', 'motivation', 'reelsindia',
  'reelitfeelit', 'explorepage', 'socialensers',
]

// Converts a File into a raw base64 string (no "data:mime;base64," prefix) for
// sending to the Gemini API.
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Finds the hashtag "word" the cursor is currently inside of, e.g.
// typing "hello #re|els world" (| = cursor) returns { word: '#re', start: 6, end: 9 }
function getActiveHashtagWord(value: string, cursorPos: number) {
  const before = value.slice(0, cursorPos)
  const hashIndex = before.lastIndexOf('#')
  if (hashIndex === -1) return null
  // If there's whitespace between the last # and the cursor, we're not in a tag anymore
  const between = before.slice(hashIndex + 1)
  if (/\s/.test(between)) return null
  // Extend to the end of the word (in case cursor isn't at the very end of it)
  const afterMatch = value.slice(cursorPos).match(/^[\w\u0600-\u06FF]*/)
  const end = cursorPos + (afterMatch ? afterMatch[0].length : 0)
  return { word: value.slice(hashIndex, end), start: hashIndex, end }
}

export function CreatePostModal({ onClose }: CreatePostModalProps) {
  const { user, profile } = useUser()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<'select' | 'details'>('select')
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [mediaPreview, setMediaPreview] = useState<string | null>(null)
  const [mediaType, setMediaType] = useState<'image' | 'video' | 'none'>('none')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [posting, setPosting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const hashtagInputRef = useRef<HTMLInputElement>(null)
  const [hashtagSuggestions, setHashtagSuggestions] = useState<string[]>([])
  const [showHashtagSuggestions, setShowHashtagSuggestions] = useState(false)

  // Aperonix "watch the media and generate" state - one loading/generated flag per field
  const [generating, setGenerating] = useState<Record<'title' | 'description' | 'hashtags', boolean>>({
    title: false, description: false, hashtags: false,
  })
  const [generated, setGenerated] = useState<Record<'title' | 'description' | 'hashtags', boolean>>({
    title: false, description: false, hashtags: false,
  })
  const [generateError, setGenerateError] = useState('')
  const [aiContext, setAiContext] = useState('')
  const [showRestrictionPopup, setShowRestrictionPopup] = useState(false)
  const [showVideoLimitPopup, setShowVideoLimitPopup] = useState(false)
  const [checkingVideo, setCheckingVideo] = useState(false)
  const [showShareAd, setShowShareAd] = useState(false)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    if (file.type.startsWith('video')) {
      setCheckingVideo(true)
      const duration = await new Promise<number>((resolve) => {
        const video = document.createElement('video')
        const url = URL.createObjectURL(file)
        video.preload = 'metadata'
        video.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(video.duration) }
        video.onerror = () => { URL.revokeObjectURL(url); resolve(0) }
        video.src = url
      })
      setCheckingVideo(false)
      if (duration > MAX_POST_VIDEO_SECONDS) {
        setShowVideoLimitPopup(true)
        return
      }
    }

    setMediaFile(file)
    setMediaType(file.type.startsWith('video') ? 'video' : 'image')
    setMediaPreview(URL.createObjectURL(file))
    setStep('details')
  }

  const handleTextOnly = () => {
    setMediaType('none')
    setMediaPreview(null)
    setMediaFile(null)
    setStep('details')
  }

  const generateField = async (field: 'title' | 'description' | 'hashtags') => {
    const hasMedia = !!mediaFile
    const hasContext = mediaType === 'none' && aiContext.trim().length > 0
    if (!hasMedia && !hasContext) {
      setGenerateError('Type a quick note above about what this post is about first, so Aperonix knows what to write.')
      return
    }

    if (hasMedia && mediaFile!.size > MAX_AI_MEDIA_BYTES) {
      setGenerateError('This content is very long for Aperonix to look at right now. Try a shorter photo/video, or write the details yourself.')
      return
    }

    setGenerateError('')
    setGenerating(prev => ({ ...prev, [field]: true }))
    try {
      const previousResult = field === 'title' ? title : field === 'description' ? description : hashtags
      const mediaBase64 = hasMedia ? await fileToBase64(mediaFile!) : undefined

      const res = await fetch('/api/aperonix/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaBase64,
          mimeType: hasMedia ? mediaFile!.type : undefined,
          context: hasMedia ? undefined : aiContext.trim(),
          field,
          regenerate: generated[field],
          previousResult: generated[field] ? previousResult : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Try again later.')

      if (field === 'title') setTitle(data.result.slice(0, 100))
      else if (field === 'description') setDescription(data.result.slice(0, 2200))
      else setHashtags(data.result)

      setGenerated(prev => ({ ...prev, [field]: true }))
    } catch (err: any) {
      // A request that's too large for the server to accept fails at the
      // network level (not a normal JSON error response) - treat that the
      // same friendly way rather than showing a raw technical message.
      const looksLikeSizeIssue = err?.message?.toLowerCase().includes('fetch') || err?.name === 'TypeError'
      setGenerateError(
        hasMedia && looksLikeSizeIssue
          ? 'This content is very long for Aperonix to look at right now. Try a shorter photo/video, or write the details yourself.'
          : (err.message || 'Try again later.')
      )
    } finally {
      setGenerating(prev => ({ ...prev, [field]: false }))
    }
  }

  const handleHashtagsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setHashtags(value)

    const cursorPos = e.target.selectionStart ?? value.length
    const active = getActiveHashtagWord(value, cursorPos)
    // Prefix after the # - only start suggesting once the person has typed
    // at least 2 characters, so e.g. "#re" is needed before "#reels" shows up
    // (matches the "type before it suggests" behavior asked for, YouTube-style)
    const prefix = active ? active.word.slice(1).toLowerCase() : ''

    if (active && prefix.length >= 2) {
      const matches = SUGGESTED_HASHTAGS.filter(tag => tag.toLowerCase().startsWith(prefix)).slice(0, 5)
      setHashtagSuggestions(matches)
      setShowHashtagSuggestions(matches.length > 0)
    } else {
      setHashtagSuggestions([])
      setShowHashtagSuggestions(false)
    }
  }

  const handleSelectHashtagSuggestion = (tag: string) => {
    const input = hashtagInputRef.current
    const cursorPos = input?.selectionStart ?? hashtags.length
    const active = getActiveHashtagWord(hashtags, cursorPos)
    if (!active) return

    const before = hashtags.slice(0, active.start)
    const after = hashtags.slice(active.end)
    const needsSpace = after.length > 0 && !after.startsWith(' ')
    const newValue = `${before}#${tag}${needsSpace ? ' ' : ''}${after}`
    setHashtags(newValue)
    setHashtagSuggestions([])
    setShowHashtagSuggestions(false)

    // Put the cursor right after the inserted tag
    requestAnimationFrame(() => {
      const newCursorPos = before.length + tag.length + 1
      input?.focus()
      input?.setSelectionRange(newCursorPos, newCursorPos)
    })
  }

  const buildContent = () => {
    const parts = []
    if (title.trim()) parts.push(`**${title.trim()}**`)
    if (description.trim()) parts.push(description.trim())
    if (hashtags.trim()) {
      const tags = hashtags.trim().split(/\s+/).map(t => t.startsWith('#') ? t : `#${t}`).join(' ')
      parts.push(tags)
    }
    return parts.join('\n\n')
  }

  const handlePost = async () => {
    if (!user) return
    if (isRestricted(profile?.restrict_post_until)) {
      setShowRestrictionPopup(true)
      return
    }
    setPosting(true)
    setUploadProgress(0)

    try {
      let media_url: string | null = null
      if (mediaFile) {
        setUploadProgress(20)
        const fileToUpload = await compressImageIfNeeded(mediaFile)
        setUploadProgress(30)
        const ext = fileToUpload.name.split('.').pop()
        const path = `${user.id}/${Date.now()}.${ext}`
        const { error } = await supabase.storage.from('posts').upload(path, fileToUpload, {
          cacheControl: LONG_CACHE_CONTROL,
          contentType: fileToUpload.type || (mediaType === 'video' ? 'video/mp4' : 'application/octet-stream'),
          upsert: false,
        })
        if (error) throw error
        setUploadProgress(80)
        const { data: urlData } = supabase.storage.from('posts').getPublicUrl(path)
        media_url = urlData.publicUrl
      }

      const content = buildContent()
      setUploadProgress(90)

      const { error: postError } = await supabase
        .from('posts')
        .insert({
          user_id: user.id,
          content: content || null,
          media_url,
          media_type: mediaType,
        })

      if (postError) {
        throw new Error(`Post creation failed: ${postError.message}`)
      }
      await supabase.rpc('increment_posts_count', { profile_id: user.id })
      setUploadProgress(100)

      queryClient.invalidateQueries({ queryKey: ['feed-posts'] })
      queryClient.invalidateQueries({ queryKey: ['reels-posts'] })
      queryClient.invalidateQueries({ queryKey: ['explore-posts'] })
      queryClient.invalidateQueries({ queryKey: ['profile-posts'] })

      // The post is already live at this point - this brief sponsored
      // interstitial just fills the natural "posting..." pause before
      // closing, the same beat Instagram-style apps use for a short
      // unavoidable wait instead of a bare spinner.
      setShowShareAd(true)
      setTimeout(() => {
        setShowShareAd(false)
        onClose()
      }, 2500)
    } catch (err) {
      console.error(err)
      alert('Upload failed. Please try again.')
    } finally {
      setPosting(false)
      setUploadProgress(0)
    }
  }

  const renderContent = (content: string) => {
    return content.split('\n\n').map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <span key={i} className="font-bold">{part.slice(2, -2)}</span>
      }
      return <span key={i}>{part}</span>
    })
  }

  return (
    <>
      {showRestrictionPopup && (
        <RestrictionPopup feature="posting" until={profile?.restrict_post_until} onClose={() => setShowRestrictionPopup(false)} />
      )}
      {showVideoLimitPopup && (
        <LimitAlertDialog
          title="Video is too long"
          description="You can only upload a video up to 20 minutes long for a post. Please trim it or pick a shorter one."
          onClose={() => setShowVideoLimitPopup(false)}
        />
      )}
      {showShareAd && <PostShareAdOverlay />}
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-card border rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          {step === 'details' ? (
            <button onClick={() => { if (!mediaFile) setStep('select'); else setStep('details') }}
              className="text-muted-foreground hover:text-foreground">
              {mediaFile ? <ArrowLeft className="h-5 w-5" /> : <ArrowLeft className="h-5 w-5" />}
            </button>
          ) : (
            <div className="w-5" />
          )}
          <h2 className="font-bold text-base">
            {step === 'select' ? 'Create Post' : 'Add Details'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step 1: Select Media */}
        {step === 'select' && (
          <div className="p-6 space-y-4">
            <p className="text-sm text-muted-foreground text-center">What would you like to share?</p>

            <div className="grid grid-cols-1 gap-3">
              <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileSelect} />

              <button onClick={() => { if (fileRef.current) { fileRef.current.accept = 'image/*'; fileRef.current.click() } }}
                className="flex items-center gap-4 p-4 rounded-xl border border-dashed border-pink-500/40 hover:border-pink-500 hover:bg-pink-500/5 transition-all group">
                <div className="w-12 h-12 rounded-xl bg-pink-500/10 flex items-center justify-center group-hover:bg-pink-500/20 transition-colors">
                  <ImageIcon className="h-6 w-6 text-pink-500" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-sm">Photo Post</p>
                  <p className="text-xs text-muted-foreground">Share a photo with caption & hashtags</p>
                </div>
              </button>

              <button onClick={() => { if (fileRef.current) { fileRef.current.accept = 'video/*'; fileRef.current.click() } }}
                className="flex items-center gap-4 p-4 rounded-xl border border-dashed border-purple-500/40 hover:border-purple-500 hover:bg-purple-500/5 transition-all group">
                <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
                  <Film className="h-6 w-6 text-purple-500" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-sm">Reel / Video</p>
                  <p className="text-xs text-muted-foreground">Upload a video reel with title & description</p>
                </div>
              </button>

              <button onClick={handleTextOnly}
                className="flex items-center gap-4 p-4 rounded-xl border border-dashed border-cyan-500/40 hover:border-cyan-500 hover:bg-cyan-500/5 transition-all group">
                <div className="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors">
                  <FileText className="h-6 w-6 text-cyan-500" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-sm">Text Post</p>
                  <p className="text-xs text-muted-foreground">Share thoughts, quotes or updates</p>
                </div>
              </button>
            </div>
            {checkingVideo && (
              <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking video length...
              </p>
            )}
          </div>
        )}

        {/* Step 2: Add Details */}
        {step === 'details' && (
          <div className="max-h-[80vh] overflow-y-auto">
            {/* Preview */}
            {mediaPreview && (
              <div className="relative bg-black" style={{ maxHeight: '280px' }}>
                {mediaType === 'video' ? (
                  <video src={mediaPreview} controls className="w-full" style={{ maxHeight: '280px', objectFit: 'contain' }} />
                ) : (
                  <img src={mediaPreview} alt="Preview" className="w-full object-contain" style={{ maxHeight: '280px' }} />
                )}
                <button onClick={() => { setMediaFile(null); setMediaPreview(null); setMediaType('none') }}
                  className="absolute top-2 right-2 bg-black/60 rounded-full p-1.5 text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="p-4 space-y-4">
              {/* User info */}
              <div className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={getAvatarUrl(profile?.avatar_url || null)} />
                  <AvatarFallback>{profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <p className="font-semibold text-sm">{profile?.username}</p>
              </div>

              {/* Aperonix context - only for text-only posts, since there's no media to "watch" */}
              {mediaType === 'none' && (
                <div className="bg-gradient-to-br from-pink-500/5 to-purple-500/5 border border-pink-500/20 rounded-xl p-3">
                  <label className="text-xs font-semibold text-pink-500 uppercase tracking-wide flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> Tell Aperonix what this post is about
                  </label>
                  <Textarea
                    value={aiContext}
                    onChange={e => setAiContext(e.target.value)}
                    placeholder="e.g. a motivational post about starting fresh on Monday..."
                    className="mt-1.5 resize-none bg-background"
                    rows={2}
                    maxLength={300}
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Used only to help Aperonix generate a title, caption, or hashtags below - it's not part of your post.</p>
                </div>
              )}

              {/* Title */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Title {mediaType === 'video' ? '(Reel Title)' : '(Optional)'}
                  </label>
                  {(mediaFile || mediaType === 'none') && (
                    <button
                      type="button"
                      onClick={() => generateField('title')}
                      disabled={generating.title}
                      className="flex items-center gap-1 text-[11px] font-semibold text-pink-500 hover:text-pink-600 disabled:opacity-50"
                    >
                      {generating.title ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      {generating.title ? 'Aperonix is thinking...' : generated.title ? 'Regenerate' : 'Generate with Aperonix'}
                    </button>
                  )}
                </div>
                <Input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder={mediaType === 'video' ? 'Give your reel a title...' : 'Add a title...'}
                  className="mt-1.5"
                  maxLength={100}
                />
                <p className="text-[10px] text-muted-foreground mt-1 text-right">{title.length}/100</p>
              </div>

              {/* Description */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Description / Caption
                  </label>
                  {(mediaFile || mediaType === 'none') && (
                    <button
                      type="button"
                      onClick={() => generateField('description')}
                      disabled={generating.description}
                      className="flex items-center gap-1 text-[11px] font-semibold text-pink-500 hover:text-pink-600 disabled:opacity-50"
                    >
                      {generating.description ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      {generating.description ? 'Aperonix is thinking...' : generated.description ? 'Regenerate' : 'Generate with Aperonix'}
                    </button>
                  )}
                </div>
                <Textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Write a caption or description..."
                  className="mt-1.5 resize-none"
                  rows={3}
                  maxLength={2200}
                />
                <p className="text-[10px] text-muted-foreground mt-1 text-right">{description.length}/2200</p>
              </div>

              {/* Hashtags */}
              <div className="relative">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Hash className="h-3 w-3" /> Hashtags
                  </label>
                  {(mediaFile || mediaType === 'none') && (
                    <button
                      type="button"
                      onClick={() => generateField('hashtags')}
                      disabled={generating.hashtags}
                      className="flex items-center gap-1 text-[11px] font-semibold text-pink-500 hover:text-pink-600 disabled:opacity-50"
                    >
                      {generating.hashtags ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      {generating.hashtags ? 'Aperonix is thinking...' : generated.hashtags ? 'Regenerate' : 'Generate with Aperonix'}
                    </button>
                  )}
                </div>
                <Input
                  ref={hashtagInputRef}
                  value={hashtags}
                  onChange={handleHashtagsChange}
                  onBlur={() => setTimeout(() => setShowHashtagSuggestions(false), 150)}
                  onFocus={() => { if (hashtagSuggestions.length > 0) setShowHashtagSuggestions(true) }}
                  placeholder="#socialens #trending #viral"
                  className="mt-1.5"
                  autoComplete="off"
                />
                {showHashtagSuggestions && hashtagSuggestions.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-card border rounded-xl shadow-lg overflow-hidden">
                    {hashtagSuggestions.map(tag => (
                      <button
                        key={tag}
                        type="button"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => handleSelectHashtagSuggestion(tag)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
                      >
                        <Hash className="h-3.5 w-3.5 text-pink-500 shrink-0" />
                        <span className="font-medium">{tag}</span>
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground mt-1">Add hashtags separated by spaces</p>
              </div>

              {generateError && (
                <p className="text-xs text-red-500 -mt-2">{generateError}</p>
              )}

              {/* Preview */}
              {(title || description || hashtags) && (
                <div className="bg-muted/50 rounded-xl p-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Preview:</p>
                  <div className="text-sm space-y-1">
                    {title && <p className="font-bold">{title}</p>}
                    {description && <p className="text-muted-foreground">{description}</p>}
                    {hashtags && (
                      <p className="text-pink-500 text-xs">
                        {hashtags.split(/\s+/).map(t => t.startsWith('#') ? t : `#${t}`).join(' ')}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Upload progress */}
              {posting && uploadProgress > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Uploading...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-pink-500 to-purple-500 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}

              {/* Post button */}
              <Button
                onClick={handlePost}
                variant="gradient"
                className="w-full"
                disabled={posting || (!mediaFile && !description.trim() && !title.trim())}
              >
                {posting ? `Posting... ${uploadProgress}%` : mediaType === 'video' ? '🎬 Share Reel' : mediaType === 'image' ? '📸 Share Post' : '✍️ Share'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  )
}
