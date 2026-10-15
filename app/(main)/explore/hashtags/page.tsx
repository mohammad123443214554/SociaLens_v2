'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Hash, Search, TrendingUp, X, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { formatCount } from '@/lib/utils/helpers'
import { InfiniteScrollSentinel } from '@/components/shared/InfiniteScrollSentinel'

const PAGE_SIZE = 500

function extractHashtags(content: string): string[] {
  return content.match(/#[\w\u0600-\u06FF]+/g) || []
}

export default function ExploreHashtagsPage() {
  const [query, setQuery] = useState('')
  const supabase = createClient()

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['all-explore-hashtags-pages'],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data: posts, error } = await supabase
        .from('posts')
        .select('content, views_count, id')
        .order('created_at', { ascending: false })
        .range(pageParam, pageParam + PAGE_SIZE - 1)
      if (error) throw error
      const rows = posts || []
      return { posts: rows, nextCursor: rows.length === PAGE_SIZE ? pageParam + PAGE_SIZE : null }
    },
    getNextPageParam: lastPage => lastPage.nextCursor,
    staleTime: 60_000,
  })

  const hashtags = useMemo(() => {
    const totals = new Map<string, { tag: string; views: number; posts: number }>()
    const loadedPosts = data?.pages.flatMap(page => page.posts) ?? []
    loadedPosts.forEach(post => {
      const seenInPost = new Set<string>()
      extractHashtags(post.content || '').forEach(tag => {
        const key = tag.toLocaleLowerCase()
        if (seenInPost.has(key)) return
        seenInPost.add(key)
        const current = totals.get(key)
        if (current) {
          current.views += Number(post.views_count) || 0
          current.posts += 1
        } else {
          totals.set(key, { tag, views: Number(post.views_count) || 0, posts: 1 })
        }
      })
    })
    return Array.from(totals.values()).sort((a, b) => b.views - a.views || b.posts - a.posts)
  }, [data])

  const filteredHashtags = useMemo(() => {
    const needle = query.trim().replace(/^#/, '').toLocaleLowerCase()
    if (!needle) return hashtags
    return hashtags.filter(item => item.tag.replace(/^#/, '').toLocaleLowerCase().includes(needle))
  }, [hashtags, query])

  return (
    <main className="mx-auto w-full max-w-4xl px-3 pb-24 pt-4 sm:px-5 sm:pt-7">
      <Link href="/explore" className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/70 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-pink-500/40 hover:text-pink-400 sm:mb-5 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm">
        Back to Explore
      </Link>

      <header className="mb-4 overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-br from-pink-500/10 via-card/70 to-purple-500/10 p-3.5 sm:mb-6 sm:rounded-3xl sm:p-7">
        <div className="flex items-center gap-2.5 sm:items-start sm:gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pink-500/15 text-pink-400 sm:h-12 sm:w-12 sm:rounded-2xl"><Hash className="h-5 w-5 sm:h-6 sm:w-6" /></div>
          <div className="min-w-0 flex-1">
            <p className="mb-0.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-pink-400 sm:mb-1 sm:gap-2 sm:text-xs sm:tracking-[0.18em]"><TrendingUp className="h-3.5 w-3.5" /> Explore</p>
            <h1 className="text-lg font-extrabold leading-tight tracking-tight sm:text-3xl">Hashtags</h1>
          </div>
        </div>
        <div className="relative mt-3 sm:mt-6">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground sm:left-3.5" />
          <Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search hashtags..." aria-label="Search hashtags" className="h-10 rounded-xl border-border/80 bg-background/80 pl-9 pr-9 text-sm focus-visible:ring-pink-500/50 sm:h-12 sm:rounded-2xl sm:pl-10 sm:pr-10" />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear hashtag search" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"><X className="h-4 w-4" /></button>}
        </div>
      </header>

      <section className="overflow-hidden rounded-xl border border-border/80 bg-card/40 sm:rounded-2xl">
        <div className="border-b border-border/70 px-3 py-2.5 sm:px-5 sm:py-3"><h2 className="text-xs font-bold sm:text-sm">Hashtags</h2></div>
        {isLoading ? (
          <div className="space-y-3 p-5">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-muted/70" />)}</div>
        ) : isError ? (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">Hashtags could not be loaded. Please try again.</div>
        ) : filteredHashtags.length ? (
          <div className="divide-y divide-border/60">
            {filteredHashtags.map(item => <div key={item.tag.toLocaleLowerCase()} className="flex min-w-0 items-center justify-between gap-3 px-3 py-3 sm:gap-4 sm:px-5 sm:py-3.5">
              <span className="min-w-0 truncate text-xs font-semibold text-pink-400 sm:text-sm">{item.tag}</span>
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground sm:text-xs">{formatCount(item.views)} views</span>
            </div>)}
          </div>
        ) : (
          <div className="px-5 py-14 text-center"><Hash className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" /><p className="text-sm font-semibold">{query ? 'No matching hashtags' : 'No hashtags found yet'}</p><p className="mt-1 text-xs text-muted-foreground">{query ? 'Try another hashtag name.' : 'Hashtags from real posts will appear here.'}</p></div>
        )}
        <InfiniteScrollSentinel onIntersect={fetchNextPage} hasMore={!!hasNextPage} isLoading={isFetchingNextPage} />
        {isFetchingNextPage && <div className="flex justify-center pb-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>}
      </section>
    </main>
  )
}
