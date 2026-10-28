'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ImagePlus, Film, FileText, Loader2, Save, Trash2, Upload, X, Play, Image as ImageIcon, Sparkles, Hash } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/hooks/useUser'
import { useQueryClient } from '@tanstack/react-query'
import { isRestricted } from '@/lib/utils/restrictionCheck'
import { RestrictionPopup } from '@/components/shared/RestrictionPopup'
import { compressImageIfNeeded, LONG_CACHE_CONTROL } from '@/lib/utils/imageCompression'

type ContentType = 'post' | 'reel'
type MediaType = 'image' | 'video' | 'none'
type SaveState = 'loading' | 'saved' | 'saving' | 'error'

type Draft = {
  id: string
  user_id: string
  content_type: ContentType
  title: string
  caption: string
  hashtags: string
  media_type: MediaType
  media_path: string | null
  media_name: string | null
  media_size: number | null
  cover_time: number | null
  cover_path: string | null
  status: 'draft' | 'publishing'
  created_at: string
  updated_at: string
}

const MAX_VIDEO_SECONDS = 20 * 60
const MAX_MEDIA_BYTES = 100 * 1024 * 1024

function formatBytes(bytes: number | null | undefined) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function buildPostContent(title: string, caption: string, hashtags: string) {
  const parts: string[] = []
  if (title.trim()) parts.push(`**${title.trim()}**`)
  if (caption.trim()) parts.push(caption.trim())
  if (hashtags.trim()) parts.push(hashtags.trim().split(/\s+/).map(tag => tag.startsWith('#') ? tag : `#${tag}`).join(' '))
  return parts.join('\n\n')
}

