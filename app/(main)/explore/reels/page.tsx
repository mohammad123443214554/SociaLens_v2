'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useInfiniteQuery } from '@tanstack/react-query'
import { ArrowLeft, Heart, MessageCircle, Play, Search, X, Loader2, TrendingUp } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { PostWithProfile } from '@/lib/types/database.types'
import { formatCount } from '@/lib/utils/helpers'
import { InfiniteScrollSentinel } from '@/components/shared/InfiniteScrollSentinel'
import { PostCaption } from '@/components/shared/PostCaption'
import { ReelViewer } from '@/components/shared/ReelViewer'
import { useUser } from '@/lib/hooks/useUser'
import { getViewerContext } from '@/lib/recommendation/viewerContext'
import { rankReels } from '@/lib/recommendation/rankReels'

function ReelsMark({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className} fill="none">
      <rect x="4" y="7" width="24" height="21" rx="6" stroke="currentColor" strokeWidth="2.2" />
      <path d="M9 7 13 3M17 7l4-4M5 13h22" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="m14 16 6 3.5-6 3.5V16Z" fill="currentColor" stroke="currentColor" strokeLinejoin="round" />
    </svg>
  )
}

const PAGE_SIZE = 12
const CANDIDATE_WINDOW = PAGE_SIZE * 4
const POST_SELECT = '*, profiles!posts_user_id_fkey(*)'

async function attachRecommendationLabels(posts: PostWithProfile[], supabase: ReturnType<typeof createClient>) {
  if (!posts.length) return posts
  const { data, error } = await (supabase as any)
    .from('post_content_analysis_labels')
    .select('post_id, label_type, label_slug, relevance')
    .in('post_id', posts.map(post => post.id))
  if (error) {
    console.warn('Reel content labels unavailable; using available ranking signals', error.message)
    return posts
  }
  const byPost = new Map<string, any[]>()
  for (const label of data ?? []) {
    const list = byPost.get(label.post_id) ?? []
    list.push(label)
    byPost.set(label.post_id, list)
  }
  return posts.map(post => ({ ...post, recommendation_labels: byPost.get(post.id) ?? [] }))
}

