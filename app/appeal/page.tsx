'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Check, Loader2, Lock, ShieldCheck, Upload, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { checkPhotoHasClearFace, faceCheckMessage } from '@/lib/utils/faceDetection'
import { useVerifyPassword, useSubmitAppeal } from '@/lib/hooks/useAppeal'

type Step = 'loading' | 'not-suspended' | 'photo' | 'letter' | 'confirm' | 'submitted'

const MIN_LETTER_LENGTH = 20

export default function AppealPage() {
  const router = useRouter()
  const supabase = createClient()
  const verifyPassword = useVerifyPassword()
  const submitAppeal = useSubmitAppeal()

  const [step, setStep] = useState<Step>('loading')
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)

  // Photo step
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [checkingPhoto, setCheckingPhoto] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [photoApproved, setPhotoApproved] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const hiddenImgRef = useRef<HTMLImageElement>(null)

  // Letter step
  const [letter, setLetter] = useState('')

  // Confirm step
  const [password, setPassword] = useState('')
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.replace('/login')
        return
      }
      setUserId(session.user.id)
      setEmail(session.user.email ?? null)

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_suspended')
        .eq('id', session.user.id)
        .single()

      setStep(profile?.is_suspended ? 'photo' : 'not-suspended')
    }
    init()
  }, [])

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview)
    }
  }, [photoPreview])

  const handleFileSelect = async (file: File | undefined) => {
    if (!file) return
    if (photoPreview) URL.revokeObjectURL(photoPreview)

    const previewUrl = URL.createObjectURL(file)
    setPhotoFile(file)
    setPhotoPreview(previewUrl)
    setPhotoApproved(false)
    setPhotoError(null)
    setCheckingPhoto(true)

    const img = hiddenImgRef.current
    if (!img) {
      setCheckingPhoto(false)
      setPhotoError("We couldn't check that photo right now. Please try again.")
      return
    }

    img.onload = async () => {
      const result = await checkPhotoHasClearFace(img)
      setCheckingPhoto(false)
      if (result.ok) {
        setPhotoApproved(true)
      } else {
        setPhotoApproved(false)
        setPhotoError(faceCheckMessage(result.reason))
      }
    }
    img.onerror = () => {
      setCheckingPhoto(false)
      setPhotoError("That file couldn't be read as an image. Please try a different photo.")
    }
    img.src = previewUrl
  }

  const handleSubmit = async () => {
    if (!userId || !email || !photoFile) return
    setConfirmError(null)
    setSubmitting(true)
    try {
      await verifyPassword.mutateAsync({ email, password })

      // Straight to Supabase Storage from the browser (same reasoning as
      // Create Post and Chat media) rather than through a server route,
      // so this never depends on the hosting platform's request-body
      // size limit for what's otherwise a perfectly normal photo upload.
      const ext = photoFile.name.split('.').pop() || 'jpg'
      const path = `${userId}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('appeals').upload(path, photoFile, {
        cacheControl: '31536000',
      })
      if (uploadError) throw new Error(uploadError.message || 'Could not upload your photo.')
      const { data: urlData } = supabase.storage.from('appeals').getPublicUrl(path)
      const uploadData = { url: urlData.publicUrl }

      await submitAppeal.mutateAsync({ userId, photoUrl: uploadData.url, letter })
      setStep('submitted')
    } catch (err: any) {
      setConfirmError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (step === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (step === 'not-suspended') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-sm w-full text-center space-y-4">
          <ShieldCheck className="h-12 w-12 text-green-500 mx-auto" />
          <h1 className="text-lg font-bold">Your account is in good standing</h1>
          <p className="text-sm text-muted-foreground">There's no active suspension to appeal right now.</p>
          <button onClick={() => router.push('/feed')} className="text-sm text-pink-500 font-medium">
            Go to SociaLens
          </button>
        </div>
      </div>
    )
  }

  if (step === 'submitted') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="mx-auto h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center">
            <Check className="h-8 w-8 text-green-500" />
          </div>
          <h1 className="text-xl font-bold">Your appeal is submitted</h1>
          <p className="text-sm text-muted-foreground">
            Our team will review it before your suspension deadline. You'll regain access if it's approved.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      {/* Hidden image used only to run the face check against - Never shown to the user directly. */}
      <img ref={hiddenImgRef} alt="" className="hidden" />

      <div className="max-w-sm w-full space-y-5">
        <div className="flex items-center gap-2 justify-center">
          <Lock className="h-5 w-5 text-red-500" />
          <h1 className="text-lg font-bold">Appeal your suspension</h1>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1.5 justify-center">
          {(['photo', 'letter', 'confirm'] as Step[]).map((s, i) => (
            <div key={s} className={`h-1.5 rounded-full transition-all ${step === s ? 'w-6 bg-pink-500' : 'w-1.5 bg-muted'}`} />
          ))}
        </div>

        {step === 'photo' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Upload a clear photo of your face - this helps us confirm it's really you.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={e => handleFileSelect(e.target.files?.[0])}
            />

            {photoPreview ? (
              <div className="relative w-40 h-40 mx-auto rounded-2xl overflow-hidden border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoPreview} alt="Your photo" className="w-full h-full object-cover" />
                {checkingPhoto && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-white" />
                  </div>
                )}
                {photoApproved && (
                  <div className="absolute top-1.5 right-1.5 bg-green-500 rounded-full p-1">
                    <Check className="h-3 w-3 text-white" />
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-40 h-40 mx-auto rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-pink-500 hover:text-pink-500 transition-colors"
              >
                <Camera className="h-7 w-7" />
                <span className="text-xs">Take or upload a photo</span>
              </button>
            )}

            {photoError && <p className="text-xs text-red-500 text-center px-4">{photoError}</p>}

            {photoPreview && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <Upload className="h-3 w-3" /> Choose a different photo
              </button>
            )}

            <button
              onClick={() => setStep('letter')}
              disabled={!photoApproved || checkingPhoto}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white font-medium disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        )}

        {step === 'letter' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Write a short letter explaining why your account should be reinstated.
            </p>
            <textarea
              value={letter}
              onChange={e => setLetter(e.target.value)}
              rows={6}
              placeholder="I'm sorry for..."
              className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm outline-none border border-transparent focus:border-pink-500 resize-none"
            />
            <p className="text-xs text-muted-foreground text-right">{letter.trim().length}/{MIN_LETTER_LENGTH} min characters</p>

            <div className="flex gap-2">
              <button onClick={() => setStep('photo')} className="flex-1 py-3 rounded-xl border font-medium text-sm">
                Back
              </button>
              <button
                onClick={() => setStep('confirm')}
                disabled={letter.trim().length < MIN_LETTER_LENGTH}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white font-medium disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Enter your password to confirm and submit your appeal.
            </p>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm outline-none border border-transparent focus:border-pink-500"
            />
            {confirmError && <p className="text-xs text-red-500 text-center">{confirmError}</p>}

            <div className="flex gap-2">
              <button onClick={() => setStep('letter')} disabled={submitting} className="flex-1 py-3 rounded-xl border font-medium text-sm disabled:opacity-50">
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={!password || submitting}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit Appeal'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
