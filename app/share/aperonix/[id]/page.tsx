'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/utils/helpers'

// A public, no-login-required page for a shared Aperonix reply or user prompt.
// The content is stored in the shared-content table and read back by id.
export default function PublicAperonixReplyPage() {
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const contentType = searchParams.get('type')
  const isPrompt = contentType === 'prompt'
  const isChat = contentType === 'chat'
  const [content, setContent] = useState<string | null>(null)
  const [sharedChat, setSharedChat] = useState<any>(null)
  const [owner, setOwner] = useState<{ username?: string; avatar_url?: string | null } | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'not-found'>('loading')

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    ;(async () => {
      const { data } = await supabase
        .from('shared_aperonix_replies')
        .select('content,shared_by')
        .eq('id', params.id)
        .maybeSingle()
      if (cancelled) return
      if (!data) { setStatus('not-found'); return }
      if (contentType === 'chat') {
        try {
          const parsed = JSON.parse(data.content)
          if (parsed?.type !== 'chat' || !Array.isArray(parsed.messages)) throw new Error('Invalid shared chat')
          setSharedChat(parsed)
          setOwner(parsed.owner || null)
        } catch {
          setStatus('not-found')
          return
        }
      } else {
        setContent(data.content)
      }
      setStatus('ready')
    })()
    return () => { cancelled = true }
  }, [params.id, contentType])

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (status === 'not-found' || (!content && !sharedChat)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center bg-background">
        <span className="text-3xl font-bold bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent">SociaLens</span>
        <p className="font-semibold mt-4">{isChat ? "This chat isn't available" : isPrompt ? "This prompt isn't available" : "This reply isn't available"}</p>
        <p className="text-sm text-muted-foreground max-w-xs">The link may be broken, or the shared content is no longer available.</p>
        <Link href="/login" className="mt-3 px-6 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white text-sm font-semibold">
          Open SociaLens
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between px-4 h-14 border-b sticky top-0 bg-background/90 backdrop-blur-md z-10">
        <span className="font-bold bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent">SociaLens</span>
        <Link href="/login" className="text-xs font-semibold px-3.5 py-1.5 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 text-white">
          Open app
        </Link>
      </header>

      <main className="flex-1 max-w-lg w-full mx-auto p-5 space-y-4">
        {isChat ? (
          <>
            <div className="flex items-center gap-3 border-b pb-4">
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted">
                {owner?.avatar_url ? <img src={getAvatarUrl(owner.avatar_url)} alt={owner.username || 'User'} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-sm font-semibold">{(owner?.username || 'U').slice(0, 1).toUpperCase()}</div>}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Shared conversation</p>
                <h1 className="truncate text-lg font-semibold">{sharedChat?.title || 'Chat'}</h1>
                <p className="text-xs text-muted-foreground">{owner?.username || 'SociaLens user'} · {sharedChat?.messages?.length || 0} messages</p>
              </div>
            </div>
            <div className="space-y-6 py-2">
              {(sharedChat?.messages || []).map((message: any, index: number) => (
                <article key={`${index}-${message.role}`} className="flex items-start gap-3">
                  <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full">
                    {message.role === 'model' ? (
                      <img src="/images/aperonix-logo.png" alt="Aperonix" className="h-full w-full object-contain" />
                    ) : owner?.avatar_url ? (
                      <img src={getAvatarUrl(owner.avatar_url)} alt={owner.username || 'User'} className="h-full w-full rounded-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center rounded-full bg-muted text-xs font-semibold">{(owner?.username || 'U').slice(0, 1).toUpperCase()}</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="mb-1 text-sm font-semibold">{message.role === 'model' ? 'Aperonix' : owner?.username || 'User'}</p>
                    {message.content && <p className="whitespace-pre-wrap break-words text-sm leading-7">{message.content}</p>}
                    {message.attachments?.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Attachments: {message.attachments.map((a: any) => a.name).join(', ')}</p>}
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full">
                {isPrompt && owner?.avatar_url ? <img src={getAvatarUrl(owner.avatar_url)} alt={owner.username || 'User'} className="h-full w-full object-cover" /> : <img src="/images/aperonix-logo.png" alt="Aperonix" className="h-full w-full object-contain" />}
              </div>
              <div>
                <p className="font-semibold text-sm">{isPrompt ? owner?.username || 'Shared user prompt' : 'Aperonix'}</p>
                <p className="text-xs text-muted-foreground">{isPrompt ? 'Shared from a SociaLens conversation' : "SociaLens's AI assistant"}</p>
              </div>
            </div>
            <div className="rounded-2xl border bg-muted/30 p-4">
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{content}</p>
            </div>
          </>
        )}
      </main>

      <footer className="border-t p-5 text-center bg-muted/30">
        <p className="text-sm text-muted-foreground mb-3">Chat with Aperonix and much more on SociaLens</p>
        <Link href="/signup" className="inline-block px-8 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white text-sm font-semibold">
          Sign up free
        </Link>
      </footer>
    </div>
  )
}
