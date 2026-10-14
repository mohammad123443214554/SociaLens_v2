'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Hash, Search, TrendingUp, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { formatCount } from '@/lib/utils/helpers'

function extractHashtags(content: string): string[] {
  return content.match(/#[\\w\\u0600-\\u06FF]+/g) || []
}

export default function ExploreHashtagsPage() {
  const [query, setQuery] = useState('')
  const supabase = createClient()

  const { data: hashtags = [], isLoading, isError } = useQuery({
    queryKey: ['all-explore-hashtags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('posts')
        .select('content, views_count')
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error

      const totals = new Map<string, { tag: string; views: number; posts: number }>()
      ;(data || []).forEach(post => {
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
    },
    staleTime: 60_000,
  })

  const filteredHashtags = useMemo(() => {
    const needle = query.trim().replace(/^#/, '').toLocaleLowerCase()
    if (!needle) return hashtags
    return hashtags.filter(item => item.tag.replace(/^#/, '').toLocaleLowerCase().includes(needle))
  }, [hashtags, query])

  return (
    <main className="mx-auto w-full max-w-4xl px-3 pb-24 pt-4 sm:px-5 sm:pt-7">
      <Link href="/explore" className="mb-5 inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/70 px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:border-pink-500/40 hover:text-pink-400">
        <ArrowLeft className="h-4 w-4" /> Back to Explore
      </Link>

      <header className="mb-6 overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-br from-pink-500/10 via-card/70 to-purple-500/10 p-5 sm:p-7">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-pink-500/15 text-pink-400">
            <Hash className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-pink-400"><TrendingUp className="h-3.5 w-3.5" /> Explore</p>
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Trending Hashtags</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Discover the hashtags getting views across real SociaLens posts and reels.</p>
          </div>
        </div>
        <div className="relative mt-6">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search hashtags..." aria-label="Search hashtags" className="h-12 rounded-2xl border-border/80 bg-background/80 pl-10 pr-10 focus-visible:ring-pink-500/50" />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear hashtag search" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"><X className="h-4 w-4" /></button>}
        </div>
      </header>

      <section className="overflow-hidden rounded-2xl border border-border/80 bg-card/40">
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-bold">All hashtags</h2>
          <span className="text-xs text-muted-foreground">{filteredHashtags.length} found</span>
        </div>
        {isLoading ? (
          <div className="space-y-3 p-5">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-muted/70" />)}</div>
        ) : isError ? (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">Hashtags could not be loaded. Please try again.</div>
        ) : filteredHashtags.length ? (
          <div className="divide-y divide-border/60">
            {filteredHashtags.map(item => (
              <div key={item.tag.toLocaleLowerCase()} className="flex min-w-0 items-center justify-between gap-4 px-4 py-3.5 sm:px-5">
                <span className="min-w-0 truncate text-sm font-semibold text-pink-400">{item.tag}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatCount(item.views)} views</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-14 text-center">
            <Hash className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-semibold">{query ? 'No matching hashtags' : 'No hashtags found yet'}</p>
            <p className="mt-1 text-xs text-muted-foreground">{query ? 'Try another hashtag name.' : 'Hashtags from real posts will appear here.'}</p>
          </div>
        )}
      </section>
      <p className="mt-3 text-center text-xs text-muted-foreground">Hashtag capitalization variants are combined. Views are summed from posts containing each hashtag.</p>
    </main>
  )
}
