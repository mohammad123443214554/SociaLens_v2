'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useInfiniteQuery } from '@tanstack/react-query'
import { ArrowLeft, TrendingUp, Grid3x3, Heart, MessageCircle, Search, X, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { PostWithProfile } from '@/lib/types/database.types'
import { formatCount } from '@/lib/utils/helpers'
import { InfiniteScrollSentinel } from '@/components/shared/InfiniteScrollSentinel'
import { PostCaption } from '@/components/shared/PostCaption'
import { PostCard } from '@/components/feed/PostCard'
import { ReelViewer } from '@/components/shared/ReelViewer'
import { useUser } from '@/lib/hooks/useUser'
import { getViewerContext } from '@/lib/recommendation/viewerContext'
import { rankFeedPosts } from '@/lib/recommendation/rankFeedPosts'
import { rankExplorePosts } from '@/lib/recommendation/rankExplorePosts'

const PAGE_SIZE = 12
const CANDIDATE_WINDOW = PAGE_SIZE * 4
const POST_SELECT = '*, profiles!posts_user_id_fkey(*)'

export default function AllExplorePostsPage() {
  const [query, setQuery] = useState('')
  const [hiddenPostIds, setHiddenPostIds] = useState<string[]>([])
  const supabase = createClient()
  const { user } = useUser()
  const searchTerm = query.trim()

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['all-explore-photo-posts', user?.id, searchTerm.toLocaleLowerCase()],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      let request = supabase.from('posts').select(POST_SELECT)
        .neq('media_type', 'video').not('media_url', 'is', null)
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
      const candidates = (rows || []) as PostWithProfile[]
      let posts = candidates.slice(0, PAGE_SIZE)
      try {
        const ctx = await getViewerContext(supabase, user?.id)
        posts = rankExplorePosts(candidates, ctx, PAGE_SIZE)
      } catch (err) {
        console.error('All Explore Posts ranking failed, showing recent posts', err)
      }
      return { posts, nextCursor: candidates.length === CANDIDATE_WINDOW ? pageParam + CANDIDATE_WINDOW : null }
    },
    getNextPageParam: lastPage => lastPage.nextCursor,
    staleTime: 30_000,
  })

  const posts = data?.pages.flatMap(page => page.posts) ?? []

  return (
    <main className="mx-auto w-full max-w-6xl px-3 pb-24 pt-4 sm:px-5 sm:pt-7">
      <Link href="/explore" className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/70 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-pink-500/40 hover:text-pink-400 sm:mb-5 sm:px-3 sm:py-2 sm:text-sm">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Explore
      </Link>

      <header className="mb-4 overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-br from-pink-500/10 via-card/70 to-purple-500/10 p-3.5 sm:mb-6 sm:rounded-3xl sm:p-7">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pink-500/15 text-pink-400 sm:h-12 sm:w-12 sm:rounded-2xl"><Grid3x3 className="h-5 w-5 sm:h-6 sm:w-6" /></div>
          <div className="min-w-0 flex-1">
            <p className="mb-0.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-pink-400 sm:text-xs"><TrendingUp className="h-3.5 w-3.5" /> Explore</p>
            <h1 className="text-lg font-extrabold leading-tight tracking-tight sm:text-3xl">Posts</h1>
            <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">Photos shared by the SociaLens community</p>
          </div>
        </div>
        <div className="relative mt-3 sm:mt-6">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground sm:left-3.5" />
          <Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search posts..." aria-label="Search posts" className="h-10 rounded-xl border-border/80 bg-background/80 pl-9 pr-9 text-sm focus-visible:ring-pink-500/50 sm:h-12 sm:rounded-2xl sm:pl-10 sm:pr-10" />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear post search" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"><X className="h-4 w-4" /></button>}
        </div>
      </header>

      <section className="overflow-hidden rounded-xl border border-border/80 bg-card/30 p-2.5 sm:rounded-2xl sm:p-4">
        <div className="mb-3 flex items-center justify-between border-b border-border/70 pb-2.5 sm:mb-4 sm:pb-3">
          <h2 className="text-xs font-bold sm:text-sm">{searchTerm ? 'Search results' : 'Posts'}</h2>
        </div>
        {isLoading ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-muted sm:rounded-2xl" />)}</div>
        ) : isError ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">Posts could not be loaded. Please try again.</div>
        ) : posts.length ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
            {posts.filter(post => !hiddenPostIds.includes(post.id)).map(post => (
              <article key={post.id} className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm sm:rounded-2xl">
                <ReelViewer post={post} onNotInterested={id => setHiddenPostIds(previous => [...previous, id])} trigger={<button type="button" aria-label={`Open post by @${post.profiles?.username ?? 'user'}`} className="relative block aspect-[3/4] w-full overflow-hidden bg-muted text-left"><img src={post.media_url!} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.02]" /></button>} />
                <div className="flex min-h-[104px] flex-1 flex-col p-2 sm:min-h-[124px] sm:p-3">
                  <Link href={`/profile/${post.profiles?.username ?? ''}`} className="block truncate text-[11px] font-semibold hover:text-pink-400 sm:text-xs">@{post.profiles?.username ?? 'user'}</Link>
                  {post.content?.trim() && <PostCaption content={post.content} expandMode="dialog" titleClassName="line-clamp-2 text-[11px] leading-snug sm:text-xs" captionClassName="mt-1 text-[10px] text-muted-foreground whitespace-pre-wrap sm:text-[11px]" buttonClassName="mt-1 text-[10px] font-semibold text-pink-400 hover:underline sm:text-[11px]" />}
                  <div className="mt-auto flex items-center gap-3 pt-2 text-[10px] text-muted-foreground sm:text-xs">
                    <span className="inline-flex items-center gap-1"><Heart className="h-3 w-3" />{formatCount(post.likes_count)}</span>
                    <span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" />{formatCount(post.comments_count)}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="px-4 py-14 text-center"><Grid3x3 className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" /><p className="text-sm font-semibold">{searchTerm ? 'No matching photo posts' : 'No photo posts found yet'}</p><p className="mt-1 text-xs text-muted-foreground">{searchTerm ? 'Try another search.' : 'Photos from real posts will appear here.'}</p></div>
        )}
        <InfiniteScrollSentinel onIntersect={fetchNextPage} hasMore={!!hasNextPage} isLoading={isFetchingNextPage} />
        {isFetchingNextPage && <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>}
      </section>
    </main>
  )
}
