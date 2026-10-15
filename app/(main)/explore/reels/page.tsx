'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useInfiniteQuery } from '@tanstack/react-query'
import { ArrowLeft, Heart, MessageCircle, Play, Search, X, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { PostWithProfile } from '@/lib/types/database.types'
import { formatCount } from '@/lib/utils/helpers'
import { InfiniteScrollSentinel } from '@/components/shared/InfiniteScrollSentinel'

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
const POST_SELECT = '*, profiles!posts_user_id_fkey(*)'

export default function AllReelsPage() {
  const [query, setQuery] = useState('')
  const supabase = createClient()
  const searchTerm = query.trim()

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['all-explore-reels', searchTerm.toLocaleLowerCase()],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      let request = supabase.from('posts').select(POST_SELECT)
        .eq('media_type', 'video').not('media_url', 'is', null)
        .order('created_at', { ascending: false })
        .range(pageParam, pageParam + PAGE_SIZE - 1)
      if (searchTerm) request = request.ilike('content', `%${searchTerm}%`)
      const { data: rows, error } = await request
      if (error) throw error
      const reels = (rows || []) as PostWithProfile[]
      return { reels, nextCursor: reels.length === PAGE_SIZE ? pageParam + PAGE_SIZE : null }
    },
    getNextPageParam: lastPage => lastPage.nextCursor,
    staleTime: 30_000,
  })

  const reels = data?.pages.flatMap(page => page.reels) ?? []

  return (
    <main className="mx-auto w-full max-w-6xl px-3 pb-24 pt-4 sm:px-5 sm:pt-7">
      <Link href="/explore" className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/70 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-pink-500/40 hover:text-pink-400 sm:mb-5 sm:px-3 sm:py-2 sm:text-sm">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Explore
      </Link>

      <header className="mb-4 overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-br from-pink-500/10 via-card/70 to-purple-500/10 p-3.5 sm:mb-6 sm:rounded-3xl sm:p-7">
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
          <span className="text-[10px] text-muted-foreground sm:text-xs">Scroll to load more</span>
        </div>
        {isLoading ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-muted sm:rounded-2xl" />)}</div>
        ) : isError ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">Reels could not be loaded. Please try again.</div>
        ) : reels.length ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
            {reels.map(reel => (
              <article key={reel.id} className="min-w-0 overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm sm:rounded-2xl">
                <div className="relative aspect-[3/4] overflow-hidden bg-black">
                  <video src={reel.media_url ?? undefined} controls playsInline preload="metadata" className="h-full w-full object-cover" aria-label={`Video by @${reel.profiles?.username ?? 'user'}`} />
                  <span className="pointer-events-none absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/65 px-1.5 py-1 text-[9px] font-semibold text-white"><Play className="h-2.5 w-2.5 fill-current" /> Reel</span>
                </div>
                <div className="p-2 sm:p-3">
                  <Link href={`/profile/${reel.profiles?.username ?? ''}`} className="block truncate text-[11px] font-semibold hover:text-pink-400 sm:text-xs">@{reel.profiles?.username ?? 'user'}</Link>
                  <p className="mt-1 line-clamp-2 min-h-8 text-[10px] text-muted-foreground sm:text-xs">{reel.content?.trim() || 'Video post'}</p>
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
      </section>
    </main>
  )
}
