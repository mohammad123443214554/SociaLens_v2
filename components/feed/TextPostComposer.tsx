'use client'

import { useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Clock3, Send, X } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useUser } from '@/lib/hooks/useUser'
import { createClient } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/utils/helpers'
import { isRestricted } from '@/lib/utils/restrictionCheck'
import { RestrictionPopup } from '@/components/shared/RestrictionPopup'
import { useQueryClient } from '@tanstack/react-query'

const MAX_TEXT_POST_LENGTH = 5000
const EXPIRATION_OPTIONS = [
  { label: '1 hour', value: 60 * 60 * 1000, detail: 'Short-lived update' },
  { label: '1 day', value: 24 * 60 * 60 * 1000, detail: 'Available for 24 hours' },
  { label: '7 days', value: 7 * 24 * 60 * 60 * 1000, detail: 'Available for one week' },
  { label: '30 days', value: 30 * 24 * 60 * 60 * 1000, detail: 'Available for one month' },
] as const

type ComposerStep = 'expiration' | 'preview'

export function TextPostComposer() {
  const { user, profile } = useUser()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [content, setContent] = useState('')
  const [step, setStep] = useState<ComposerStep | null>(null)
  const [expirationMs, setExpirationMs] = useState<number>(EXPIRATION_OPTIONS[1].value)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
  const [showRestrictionPopup, setShowRestrictionPopup] = useState(false)

  const closeFlow = () => {
    if (posting) return
    setStep(null)
    setError('')
  }

  const continueToPreview = () => {
    if (!content.trim()) {
      setError('Write something before continuing.')
      return
    }
    setError('')
    setStep('preview')
  }

  const sharePost = async () => {
    if (!user || !content.trim() || posting) return
    if (content.trim().length > MAX_TEXT_POST_LENGTH) {
      setError(`Text posts can be up to ${MAX_TEXT_POST_LENGTH.toLocaleString()} characters.`)
      return
    }
    if (isRestricted(profile?.restrict_post_until)) {
      setShowRestrictionPopup(true)
      return
    }

    setPosting(true)
    setError('')
    try {
      const { error: insertError } = await supabase.from('posts').insert({
        user_id: user.id,
        content: content.trim(),
        media_url: null,
        media_type: 'none',
        expires_at: new Date(Date.now() + expirationMs).toISOString(),
      } as any)
      if (insertError) throw insertError

      await supabase.rpc('increment_posts_count', { profile_id: user.id })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['feed-posts'] }),
        queryClient.invalidateQueries({ queryKey: ['reels-posts'] }),
        queryClient.invalidateQueries({ queryKey: ['profile-posts'] }),
      ])
      setContent('')
      setStep(null)
    } catch (err) {
      console.error('Text post could not be shared', err)
      setError('Your text post could not be shared. Please try again.')
    } finally {
      setPosting(false)
    }
  }

  return (
    <>
      {showRestrictionPopup && (
        <RestrictionPopup feature="posting" until={profile?.restrict_post_until} onClose={() => setShowRestrictionPopup(false)} />
      )}

      <section aria-label="Create a text post" className="mb-4 rounded-xl border border-border/70 bg-card px-3 py-3 shadow-sm sm:rounded-2xl sm:px-4 sm:py-3.5">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <Avatar className="h-9 w-9 shrink-0 border border-border sm:h-10 sm:w-10">
            <AvatarImage src={getAvatarUrl(profile?.avatar_url)} />
            <AvatarFallback>{profile?.username?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
          </Avatar>
          <textarea
            aria-label="What's on your mind?"
            value={content}
            onChange={event => { setContent(event.target.value.slice(0, MAX_TEXT_POST_LENGTH)); setError('') }}
            placeholder="What's on your mind?"
            rows={1}
            maxLength={MAX_TEXT_POST_LENGTH}
            className="min-h-10 min-w-0 flex-1 resize-none rounded-full border border-border/80 bg-muted/35 px-4 py-2.5 text-sm leading-5 text-foreground outline-none transition placeholder:text-muted-foreground focus:border-pink-500/50 focus:ring-2 focus:ring-pink-500/10 sm:min-h-11 sm:py-3"
          />
          <button
            type="button"
            onClick={() => { setStep('expiration'); setError('') }}
            disabled={!user || !content.trim()}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-pink-500 px-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-pink-600 disabled:cursor-not-allowed disabled:opacity-50 sm:h-11 sm:px-5"
          >
            <Send className="h-4 w-4" />
            <span>Send</span>
          </button>
        </div>
        <div className="mt-1 flex justify-end px-1 text-[10px] text-muted-foreground">{content.length.toLocaleString()} / {MAX_TEXT_POST_LENGTH.toLocaleString()}</div>
      </section>

      {step && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-3 backdrop-blur-[2px] sm:p-5" onClick={closeFlow}>
          <section role="dialog" aria-modal="true" aria-labelledby="text-post-dialog-title" className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" onClick={event => event.stopPropagation()}>
            <header className="flex items-center justify-between border-b border-border/70 px-4 py-3.5 sm:px-5">
              <div className="flex items-center gap-2">
                {step === 'preview' && (
                  <button type="button" onClick={() => { setStep('expiration'); setError('') }} aria-label="Back to expiration" className="rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                )}
                <div>
                  <h2 id="text-post-dialog-title" className="text-sm font-bold sm:text-base">{step === 'expiration' ? 'Create text post' : 'Preview your post'}</h2>
                  <p className="mt-0.5 text-[11px] text-muted-foreground sm:text-xs">{step === 'expiration' ? 'Choose when this post should be permanently deleted.' : 'Review your text before sharing it.'}</p>
                </div>
              </div>
              <button type="button" onClick={closeFlow} disabled={posting} aria-label="Close" className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50">
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="space-y-4 p-4 sm:p-5">
              {step === 'expiration' ? (
                <>
                  <div className="flex items-center gap-2 rounded-xl border border-pink-500/20 bg-pink-500/5 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                    <Clock3 className="h-4 w-4 shrink-0 text-pink-400" />
                    This text post is temporary. When its timer ends, it will be permanently deleted from SociaLens and Supabase.
                  </div>

                  <div className="rounded-xl border border-border bg-background px-3.5 py-3">
                    <p className="mb-2 text-[11px] font-semibold text-muted-foreground">Post content</p>
                    <p className="max-h-36 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{content.trim()}</p>
                    <p className="mt-2 text-right text-[10px] text-muted-foreground">{content.length.toLocaleString()} / {MAX_TEXT_POST_LENGTH.toLocaleString()} characters</p>
                  </div>

                  <div>
                    <p className="mb-2.5 text-xs font-semibold text-foreground">Keep this post for</p>
                    <div className="grid grid-cols-2 gap-2">
                      {EXPIRATION_OPTIONS.map(option => {
                        const selected = expirationMs === option.value
                        return (
                          <button key={option.value} type="button" onClick={() => setExpirationMs(option.value)} className={`flex min-h-[66px] items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${selected ? 'border-pink-500 bg-pink-500/10 ring-1 ring-pink-500/20' : 'border-border hover:border-pink-500/35 hover:bg-muted/40'}`}>
                            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${selected ? 'bg-pink-500 text-white' : 'bg-muted text-muted-foreground'}`}>{selected ? <Check className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}</span>
                            <span className="min-w-0">
                              <span className="block text-xs font-semibold text-foreground">{option.label}</span>
                              <span className="mt-0.5 block text-[10px] text-muted-foreground">{option.detail}</span>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-border bg-background">
                  <div className="flex items-center gap-2.5 border-b border-border/60 px-4 py-3">
                    <Avatar className="h-9 w-9 border border-border">
                      <AvatarImage src={getAvatarUrl(profile?.avatar_url)} />
                      <AvatarFallback>{profile?.username?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">@{profile?.username || 'you'}</p>
                      <p className="text-[11px] text-muted-foreground">Text post · Expires in {EXPIRATION_OPTIONS.find(option => option.value === expirationMs)?.label}</p>
                    </div>
                  </div>
                  <div className="max-h-[45vh] overflow-y-auto px-4 py-4">
                    <p className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground">{content.trim()}</p>
                  </div>
                  <div className="border-t border-border/60 px-4 py-2.5 text-[11px] text-muted-foreground">This post will be permanently removed after {EXPIRATION_OPTIONS.find(option => option.value === expirationMs)?.label}.</div>
                </div>
              )}

              {error && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</p>}

              <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
                <button type="button" onClick={closeFlow} disabled={posting} className="rounded-full px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50">Cancel</button>
                {step === 'expiration' ? (
                  <button type="button" onClick={continueToPreview} className="inline-flex items-center gap-2 rounded-full bg-pink-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-pink-600">
                    Next <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button type="button" onClick={sharePost} disabled={posting} className="inline-flex items-center gap-2 rounded-full bg-pink-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-pink-600 disabled:cursor-wait disabled:opacity-60">
                    {posting ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Send className="h-4 w-4" />}
                    {posting ? 'Sharing…' : 'Share Post'}
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