export default function AllReelsPage() {
  const [query, setQuery] = useState('')
  useEffect(() => {
    const initialQuery = new URLSearchParams(window.location.search).get('q')
    if (initialQuery) setQuery(initialQuery)
  }, [])
  const [hiddenReelIds, setHiddenReelIds] = useState<string[]>([])
  const supabase = createClient()
  const { user } = useUser()
  const searchTerm = query.trim()

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['all-explore-reels', user?.id, searchTerm.toLocaleLowerCase()],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      let request = supabase.from('posts').select(POST_SELECT)
        .eq('media_type', 'video').not('media_url', 'is', null)
        .order('created_at', { ascending: false })
      if (user) {
        const { data: hiddenRows, error: hiddenError } = await supabase.from('post_not_interested').select('post_id').eq('user_id', user.id)
        if (hiddenError) throw hiddenError
        const hiddenIds = (hiddenRows || []).map(row => row.post_id)
        if (hiddenIds.length) request = request.not('id', 'in', `(${hiddenIds.join(',')})`)
      }
      if (searchTerm) request = request.ilike('content', `%${searchTerm}%`)
      request = request.range(pageParam, pageParam + CANDIDATE_WINDOW - 1)
      const { data: rows, error } = await request
      if (error) throw error
      let candidates = (rows || []) as PostWithProfile[]
      candidates = await attachRecommendationLabels(candidates, supabase)
      // Return the full ranked candidate window. If we only returned PAGE_SIZE
      // but advanced the offset by CANDIDATE_WINDOW, the other candidates were
      // permanently skipped whenever the total reel count was below 48.
      let reels = candidates
      try {
        const ctx = await getViewerContext(supabase, user?.id)
        reels = rankReels(candidates, ctx, CANDIDATE_WINDOW)
      } catch (err) {
        console.error('All Explore Reels ranking failed, showing recent reels', err)
      }
      return { reels, nextCursor: candidates.length === CANDIDATE_WINDOW ? pageParam + CANDIDATE_WINDOW : null }
    },
    getNextPageParam: lastPage => lastPage.nextCursor,
    staleTime: 30_000,
  })

  const reels = (data?.pages.flatMap(page => page.reels) ?? []).filter(reel => !hiddenReelIds.includes(reel.id))

  return (
    <main className="mx-auto w-full max-w-6xl px-3 pb-24 pt-4 sm:px-5 sm:pt-7">
      <Link href="/explore" className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/70 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-pink-500/40 hover:text-pink-400 sm:mb-5 sm:px-3 sm:py-2 sm:text-sm">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Explore
      </Link>

      <header className="mb-4 px-1 py-1 sm:mb-6 sm:px-2 sm:py-2">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pink-500/15 text-pink-400 sm:h-12 sm:w-12 sm:rounded-2xl"><ReelsMark className="h-5 w-5 sm:h-6 sm:w-6" /></div>
          <div className="min-w-0 flex-1">
            <p className="mb-0.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-pink-400 sm:text-xs"><TrendingUp className="h-3.5 w-3.5" /> Explore</p>
            <h1 className="text-lg font-extrabold leading-tight tracking-tight sm:text-3xl">Reels</h1>
          </div>
        </div>
        <div className="relative mt-3 sm:mt-6">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground sm:left-3.5" />
          <Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search reels..." aria-label="Search reels" className="h-10 rounded-xl border-border/80 bg-background/80 pl-9 pr-9 text-sm focus-visible:ring-pink-500/50 sm:h-12 sm:rounded-2xl sm:pl-10 sm:pr-10" />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear reel search" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"><X className="h-4 w-4" /></button>}
        </div>
      </header>

      <section className="overflow-hidden rounded-xl border border-border/80 bg-card/30 p-2.5 sm:rounded-2xl sm:p-4">
        <div className="mb-3 flex items-center justify-between border-b border-border/70 pb-2.5 sm:mb-4 sm:pb-3">
          <h2 className="text-xs font-bold sm:text-sm">{searchTerm ? 'Search results' : 'Reels'}</h2>
          
        </div>
        {isLoading ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-muted sm:rounded-2xl" />)}</div>
        ) : isError ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">Reels could not be loaded. Please try again.</div>
        ) : reels.length ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
            {reels.map(reel => (
              <article key={reel.id} className="min-w-0 overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm sm:rounded-2xl">
<ReelViewer post={reel} onNotInterested={id => setHiddenReelIds(previous => [...previous, id])} trigger={<button type="button" aria-label={`Play reel by @${reel.profiles?.username ?? 'user'}`} className="relative block aspect-[3/4] w-full overflow-hidden bg-black text-left"><video src={reel.media_url ?? undefined} muted playsInline preload="metadata" className="pointer-events-none h-full w-full object-cover" aria-label={`Video by @${reel.profiles?.username ?? 'user'}`} /></button>} />
                <div className="p-2 sm:p-3">
                  <Link href={`/profile/${reel.profiles?.username ?? ''}`} className="block truncate text-[11px] font-semibold hover:text-pink-400 sm:text-xs">@{reel.profiles?.username ?? 'user'}</Link>
                  {reel.content?.trim() && <PostCaption content={reel.content} expandMode="dialog" titleClassName="text-[11px] leading-snug sm:text-xs" captionClassName="mt-1 text-[10px] text-muted-foreground whitespace-pre-wrap sm:text-[11px]" buttonClassName="mt-1 text-[10px] font-semibold text-pink-400 hover:underline sm:text-[11px]" />}
                  <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground sm:text-xs">
                    <span className="inline-flex items-center gap-1"><Heart className="h-3 w-3" />{formatCount(reel.likes_count)}</span>
                    <span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" />{formatCount(reel.comments_count)}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="px-4 py-14 text-center"><ReelsMark className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" /><p className="text-sm font-semibold">{searchTerm ? 'No matching reels' : 'No reels found yet'}</p><p className="mt-1 text-xs text-muted-foreground">{searchTerm ? 'Try another search.' : 'Videos from real posts will appear here.'}</p></div>
        )}
        <InfiniteScrollSentinel onIntersect={fetchNextPage} hasMore={!!hasNextPage} isLoading={isFetchingNextPage} />
        {isFetchingNextPage && <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>}
        {hasNextPage && !isFetchingNextPage && !isLoading && (
          <div className="flex justify-center py-4">
            <button type="button" onClick={() => fetchNextPage()} className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-pink-500/50 hover:text-pink-400">
              Load more reels
            </button>
          </div>
        )}
      </section>
    </main>
  )
}
