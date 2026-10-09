'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Heart, MessageCircle, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getAvatarUrl, getPostPreviewText } from '@/lib/utils/helpers'
import { VerifiedBadge } from '@/components/shared/VerifiedBadge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

// A public post/Reel page - no login required. Anyone with the link can
// open this straight from WhatsApp, Messages, etc. It only ever shows
// what the same account's privacy settings already let a stranger see:
// the "Posts respect author privacy" database rule (public account +
// post visibility set to "everyone") decides that on its own, the same
// way it already does for a logged-out visitor browsing inside the app -
// this page doesn't add or bypass any privacy check of its own.
export default function PublicPostPage() {
  const params = useParams<{ id: string }>()
  const [post, setPost] = useState<any>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'not-found'>('loading')

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    ;(async () => {
      const { data } = await supabase
        .from('posts')
        .select('id, content, media_url, media_type, likes_count, comments_count, created_at, profiles(username, avatar_url, is_verified, verification_type)')
        .eq('id', params.id)
        .maybeSingle()
      if (cancelled) return
      if (!data) { setStatus('not-found'); return }
      setPost(data)
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

  if (status === 'not-found' || !post) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center bg-background">
        <span className="text-3xl font-bold bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent">SociaLens</span>
        <p className="font-semibold mt-4">This post isn't available</p>
        <p className="text-sm text-muted-foreground max-w-xs">
          It may have been deleted, or the account it belongs to has a private or restricted audience for this content.
        </p>
        <Link href="/login" className="mt-3 px-6 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white text-sm font-semibold">
          Open SociaLens
        </Link>
      </div>
    )
  }

  const profile = post.profiles
  const isVideo = post.media_type === 'video'

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between px-4 h-14 border-b sticky top-0 bg-background/90 backdrop-blur-md z-10">
        <span className="font-bold bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent">SociaLens</span>
        <Link href="/login" className="text-xs font-semibold px-3.5 py-1.5 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 text-white">
          Open app
        </Link>
      </header>

      <main className="flex-1 max-w-lg w-full mx-auto p-4 space-y-3">
        <Link href={`/login`} className="flex items-center gap-2 w-fit">
          <Avatar className="h-9 w-9">
            <AvatarImage src={getAvatarUrl(profile?.avatar_url)} />
            <AvatarFallback>{profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className="text-sm font-semibold flex items-center gap-1">
            {profile?.username}
            {profile?.is_verified && <VerifiedBadge type={profile.verification_type} className="text-xs" />}
          </span>
        </Link>

        {post.media_url && (
          isVideo ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video src={post.media_url} controls playsInline className="w-full rounded-xl bg-black max-h-[75vh] object-contain" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.media_url} alt="Post" className="w-full rounded-xl object-contain max-h-[75vh] bg-muted" />
          )
        )}

        {post.content && <p className="text-sm whitespace-pre-wrap">{getPostPreviewText(post.content)}</p>}

        <div className="flex items-center gap-4 text-sm text-muted-foreground pt-1">
          <span className="flex items-center gap-1.5"><Heart className="h-4 w-4" /> {post.likes_count || 0}</span>
          <span className="flex items-center gap-1.5"><MessageCircle className="h-4 w-4" /> {post.comments_count || 0}</span>
        </div>
      </main>

      <footer className="border-t p-5 text-center bg-muted/30">
        <p className="text-sm text-muted-foreground mb-3">
          Join SociaLens to like, comment, and see more from @{profile?.username}
        </p>
        <Link href="/signup" className="inline-block px-8 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white text-sm font-semibold">
          Sign up free
        </Link>
      </footer>
    </div>
  )
}