const MAX_AI_MEDIA_BYTES = 3.5 * 1024 * 1024

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '')
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function sampleVideoFrames(file: File, maxFrames = 6): Promise<string[]> {
  const video = document.createElement('video')
  const objectUrl = URL.createObjectURL(file)
  video.preload = 'metadata'; video.muted = true; video.playsInline = true; video.src = objectUrl
  try {
    await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error('This video could not be read in your browser.')) })
    const duration = Number.isFinite(video.duration) ? video.duration : 0
    if (!duration) throw new Error('This video has no readable duration.')
    const count = Math.min(maxFrames, Math.max(1, Math.ceil(duration / 8)))
    const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Video frame extraction is not supported by this browser.')
    const frames: string[] = []
    for (let i = 0; i < count; i++) {
      const time = count === 1 ? duration / 2 : duration * (0.06 + 0.88 * (i / (count - 1)))
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => { video.removeEventListener('seeked', onSeeked); video.removeEventListener('error', onError) }
        const onSeeked = () => { cleanup(); resolve() }; const onError = () => { cleanup(); reject(new Error('Could not read a frame from this video.')) }
        video.addEventListener('seeked', onSeeked, { once: true }); video.addEventListener('error', onError, { once: true })
        video.currentTime = Math.min(time, Math.max(0, duration - 0.05))
      })
      const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight))
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height); frames.push(canvas.toDataURL('image/jpeg', 0.58).split(',')[1])
    }
    return frames
  } finally { video.pause(); video.removeAttribute('src'); video.load(); URL.revokeObjectURL(objectUrl) }
}
export default function CreateEditorPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, profile } = useUser()
  const supabase = useMemo(() => createClient(), [])
  const db = supabase as any
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const coverFileRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const draftIdRef = useRef<string | null>(null)
  const dataRef = useRef({ contentType: 'post' as ContentType, title: '', caption: '', hashtags: '', mediaType: 'none' as MediaType, mediaPath: null as string | null, mediaName: null as string | null, mediaSize: null as number | null, coverTime: 0, coverPath: null as string | null })
  const revisionRef = useRef(0)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const uploadingRef = useRef(false)
  const postingRef = useRef(false)

  const [contentType, setContentType] = useState<ContentType>('post')
  const [title, setTitle] = useState('')
  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [mediaType, setMediaType] = useState<MediaType>('none')
  const [mediaPath, setMediaPath] = useState<string | null>(null)
  const [mediaName, setMediaName] = useState<string | null>(null)
  const [mediaSize, setMediaSize] = useState<number | null>(null)
  const [videoDuration, setVideoDuration] = useState(0)
  const [coverTime, setCoverTime] = useState(0)
  const [coverPath, setCoverPath] = useState<string | null>(null)
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null)
  const [pendingDeleteDraft, setPendingDeleteDraft] = useState<Draft | null>(null)
  const [deletingDraft, setDeletingDraft] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [showDrafts, setShowDrafts] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('loading')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState('')
  const [showRestriction, setShowRestriction] = useState(false)
  const [generating, setGenerating] = useState<Record<'title' | 'caption' | 'hashtags', boolean>>({ title: false, caption: false, hashtags: false })
  const [generated, setGenerated] = useState<Record<'title' | 'caption' | 'hashtags', boolean>>({ title: false, caption: false, hashtags: false })
  const [loadingDraft, setLoadingDraft] = useState(true)

  useEffect(() => {
    dataRef.current = { contentType, title, caption, hashtags, mediaType, mediaPath, mediaName, mediaSize, coverTime, coverPath }
    revisionRef.current += 1
  }, [contentType, title, caption, hashtags, mediaType, mediaPath, mediaName, mediaSize, coverTime, coverPath])

  const applyDraft = useCallback(async (draft: Draft) => {
    await saveQueueRef.current
    draftIdRef.current = draft.id
    setDraftId(draft.id)
    setContentType(draft.content_type)
    setTitle(draft.title || '')
    setCaption(draft.caption || '')
    setHashtags(draft.hashtags || '')
    setMediaType(draft.media_type || 'none')
    setMediaPath(draft.media_path || null)
    setMediaName(draft.media_name || null)
    setMediaSize(draft.media_size ?? null)
    setCoverTime(draft.cover_time ?? 0)
    setCoverPath(draft.cover_path || null)
    setCoverPreviewUrl(null)
    setVideoDuration(0)
    setPreviewUrl(null)
    setError('')
    if (draft.media_path) {
      const { data, error: signedError } = await supabase.storage.from('create-drafts').createSignedUrl(draft.media_path, 3600)
      if (signedError) setError('Draft text was restored, but its media preview could not be loaded. Please reselect the file if needed.')
      else setPreviewUrl(data.signedUrl)
    }
    if (draft.cover_path) {
      const { data } = await supabase.storage.from('create-drafts').createSignedUrl(draft.cover_path, 3600)
      if (data?.signedUrl) setCoverPreviewUrl(data.signedUrl)
    }
    setSaveState('saved')
  }, [supabase])

  const refreshDraftList = useCallback(async () => {
    if (!user) return
    const { data, error: listError } = await db.from('create_drafts').select('*').eq('user_id', user.id).order('updated_at', { ascending: false })
    if (listError) {
      setError('Could not load your drafts. Please try again.')
      return
    }
    setDrafts((data || []) as Draft[])
  }, [db, user])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    const init = async () => {
      setLoadingDraft(true)
      const { data, error: listError } = await db.from('create_drafts').select('*').eq('user_id', user.id).order('updated_at', { ascending: false })
      if (cancelled) return
      if (listError) {
        setError('Drafts could not be loaded. Your existing posts are not affected.')
        setSaveState('error')
        setLoadingDraft(false)
        return
      }
      const loaded = (data || []) as Draft[]
      setDrafts(loaded)
      const requestedId = searchParams.get('draft')
      const selected = requestedId ? loaded.find(d => d.id === requestedId) : loaded[0]
      if (selected) await applyDraft(selected)
      else setSaveState('saved')
      if (!cancelled) setLoadingDraft(false)
    }
    void init()
    return () => { cancelled = true }
  }, [user?.id, db, applyDraft, searchParams])

  const persistDraft = useCallback(() => {
    const snapshot = { ...dataRef.current }
    if (!user || uploadingRef.current || postingRef.current) return
    if (!snapshot.title.trim() && !snapshot.caption.trim() && !snapshot.hashtags.trim() && !snapshot.mediaPath && !draftIdRef.current) return
    const revision = revisionRef.current
    const targetDraftId = draftIdRef.current
    setSaveState('saving')
    saveQueueRef.current = saveQueueRef.current.then(async () => {
      if (revisionRef.current !== revision) return
      const row = {
        user_id: user.id,
        content_type: snapshot.contentType,
        title: snapshot.title,
        caption: snapshot.caption,
        hashtags: snapshot.hashtags,
        media_type: snapshot.mediaType,
        media_path: snapshot.mediaPath,
        media_name: snapshot.mediaName,
        media_size: snapshot.mediaSize,
        cover_time: snapshot.coverTime,
        cover_path: snapshot.coverPath,
        status: 'draft',
        updated_at: new Date().toISOString(),
      }
      let result: any
      if (targetDraftId) {
        result = await db.from('create_drafts').update(row).eq('id', targetDraftId).eq('user_id', user.id).select('*').single()
      } else {
        result = await db.from('create_drafts').insert(row).select('*').single()
      }
      if (result.error) {
        if (revisionRef.current === revision) setSaveState('error')
        setError('Draft could not be saved. Check your connection; your current editor content is still here.')
        return
      }
      if (revisionRef.current === revision) {
        draftIdRef.current = result.data.id
        setDraftId(result.data.id)
        setSaveState('saved')
      }
      setDrafts(previous => [result.data as Draft, ...previous.filter(d => d.id !== result.data.id)])
    }).catch(err => {
      console.error('Draft autosave failed', err)
      setSaveState('error')
      setError('Draft could not be saved. Please retry.')
    })
  }, [db, user])

  useEffect(() => {
    if (loadingDraft || !user || uploading || publishing) return
    const timer = window.setTimeout(() => persistDraft(), 900)
    return () => window.clearTimeout(timer)
  }, [contentType, title, caption, hashtags, mediaType, mediaPath, mediaName, mediaSize, coverTime, coverPath, loadingDraft, user, uploading, publishing, persistDraft])

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !user) return
    setError('')
    if (!(file.type.startsWith('image/') || file.type.startsWith('video/'))) {
      setError('Choose an image or video file.')
      return
    }
    if (file.size > MAX_MEDIA_BYTES) {
      setError('This file is larger than 100 MB. Choose a smaller file.')
      return
    }
    const isVideo = file.type.startsWith('video/')
    if (contentType === 'reel' && !isVideo) {
      setError('Reels require a video. Please choose a video file.')
      return
    }
    if (isVideo) {
      const objectUrl = URL.createObjectURL(file)
      const duration = await new Promise<number>(resolve => {
        const video = document.createElement('video')
        video.preload = 'metadata'
        video.onloadedmetadata = () => { const d = video.duration; URL.revokeObjectURL(objectUrl); resolve(d) }
        video.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(0) }
        video.src = objectUrl
      })
      if (!duration) {
        setError('This video could not be read by your browser.')
        return
      }
      if (duration > MAX_VIDEO_SECONDS) {
        setError('Videos for Posts/Reels must be 20 minutes or shorter.')
        return
      }
    }

    const previousMediaPath = mediaPath
    const previousPreviewUrl = previewUrl
    uploadingRef.current = true
    setUploading(true)
    setUploadProgress(10)
    const localPreviewUrl = URL.createObjectURL(file)
    setPreviewUrl(current => {
      if (current?.startsWith('blob:')) URL.revokeObjectURL(current)
      return localPreviewUrl
    })
    try {
      const currentDraftId = draftIdRef.current || crypto.randomUUID()
      const extension = file.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '') || (isVideo ? 'mp4' : 'jpg')
      const path = `${user.id}/${currentDraftId}/${crypto.randomUUID()}.${extension}`
      setUploadProgress(25)
      const { error: uploadError } = await supabase.storage.from('create-drafts').upload(path, file, {
        upsert: false,
        contentType: file.type,
        cacheControl: '3600',
      })
      if (uploadError) throw uploadError
      setUploadProgress(90)
      setMediaPath(path)
      setMediaName(file.name)
      setMediaSize(file.size)
      setMediaType(isVideo ? 'video' : 'image')
      setVideoDuration(isVideo ? duration : 0)
      setCoverTime(isVideo ? Math.min(0.2, Math.max(0, duration - 0.05)) : 0)
      setCoverPath(null)
      setCoverPreviewUrl(null)
      setUploadProgress(100)
      if (previousMediaPath && previousMediaPath !== path) {
        const { error: oldMediaDeleteError } = await supabase.storage.from('create-drafts').remove([previousMediaPath])
        if (oldMediaDeleteError) console.warn('Replaced draft media cleanup failed', oldMediaDeleteError)
      }
      const { data: signed, error: signedError } = await supabase.storage.from('create-drafts').createSignedUrl(path, 3600)
      if (signed?.signedUrl) {
        URL.revokeObjectURL(localPreviewUrl)
        setPreviewUrl(signed.signedUrl)
      } else if (signedError) {
        setError('Media uploaded and saved, but its preview could not be refreshed. Reopen the draft to reload it.')
        setPreviewUrl(localPreviewUrl)
      }
    } catch (err) {
      console.error('Draft media upload failed', err)
      setError('Media upload failed. Please try again. Your previous saved media is unchanged.')
      URL.revokeObjectURL(localPreviewUrl)
      setPreviewUrl(previousPreviewUrl)
    } finally {
      uploadingRef.current = false
      setUploading(false)
      setUploadProgress(0)
    }
  }

  const removeMedia = async () => {
    if (mediaPath) {
      const { error: removeError } = await supabase.storage.from('create-drafts').remove([mediaPath])
      if (removeError) console.warn('Could not remove old draft media', removeError)
    }
    if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setMediaPath(null)
    setMediaName(null)
    setMediaSize(null)
    setMediaType('none')
    setVideoDuration(0)
    setCoverTime(0)
    setCoverPath(null)
    setCoverPreviewUrl(null)
  }

  const startNewDraft = async () => {
    await saveQueueRef.current
    draftIdRef.current = null
    setDraftId(null)
    setContentType('post')
    setTitle('')
    setCaption('')
    setHashtags('')
    setMediaType('none')
    setMediaPath(null)
    setMediaName(null)
    setMediaSize(null)
    setVideoDuration(0)
    setCoverTime(0)
    setCoverPath(null)
    setCoverPreviewUrl(null)
    setPreviewUrl(null)
    setError('')
    setSaveState('saved')
    router.replace('/create')
  }

  const deleteDraft = async (draft: Draft) => {
    if (deletingDraft) return
    setDeletingDraft(true)
    const { error: deleteError } = await db.from('create_drafts').delete().eq('id', draft.id).eq('user_id', user?.id)
    if (deleteError) {
      setError('Could not delete this draft. Please try again.')
      setDeletingDraft(false)
      setPendingDeleteDraft(null)
      return
    }
    const pathsToRemove = [draft.media_path, draft.cover_path].filter((path): path is string => Boolean(path))
    if (pathsToRemove.length) {
      const { error: mediaDeleteError } = await supabase.storage.from('create-drafts').remove(pathsToRemove)
      if (mediaDeleteError) console.warn('Draft media cleanup failed', mediaDeleteError)
    }
    setDrafts(previous => previous.filter(item => item.id !== draft.id))
    if (draftIdRef.current === draft.id) await startNewDraft()
    setPendingDeleteDraft(null)
    setDeletingDraft(false)
  }

  const publish = async () => {
    if (!user || postingRef.current || uploading) return
    if (isRestricted(profile?.restrict_post_until)) {
      setShowRestriction(true)
      return
    }
    if (contentType === 'reel' && (mediaType !== 'video' || !mediaPath)) {
      setError('Choose a video before publishing a Reel.')
      return
    }
    if (mediaType !== 'none' && !mediaPath) {
      setError('Wait for the media upload to finish before publishing.')
      return
    }
    const postContent = buildPostContent(title, caption, hashtags)
    if (!postContent && !mediaPath) {
      setError('Add a photo, video, title, or caption before sharing.')
      return
    }

    postingRef.current = true
    setPublishing(true)
    setSaveState('saving')
    setError('')
    let uploadedFinalPath: string | null = null
    let postCreated = false
    try {
      await saveQueueRef.current
      let publicMediaUrl: string | null = null
      let publicCoverUrl: string | null = null
      if (mediaPath && mediaType !== 'none') {
        setUploadProgress(15)
        const { data: blob, error: downloadError } = await supabase.storage.from('create-drafts').download(mediaPath)
        if (downloadError || !blob) throw downloadError || new Error('Could not recover your uploaded media.')
        setUploadProgress(40)
        const originalName = mediaName || (mediaType === 'video' ? 'video.mp4' : 'image.jpg')
        const originalFile = new File([blob], originalName, { type: blob.type || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg') })
        const fileToPublish = mediaType === 'image' ? await compressImageIfNeeded(originalFile) : originalFile
        const extension = fileToPublish.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '') || (mediaType === 'video' ? 'mp4' : 'jpg')
        const finalPath = `${user.id}/${crypto.randomUUID()}.${extension}`
        const { error: finalUploadError } = await supabase.storage.from('posts').upload(finalPath, fileToPublish, {
          upsert: false,
          contentType: fileToPublish.type || blob.type || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg'),
          cacheControl: LONG_CACHE_CONTROL,
        })
        if (finalUploadError) throw finalUploadError
        uploadedFinalPath = finalPath
        publicMediaUrl = supabase.storage.from('posts').getPublicUrl(finalPath).data.publicUrl
      }
      if (mediaType === 'video' && mediaPath && previewUrl && !coverPath && videoRef.current) {
        const video = videoRef.current
        const previousTime = video.currentTime
        await new Promise<void>(resolve => {
          const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve() }
          video.addEventListener('seeked', onSeeked, { once: true })
          video.currentTime = Math.min(Math.max(0, coverTime), Math.max(0, video.duration - 0.05))
        })
        const canvas = document.createElement('canvas')
        const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight))
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Could not create a cover image from this video.')
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        const coverBlob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not export the selected cover frame.')), 'image/jpeg', 0.88))
        const coverUploadPath = `${user.id}/${crypto.randomUUID()}-cover.jpg`
        const { error: coverUploadError } = await supabase.storage.from('posts').upload(coverUploadPath, coverBlob, { upsert: false, contentType: 'image/jpeg', cacheControl: LONG_CACHE_CONTROL })
        if (coverUploadError) throw coverUploadError
        uploadedFinalPath = uploadedFinalPath || coverUploadPath
        publicCoverUrl = supabase.storage.from('posts').getPublicUrl(coverUploadPath).data.publicUrl
        video.currentTime = previousTime
      } else if (coverPath) {
        const { data: coverBlob, error: coverDownloadError } = await supabase.storage.from('create-drafts').download(coverPath)
        if (coverDownloadError || !coverBlob) throw coverDownloadError || new Error('Could not load your uploaded cover image.')
        const coverUploadPath = `${user.id}/${crypto.randomUUID()}-cover.jpg`
        const { error: coverUploadError } = await supabase.storage.from('posts').upload(coverUploadPath, coverBlob, { upsert: false, contentType: coverBlob.type || 'image/jpeg', cacheControl: LONG_CACHE_CONTROL })
        if (coverUploadError) throw coverUploadError
        publicCoverUrl = supabase.storage.from('posts').getPublicUrl(coverUploadPath).data.publicUrl
      }

      setUploadProgress(75)
      const { data: createdPost, error: postError } = await supabase.from('posts').insert({
        user_id: user.id,
        content: postContent || null,
        media_url: publicMediaUrl,
        media_type: mediaType,
        cover_url: publicCoverUrl,
      }).select('id').single()
      if (postError || !createdPost) throw postError || new Error('Publishing was not confirmed by the server.')
      postCreated = true

      await supabase.rpc('increment_posts_count', { profile_id: user.id })
      setUploadProgress(100)
      await queryClient.invalidateQueries({ queryKey: ['feed-posts'] })
      await queryClient.invalidateQueries({ queryKey: ['reels-posts'] })
      await queryClient.invalidateQueries({ queryKey: ['explore-posts'] })
      await queryClient.invalidateQueries({ queryKey: ['profile-posts'] })

      if (draftIdRef.current) {
        await db.from('create_drafts').delete().eq('id', draftIdRef.current).eq('user_id', user.id)
      }
      const draftFiles = [mediaPath, coverPath].filter((path): path is string => Boolean(path))
      if (draftFiles.length) await supabase.storage.from('create-drafts').remove(draftFiles)
      router.push('/feed')
    } catch (err) {
      console.error('Post/Reel publishing failed', err)
      if (uploadedFinalPath && !postCreated) {
        const { error: cleanupError } = await supabase.storage.from('posts').remove([uploadedFinalPath])
        if (cleanupError) console.warn('Could not clean up unreferenced post media', cleanupError)
      }
      setError('Publishing could not be confirmed. Your draft has been kept so you can retry safely.')
      setSaveState('error')
    } finally {
      postingRef.current = false
      setPublishing(false)
      setUploadProgress(0)
    }
  }

  const generateField = async (field: 'title' | 'caption' | 'hashtags') => {
    if (!mediaPath || !previewUrl || mediaType === 'none') { setError('Upload a photo or video first so Aperonix can understand your content.'); return }
    setError(''); setGenerating(previous => ({ ...previous, [field]: true }))
    try {
      const response = await fetch(previewUrl)
      if (!response.ok) throw new Error('Could not load your media for Aperonix. Please try again.')
      const blob = await response.blob()
      const mediaFile = new File([blob], mediaType === 'video' ? 'video.mp4' : 'photo.jpg', { type: blob.type || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg') })
      if (mediaType === 'image' && mediaFile.size > MAX_AI_MEDIA_BYTES) throw new Error('This photo is too large for Aperonix to analyze. Please choose a smaller photo.')
      const sampledImages = mediaType === 'video' ? await sampleVideoFrames(mediaFile, 6) : undefined
      const mediaBase64 = mediaType === 'image' ? await fileToBase64(mediaFile) : undefined
      const currentValue = field === 'title' ? title : field === 'caption' ? caption : hashtags
      const apiField = field === 'caption' ? 'description' : field
      const res = await fetch('/api/aperonix/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mediaBase64, mimeType: mediaBase64 ? mediaFile.type : undefined, sampledImages, mediaKind: mediaType, field: apiField, regenerate: generated[field], previousResult: generated[field] ? currentValue : undefined }) })
      const responseText = await res.text()
      let data: { result?: string; error?: string } = {}
      try { data = JSON.parse(responseText) as { result?: string; error?: string } }
      catch { throw new Error(res.status === 504 ? 'Aperonix took too long to respond. Please try again; your post has not been lost.' : 'Aperonix returned an invalid response. Please try again.') }
      if (!res.ok) throw new Error(data.error || 'Aperonix could not generate this right now.')
      if (typeof data.result !== 'string' || !data.result.trim()) throw new Error('Aperonix did not return any text. Please try again.')
      if (field === 'title') setTitle(String(data.result).slice(0, 100))
      else if (field === 'caption') setCaption(String(data.result).slice(0, 2200))
      else setHashtags(String(data.result).split(/\s+/).map((tag: string) => tag.startsWith('#') ? tag : '#' + tag).join(' '))
      setGenerated(previous => ({ ...previous, [field]: true }))
    } catch (err) { console.error('Aperonix field generation failed', err); setError(err instanceof Error ? err.message : 'Aperonix could not generate this right now.') }
    finally { setGenerating(previous => ({ ...previous, [field]: false })) }
  }
  const saveLabel = saveState === 'loading' ? 'Loading drafts…' : saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Save failed' : 'Saved'
  const isVideo = mediaType === 'video'

  return (
    <div className="mx-auto min-h-[calc(100vh-3.5rem)] w-full max-w-7xl px-3 pb-8 pt-4 sm:px-6 lg:px-8">
      {showRestriction && <RestrictionPopup feature="posting" until={profile?.restrict_post_until} onClose={() => setShowRestriction(false)} />}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/feed" aria-label="Back to Home" className="flex h-10 w-10 items-center justify-center rounded-full border border-border hover:bg-accent"><ArrowLeft className="h-5 w-5" /></Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Create</h1>
            <p className="text-sm text-muted-foreground">Make something worth sharing.</p>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          <span className={`hidden items-center gap-1.5 text-xs sm:flex ${saveState === 'error' ? 'text-red-500' : 'text-muted-foreground'}`}><Save className="h-3.5 w-3.5" />{saveLabel}</span>
          <button type="button" onClick={() => setShowDrafts(true)} className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent">Drafts</button>
          <button type="button" onClick={startNewDraft} className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent">New draft</button>
          <button type="button" onClick={publish} disabled={publishing || uploading || loadingDraft} className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 px-3 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60 sm:px-4">{publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{publishing ? 'Sharing…' : contentType === 'reel' ? 'Share Reel' : 'Share Post'}</button>
        </div>
      </div>

      {loadingDraft ? <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Restoring your draft…</div> : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-4 py-3"><div><h2 className="font-semibold">Media</h2><p className="text-xs text-muted-foreground">{contentType === 'reel' ? 'Choose a video for your Reel' : <><span className="sm:hidden">Add a photo or video</span><span className="hidden sm:inline">Add a photo or video to your post</span></>}</p></div><input ref={fileRef} type="file" accept={contentType === 'reel' ? 'video/*' : 'image/*,video/*'} className="hidden" onChange={handleFile} /><input ref={coverFileRef} type="file" accept="image/*" className="hidden" onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file || !user || !file.type.startsWith('image/')) return; if (file.size > 15 * 1024 * 1024) { setError('Cover images must be 15 MB or smaller.'); return } try { setError(''); const path = `${user.id}/${draftIdRef.current || crypto.randomUUID()}/cover-${crypto.randomUUID()}.${file.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '') || 'jpg'}`; const { error: uploadError } = await supabase.storage.from('create-drafts').upload(path, file, { upsert: false, contentType: file.type, cacheControl: '3600' }); if (uploadError) throw uploadError; const oldPath = coverPath; setCoverPath(path); setCoverPreviewUrl(URL.createObjectURL(file)); if (oldPath) await supabase.storage.from('create-drafts').remove([oldPath]); } catch (err) { console.error('Cover upload failed', err); setError('Could not upload that cover image. Please try again.'); } }} /><button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-2.5 py-2 text-xs font-medium hover:bg-accent disabled:opacity-50 sm:gap-2 sm:px-3 sm:text-sm"><ImagePlus className="h-4 w-4" />{mediaPath ? (isVideo ? 'Replace video' : 'Replace photo') : 'Choose media'}</button></div>
            <div className="flex min-h-[300px] items-center justify-center bg-muted/35 p-4 sm:min-h-[430px]">
              {previewUrl ? (isVideo ? <video ref={videoRef} key={previewUrl} src={previewUrl} crossOrigin="anonymous" controls playsInline onLoadedMetadata={e => { const duration = Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0; setVideoDuration(duration); if (duration > 0 && coverTime > 0) e.currentTarget.currentTime = Math.min(coverTime, Math.max(0, duration - 0.05)) }} onSeeked={e => { if (!coverPath && e.currentTarget.videoWidth) { try { const v = e.currentTarget; const canvas = document.createElement('canvas'); const scale = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight)); canvas.width = Math.max(1, Math.round(v.videoWidth * scale)); canvas.height = Math.max(1, Math.round(v.videoHeight * scale)); canvas.getContext('2d')?.drawImage(v, 0, 0, canvas.width, canvas.height); setCoverPreviewUrl(canvas.toDataURL('image/jpeg', 0.75)) } catch { /* Browser may temporarily be unable to sample a frame. */ } } }} className="max-h-[65vh] max-w-full rounded-xl object-contain" /> : <img src={previewUrl} alt="Selected media preview" className="max-h-[65vh] max-w-full rounded-xl object-contain" />) : <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full max-w-sm flex-col items-center rounded-2xl border-2 border-dashed border-border px-6 py-12 text-center hover:border-pink-500/60 hover:bg-accent/40"><div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">{contentType === 'reel' ? <Film className="h-7 w-7" /> : <ImagePlus className="h-7 w-7" />}</div><span className="font-semibold">Add media</span><span className="mt-1 text-sm text-muted-foreground">{contentType === 'reel' ? 'MP4, WebM or QuickTime video' : 'Photo or video, up to 100 MB'}</span></button>}
            </div>
            {mediaType === 'video' && previewUrl && <div className="space-y-3 border-t border-border px-4 py-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">Choose video cover</p><p className="text-xs text-muted-foreground">Move along the timeline to choose a frame for Home and Explore.</p></div><button type="button" onClick={() => coverFileRef.current?.click()} disabled={uploading || publishing} className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-accent disabled:opacity-50"><Upload className="mr-1 inline h-3.5 w-3.5" />Upload cover</button></div><div className="grid grid-cols-[minmax(0,1fr)_96px] gap-3"><div className="min-w-0"><div className="relative h-12 overflow-hidden rounded-lg border border-border bg-muted"><div className="absolute inset-0 flex opacity-50">{Array.from({length: 12}, (_, i) => <div key={i} className="flex-1 border-r border-background/50 bg-gradient-to-b from-muted-foreground/25 to-muted-foreground/5" />)}</div><input aria-label="Select video cover frame" type="range" min={0} max={Math.max(0, videoDuration - 0.05)} step={0.1} value={Math.min(coverTime, Math.max(0, videoDuration - 0.05))} onChange={e => { const next = Number(e.target.value); setCoverTime(next); setCoverPath(null); const v = videoRef.current; if (v) v.currentTime = next }} className="absolute inset-0 h-full w-full cursor-pointer accent-pink-500" /></div><div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>0:00</span><span>{Math.floor(coverTime / 60)}:{String(Math.floor(coverTime % 60)).padStart(2, '0')} selected</span><span>{Math.floor(videoDuration / 60)}:{String(Math.floor(videoDuration % 60)).padStart(2, '0')}</span></div></div><div className="flex h-[72px] items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">{coverPreviewUrl ? <img src={coverPreviewUrl} alt="Selected video cover preview" className="h-full w-full object-cover" /> : <span className="px-2 text-center text-[10px] text-muted-foreground">Select a frame</span>}</div></div>{coverPath && <button type="button" onClick={async () => { if (coverPath) await supabase.storage.from('create-drafts').remove([coverPath]); setCoverPath(null); setCoverPreviewUrl(null) }} className="text-xs font-medium text-pink-500 hover:underline">Use a frame from video instead</button>}<p className="text-[11px] text-muted-foreground">The selected cover is saved with your draft and published with the video.</p></div>}
            {mediaPath && <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{isVideo ? 'Video uploaded' : 'Photo uploaded'}</p><p className="text-xs text-muted-foreground">{formatBytes(mediaSize)} · Saved privately with this draft</p></div><button type="button" onClick={removeMedia} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"><X className="h-4 w-4" />Remove</button></div>}
            {uploading && <div className="border-t border-border px-4 py-3"><div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>Uploading media securely…</span><span>{uploadProgress}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all" style={{ width: `${uploadProgress}%` }} /></div></div>}
          </section>

          <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <div><h2 className="font-semibold">Details</h2><p className="text-xs text-muted-foreground">Your changes save automatically.</p></div>
            <div><div className="mb-1.5 flex items-center justify-between gap-2"><label htmlFor="create-title" className="block text-sm font-medium">Title</label><button type="button" onClick={() => void generateField('title')} disabled={!mediaPath || generating.title || uploading || publishing} className="inline-flex items-center gap-1 text-xs font-semibold text-pink-500 hover:text-pink-400 disabled:opacity-50">{generating.title ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}{generating.title ? 'Generating…' : generated.title ? 'Regenerate with Aperonix' : 'Generate with Aperonix'}</button></div><input id="create-title" value={title} onChange={e => setTitle(e.target.value)} maxLength={100} placeholder="Add a title…" className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" /><p className="mt-1 text-right text-xs text-muted-foreground">{title.length}/100</p></div>
            <div><div className="mb-1.5 flex items-center justify-between gap-2"><label htmlFor="create-caption" className="block text-sm font-medium">Caption</label><button type="button" onClick={() => void generateField('caption')} disabled={!mediaPath || generating.caption || uploading || publishing} className="inline-flex items-center gap-1 text-xs font-semibold text-pink-500 hover:text-pink-400 disabled:opacity-50">{generating.caption ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}{generating.caption ? 'Generating…' : generated.caption ? 'Regenerate with Aperonix' : 'Generate with Aperonix'}</button></div><textarea id="create-caption" value={caption} onChange={e => setCaption(e.target.value)} maxLength={2200} rows={7} placeholder="Write a caption, tell your story…" className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" /><p className="mt-1 text-right text-xs text-muted-foreground">{caption.length}/2200</p></div>
            <div><div className="mb-1.5 flex items-center justify-between gap-2"><label htmlFor="create-hashtags" className="block text-sm font-medium"><span className="inline-flex items-center gap-1"><Hash className="h-3.5 w-3.5" />Hashtags</span></label><button type="button" onClick={() => void generateField('hashtags')} disabled={!mediaPath || generating.hashtags || uploading || publishing} className="inline-flex items-center gap-1 text-xs font-semibold text-pink-500 hover:text-pink-400 disabled:opacity-50">{generating.hashtags ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}{generating.hashtags ? 'Generating…' : generated.hashtags ? 'Regenerate with Aperonix' : 'Generate with Aperonix'}</button></div><input id="create-hashtags" value={hashtags} onChange={e => setHashtags(e.target.value)} placeholder="#socialens #photography" className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" /><p className="mt-1 text-xs text-muted-foreground">Separate hashtags with spaces. The editor adds # when missing.</p></div>
            <div className="rounded-xl border border-border bg-muted/30 p-3"><div className="mb-2 flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4" /> Preview</div><p className="whitespace-pre-wrap break-words text-sm font-semibold">{title}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{caption}</p><p className="mt-2 break-words text-sm text-pink-500">{hashtags.split(/\s+/).filter(Boolean).map(tag => tag.startsWith('#') ? tag : `#${tag}`).join(' ')}</p></div>
            {error && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2.5 text-sm text-red-500">{error}</div>}
            {uploading || publishing ? <div className="space-y-1"><div className="flex justify-between text-xs text-muted-foreground"><span>{uploading ? 'Saving media…' : 'Publishing…'}</span><span>{uploadProgress}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all" style={{ width: `${uploadProgress}%` }} /></div></div> : null}
            <button type="button" onClick={publish} disabled={publishing || uploading || loadingDraft} className="w-full rounded-xl bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60">{publishing ? 'Publishing…' : contentType === 'reel' ? 'Share Reel' : 'Share Post'}</button>
            <p className="text-center text-xs text-muted-foreground">Publishing uses your SociaLens account and existing feed system.</p>
          </section>
        </div>
      )}

      {pendingDeleteDraft && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4" role="presentation" onClick={() => !deletingDraft && setPendingDeleteDraft(null)}><div role="alertdialog" aria-modal="true" aria-labelledby="delete-draft-title" aria-describedby="delete-draft-description" className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl" onClick={e => e.stopPropagation()}><div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-red-500/10 text-red-500"><Trash2 className="h-5 w-5" /></div><h2 id="delete-draft-title" className="text-lg font-bold">Delete this draft?</h2><p id="delete-draft-description" className="mt-2 text-sm leading-relaxed text-muted-foreground">This will permanently delete this unfinished draft and its saved media. Published posts and their media will not be affected.</p><div className="mt-5 flex justify-end gap-2"><button type="button" disabled={deletingDraft} onClick={() => setPendingDeleteDraft(null)} className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:bg-accent disabled:opacity-50">Cancel</button><button type="button" disabled={deletingDraft} onClick={() => void deleteDraft(pendingDeleteDraft)} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">{deletingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}{deletingDraft ? 'Deleting…' : 'Delete draft'}</button></div></div></div>}
      {showDrafts && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3" onClick={() => setShowDrafts(false)}><div className="max-h-[85vh] w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" onClick={e => e.stopPropagation()}><div className="flex items-center justify-between border-b border-border px-4 py-3"><div><h2 className="font-bold">Your drafts</h2><p className="text-xs text-muted-foreground">Only you can access your unfinished work.</p></div><button type="button" onClick={() => setShowDrafts(false)} aria-label="Close drafts" className="rounded-full p-2 hover:bg-accent"><X className="h-4 w-4" /></button></div><div className="max-h-[65vh] space-y-2 overflow-y-auto p-3">{drafts.length ? drafts.map(draft => <div key={draft.id} className="flex items-center gap-3 rounded-xl border border-border p-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted">{draft.content_type === 'reel' ? <Film className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}</div><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{draft.content_type === 'reel' ? 'Reel draft' : 'Post draft'}</p><p className="truncate text-xs text-muted-foreground">{draft.title || draft.caption || draft.media_name || 'Untitled draft'}</p><p className="text-[11px] text-muted-foreground">Updated {new Date(draft.updated_at).toLocaleString()}</p></div><button type="button" onClick={async () => { await applyDraft(draft); setShowDrafts(false); router.replace(`/create?draft=${draft.id}`) }} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-accent">Continue</button><button type="button" onClick={() => setPendingDeleteDraft(draft)} aria-label="Delete draft" className="rounded-lg p-2 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"><Trash2 className="h-4 w-4" /></button></div>) : <p className="px-4 py-10 text-center text-sm text-muted-foreground">No saved drafts yet. Start writing and they’ll appear here.</p>}</div></div></div>}
    </div>
  )
}
