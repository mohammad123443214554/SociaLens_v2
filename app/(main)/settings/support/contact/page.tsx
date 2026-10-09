'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Headset, ImagePlus, Loader2, X, CheckCircle2 } from 'lucide-react'
import { useUser } from '@/lib/hooks/useUser'
import { PageLoader } from '@/components/shared/LoadingSpinner'
import { useSubmitContactSupport } from '@/lib/hooks/useContactSupport'
import { createClient } from '@/lib/supabase/client'

const MAX_MESSAGE_LENGTH = 1000
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024 // 50MB

export default function ContactSupportPage() {
  const router = useRouter()
  const { user, profile, loading } = useUser()
  const submitContact = useSubmitContactSupport()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // Prefill the name field with the account's own name/username once it
  // loads, so most people won't have to type it at all - still editable.
  const prefillDone = useRef(false)
  if (!prefillDone.current && profile && !name) {
    setName(profile.full_name || profile.username || '')
    prefillDone.current = true
  }

  const handleFileSelect = (selected: File | undefined) => {
    if (!selected) return
    if (selected.size > MAX_FILE_SIZE_BYTES) {
      setError('That file is too large (50MB max). Please pick a smaller photo or video.')
      return
    }
    setError(null)
    if (preview) URL.revokeObjectURL(preview)
    const isVideo = selected.type.startsWith('video/')
    setFile(selected)
    setMediaType(isVideo ? 'video' : 'image')
    setPreview(URL.createObjectURL(selected))
  }

  const handleRemoveFile = () => {
    if (preview) URL.revokeObjectURL(preview)
    setFile(null)
    setPreview(null)
    setMediaType(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async () => {
    if (!user) return
    if (!name.trim() || !message.trim()) {
      setError('Please fill in your name and describe the issue.')
      return
    }
    setError(null)
    setUploading(true)
    try {
      let mediaUrl: string | null = null
      if (file) {
        // Uploaded straight from the browser to Supabase Storage (same as
        // Create Post's photo/video upload) rather than routed through a
        // server API endpoint - a server route's request body would get
        // rejected by the hosting platform's size limit for anything
        // much bigger than a few MB, which a short video easily is.
        const supabase = createClient()
        const ext = file.name.split('.').pop()
        const path = `${user.id}/${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage.from('contact-support').upload(path, file, {
          cacheControl: '31536000',
        })
        if (uploadError) throw new Error(uploadError.message || 'Could not upload your photo/video.')
        const { data: urlData } = supabase.storage.from('contact-support').getPublicUrl(path)
        mediaUrl = urlData.publicUrl
      }

      await submitContact.mutateAsync({
        userId: user.id,
        name: name.trim(),
        message: message.trim(),
        mediaUrl,
        mediaType,
      })
      setDone(true)
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  if (loading) return <PageLoader />

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-sm w-full text-center space-y-4">
          <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
          <h1 className="text-lg font-bold">Thanks - we've got it</h1>
          <p className="text-sm text-muted-foreground">
            Your message has been sent to SociaLens support. We'll look into it as soon as we can.
          </p>
          <button
            onClick={() => router.push('/settings/support')}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white font-medium text-sm"
          >
            Back to Support
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto p-4 space-y-5 pb-10">
      <div className="flex items-center gap-2">
        <button onClick={() => router.back()} className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <Headset className="h-5 w-5 text-pink-500" />
        <h1 className="text-xl font-bold">Contact Support</h1>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed">
        Tell us what's going on and, if it helps, attach a photo or video of the issue. This goes straight to SociaLens's support team.
      </p>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Your name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
            className="w-full h-11 px-3.5 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/30"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Attach a photo or video (optional)</label>
          {preview ? (
            <div className="relative rounded-xl border overflow-hidden w-full max-w-xs">
              {mediaType === 'video' ? (
                <video src={preview} controls className="w-full max-h-56 object-contain bg-black" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Attachment preview" className="w-full max-h-56 object-contain bg-muted" />
              )}
              <button
                onClick={handleRemoveFile}
                className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-8 text-muted-foreground hover:border-pink-500/50 hover:text-pink-500 transition-colors"
            >
              <ImagePlus className="h-6 w-6" />
              <span className="text-sm">Tap to upload a photo or video</span>
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files?.[0])}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">What's the problem?</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
            placeholder="Describe the issue you're facing..."
            rows={6}
            className="w-full px-3.5 py-3 rounded-xl border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-pink-500/30"
          />
          <p className="text-xs text-muted-foreground text-right">{message.length}/{MAX_MESSAGE_LENGTH}</p>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={uploading}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {uploading ? 'Submitting...' : 'Submit'}
        </button>
      </div>
    </div>
  )
}
