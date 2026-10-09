'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Sparkles, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// A public, no-login-required page for a single shared Aperonix reply.
// Aperonix conversations aren't stored anywhere normally, so sharing one
// outside the app first saves just that reply's text into its own public
// Row (see the Share button in the Aperonix chat) - this page just reads
// that row back by id.
export default function PublicAperonixReplyPage() {
  const params = useParams<{ id: string }>()
  const [content, setContent] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'not-found'>('loading')

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    ;(async () => {
      const { data } = await supabase
        .from('shared_aperonix_replies')
        .select('content')
        .eq('id', params.id)
        .maybeSingle()
      if (cancelled) return
      if (!data) { setStatus('not-found'); return }
      setContent(data.content)
      setStatus('ready')
    })()
    return () => { cancelled = true }
  }, [params.id])

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (status === 'not-found' || !content) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center bg-background">
        <span className="text-3xl font-bold bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent">SociaLens</span>
        <p className="font-semibold mt-4">This reply isn't available</p>
        <p className="text-sm text-muted-foreground max-w-xs">The link may be broken, or the reply is no longer available.</p>
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
        <div className="flex items-center gap-2.5">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="font-semibold text-sm">Aperonix</p>
            <p className="text-xs text-muted-foreground">SociaLens's AI assistant</p>
          </div>
        </div>

        <div className="rounded-2xl border bg-muted/30 p-4">
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{content}</p>
        </div>
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
