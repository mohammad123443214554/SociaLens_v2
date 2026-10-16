'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import {
  Search, Users, Grid3x3, Hash, X, AlertCircle, Play,
  Image as ImageIcon, ArrowUpRight, Heart, MessageCircle,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { PostCard } from '@/components/feed/PostCard'
import { PostSkeleton } from '@/components/feed/PostSkeleton'
import { AdPostSlot } from '@/components/ads/AdPostSlot'
import { interleaveAds, dedupeById } from '@/lib/utils/adInsertion'
import { useExplorePosts } from '@/lib/hooks/usePosts'
import { useUser } from '@/lib/hooks/useUser'
import { createClient } from '@/lib/supabase/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getAvatarUrl, formatCount, cn } from '@/lib/utils/helpers'
import { Profile, PostWithProfile } from '@/lib/types/database.types'
import { VerifiedBadge } from '@/components/shared/VerifiedBadge'
import { InfiniteScrollSentinel } from '@/components/shared/InfiniteScrollSentinel'
import { PostCaption } from '@/components/shared/PostCaption'
import { ReelViewer } from '@/components/shared/ReelViewer'
import { getViewerContext } from '@/lib/recommendation/viewerContext'
import { rankFeedPosts } from '@/lib/recommendation/rankFeedPosts'
import { rankReels } from '@/lib/recommendation/rankReels'

type Tab = 'all' | 'profiles' | 'posts' | 'hashtags'
const POST_SELECT = '*, profiles!posts_user_id_fkey(*)'

function extractHashtags(content: string): string[] {
  return content.match(/#[\w\u0600-\u06FF]+/g) || []
}

/** Group hashtag spellings case-insensitively while keeping a real spelling for display. */
function countHashtags(contents: string[]) {
  const counts = new Map<string, { tag: string; count: number }>()
  contents.forEach(content => {
    extractHashtags(content || '').forEach(tag => {
      const key = tag.toLocaleLowerCase()
      const existing = counts.get(key)
      if (existing) existing.count += 1
      else counts.set(key, { tag, count: 1 })
    })
  })
  return Array.from(counts.values()).sort((a, b) => b.count - a.count)
}

function ReelsMark({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className} fill="none">
      <rect x="4" y="7" width="24" height="21" rx="6" stroke="currentColor" strokeWidth="2.2" />
      <path d="M9 7 13 3M17 7l4-4M5 13h22" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="m14 16 6 3.5-6 3.5V16Z" fill="currentColor" stroke="currentColor" strokeLinejoin="round" />
    </svg>
  )
}

function SectionHeading({ icon, title, subtitle, action }: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pink-500/15 text-pink-400 [&_svg]:h-5 [&_svg]:w-5">{icon}</span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold tracking-wide text-foreground sm:text-base">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

export default function ExplorePage() {
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('all')
  const activeSection = 'for-you' as const
  const [selectedHashtag, setSelectedHashtag] = useState<string | null>(null)
  const [hiddenReelIds, setHiddenReelIds] = useState<string[]>([])
  const [hiddenPostIds, setHiddenPostIds] = useState<string[]>([])
  const { user } = useUser()
  const supabase = createClient()

  const {
    data: explorePages, isLoading: postsLoading, isError: postsError, error: exploreError,
    fetchNextPage: fetchNextExplorePage, hasNextPage: hasMoreExplore, isFetchingNextPage: isFetchingMoreExplore,
  } = useExplorePosts(user?.id)

  // Keep using the existing personalized reels pipeline; no ranking code is changed here.
  const posts = explorePages?.pages.flatMap(page => page.posts) ?? []
const exploreItems = useMemo(() => interleaveAds(dedupeById(posts), 3, 8), [posts])
  const isSearching = query.trim().length > 1

  const { data: searchProfiles = [] } = useQuery({
    queryKey: ['search-profiles', query, user?.id],
    queryFn: async () => {
      if (!query.trim()) return []
      const { data, error } = await supabase.from('profiles').select('*').ilike('username', `%${query}%`).limit(20)
      if (error) throw error
      const candidates = (data as Profile[]) || []
      if (!user) return candidates.filter(p => p.search_privacy === 'everyone').slice(0, 10)
      const ids = candidates.map(p => p.id)
      if (!ids.length) return []
      const [{ data: iFollow }, { data: followMe }, { data: selectedMe }, { data: blockRows }] = await Promise.all([
        supabase.from('follows').select('following_id').eq('follower_id', user.id).eq('status', 'accepted').in('following_id', ids),
        supabase.from('follows').select('follower_id').eq('following_id', user.id).eq('status', 'accepted').in('follower_id', ids),
        supabase.from('privacy_selected_users').select('owner_id').eq('category', 'search').eq('selected_user_id', user.id).in('owner_id', ids),
        supabase.from('blocks').select('blocker_id, blocked_id').or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`),
      ])
      const iFollowSet = new Set((iFollow || []).map((r: any) => r.following_id))
      const followsMeSet = new Set((followMe || []).map((r: any) => r.follower_id))
      const selectedMeSet = new Set((selectedMe || []).map((r: any) => r.owner_id))
      const blockedRelationSet = new Set((blockRows || []).flatMap((b: any) => [b.blocker_id, b.blocked_id]).filter((id: string) => id !== user.id))
      return candidates.filter(p => {
        if (p.id === user.id) return true
        if (blockedRelationSet.has(p.id)) return false
        switch (p.search_privacy) {
          case 'everyone': return true
          case 'followers': return iFollowSet.has(p.id)
          case 'following': return followsMeSet.has(p.id)
          case 'selected': return selectedMeSet.has(p.id)
          case 'none': return false
          default: return true
        }
      }).slice(0, 10)
    },
    enabled: isSearching,
  })

  const { data: searchPosts = [] } = useQuery({
    queryKey: ['search-posts', query],
    queryFn: async () => {
      if (!query.trim()) return []
      const { data, error } = await supabase.from('posts').select(POST_SELECT).ilike('content', `%${query}%`).order('created_at', { ascending: false }).limit(20)
      if (error) throw error
      return (data || []) as PostWithProfile[]
    },
    enabled: isSearching,
  })

  const { data: searchHashtags = [] } = useQuery({
    queryKey: ['search-hashtags', query],
    queryFn: async () => {
      const needle = query.toLocaleLowerCase().replace(/^#/, '')
      const { data, error } = await supabase.from('posts').select('content').ilike('content', `%#${needle}%`).limit(500)
      if (error) throw error
      return countHashtags((data || []).map(p => p.content || ''))
        .filter(item => item.tag.toLocaleLowerCase().replace(/^#/, '').includes(needle))
        .slice(0, 20)
    },
    enabled: isSearching,
  })

  const { data: hashtagPosts = [], isLoading: hashtagLoading } = useQuery({
    queryKey: ['hashtag-posts', selectedHashtag],
    queryFn: async () => {
      if (!selectedHashtag) return []
      const { data, error } = await supabase.from('posts').select(POST_SELECT).ilike('content', `%${selectedHashtag}%`).order('likes_count', { ascending: false }).limit(100)
      if (error) throw error
      return (data || []) as PostWithProfile[]
    },
    enabled: !!selectedHashtag,
  })

  const { data: popularHashtags = [] } = useQuery({
    queryKey: ['popular-hashtags'],
    queryFn: async () => {
      const { data, error } = await supabase.from('posts').select('content, views_count').order('created_at', { ascending: false }).limit(500)
      if (error) throw error
      const viewTotals = new Map<string, number>()
      const tagCounts = new Map<string, { tag: string; count: number }>()
      ;(data || []).forEach(post => {
        extractHashtags(post.content || '').forEach(tag => {
          const key = tag.toLocaleLowerCase()
          const existing = tagCounts.get(key)
          if (existing) existing.count += 1
          else tagCounts.set(key, { tag, count: 1 })
          viewTotals.set(key, (viewTotals.get(key) || 0) + (Number(post.views_count) || 0))
        })
      })
      return Array.from(tagCounts.values())
        .map(item => ({ ...item, views: viewTotals.get(item.tag.toLocaleLowerCase()) || 0 }))
        .sort((a, b) => b.views - a.views || b.count - a.count)
    },
    staleTime: 60_000,
  })

  const { data: explorePhotoPosts = [], isLoading: photoPostsLoading, isError: photoPostsError } = useQuery({
    queryKey: ['explore-photo-posts-top10', user?.id],
    queryFn: async () => {
      let request = supabase.from('posts').select(POST_SELECT)
        .neq('media_type', 'video').not('media_url', 'is', null)
        .order('likes_count', { ascending: false }).order('created_at', { ascending: false })
      if (user) {
        const { data: hiddenRows, error: hiddenError } = await supabase.from('post_not_interested').select('post_id').eq('user_id', user.id)
        if (hiddenError) throw hiddenError
        const hiddenIds = (hiddenRows || []).map(row => row.post_id)
        if (hiddenIds.length) request = request.not('id', 'in', `(${hiddenIds.join(',')})`)
      }
      const { data, error } = await request.limit(100)
      if (error) throw error
      const candidates = (data || []) as PostWithProfile[]
      try {
        const ctx = await getViewerContext(supabase, user?.id)
        return rankFeedPosts(candidates, ctx).slice(0, 10)
      } catch (err) {
        console.error('Explore photo ranking failed, showing recent candidates', err)
        return candidates.slice(0, 10)
      }
    },
    staleTime: 60_000,
  })
  const { data: topReels = [], isLoading: topReelsLoading, isError: topReelsError } = useQuery({
    queryKey: ['explore-top-reels', user?.id],
    queryFn: async () => {
      let request = supabase.from('posts').select(POST_SELECT)
        .eq('media_type', 'video').not('media_url', 'is', null)
        .order('likes_count', { ascending: false })
      if (user) {
        const { data: hiddenRows, error: hiddenError } = await supabase.from('post_not_interested').select('post_id').eq('user_id', user.id)
        if (hiddenError) throw hiddenError
        const hiddenIds = (hiddenRows || []).map(row => row.post_id)
        if (hiddenIds.length) request = request.not('id', 'in', `(${hiddenIds.join(',')})`)
      }
      const { data, error } = await request.limit(100)
      if (error) throw error
      const candidates = (data || []) as PostWithProfile[]
      try {
        const ctx = await getViewerContext(supabase, user?.id)
        return rankReels(candidates, ctx, 10).slice(0, 10)
      } catch (err) {
        console.error('Explore reel ranking failed, showing recent candidates', err)
        return candidates.slice(0, 10)
      }
    },
    staleTime: 60_000,
  })

  if (selectedHashtag) {
    return (
      <div className="mx-auto w-full max-w-4xl px-3 pb-20 sm:px-5">
        <div className="sticky top-14 z-10 mb-4 flex items-center gap-3 border-b border-border/70 bg-background/95 px-1 py-4 backdrop-blur">
          <button onClick={() => setSelectedHashtag(null)} aria-label="Back to Explore" className="flex h-9 w-9 items-center justify-center rounded-full border border-border hover:bg-accent"><X className="h-4 w-4" /></button>
          <div className="min-w-0 flex-1"><h2 className="truncate text-lg font-bold text-pink-400 sm:text-xl">{selectedHashtag}</h2><p className="text-xs text-muted-foreground">{hashtagPosts.length} posts found</p></div>
        </div>
        {hashtagLoading ? Array.from({ length: 3 }).map((_, i) => <PostSkeleton key={i} />) :
          hashtagPosts.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card px-4 py-16 text-center text-muted-foreground"><Hash className="mx-auto mb-3 h-10 w-10 opacity-40" /><p>No real posts found for {selectedHashtag}</p></div>
          ) : hashtagPosts.map(post => <PostCard key={post.id} post={post} />)
        }
      </div>
    )
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-2.5 pb-20 pt-2.5 sm:px-5 sm:pb-24 sm:pt-5">
      <header className="mb-4 sm:mb-5">
        <div className="mb-3 flex items-center gap-2.5 sm:mb-4 sm:gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-pink-500/15 text-pink-400 sm:h-10 sm:w-10 sm:rounded-2xl"><Search className="h-4 w-4 sm:h-6 sm:w-6" /></div>
          <div className="min-w-0 flex-1"><h1 className="text-lg font-extrabold tracking-tight sm:text-2xl">Explore</h1><p className="text-[11px] leading-snug text-muted-foreground sm:text-sm">Discover real posts, reels and conversations on SociaLens</p></div>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground sm:left-3.5 sm:h-4 sm:w-4" />
          <Input placeholder="Search people, posts, #hashtags..." value={query} onChange={e => setQuery(e.target.value)} className="h-10 rounded-xl border-border/80 bg-card/80 pl-9 pr-9 text-sm shadow-sm focus-visible:ring-pink-500/50 sm:h-12 sm:rounded-2xl sm:pl-10 sm:pr-10" />
          {query && <button onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"><X className="h-4 w-4" /></button>}
        </div>

        {isSearching && (
          <div className="mt-3 flex gap-1 overflow-x-auto rounded-xl border border-border/70 bg-card/60 p-1">
            {[{ id: 'all', label: 'All' }, { id: 'profiles', label: `People (${searchProfiles.length})` }, { id: 'posts', label: `Posts (${searchPosts.length})` }, { id: 'hashtags', label: `Hashtags (${searchHashtags.length})` }].map(tab => <button key={tab.id} onClick={() => setActiveTab(tab.id as Tab)} className={cn('flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-all sm:text-sm', activeTab === tab.id ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white' : 'text-muted-foreground hover:bg-accent')}>{tab.label}</button>)}
          </div>
        )}
      </header>

      {isSearching ? (
        <div className="space-y-5">
          {(activeTab === 'all' || activeTab === 'profiles') && searchProfiles.length > 0 && (
            <section className="rounded-2xl border border-border/70 bg-card/40 p-3 sm:p-4">
              <SectionHeading icon={<Users className="h-4 w-4" />} title="People" subtitle="Profiles matching your search" />
              <div className="grid gap-1 sm:grid-cols-2">
                {searchProfiles.map(profile => <Link key={profile.id} href={`/profile/${profile.username}`} className="flex min-w-0 items-center gap-3 rounded-xl p-3 transition-colors hover:bg-accent/70">
                  <Avatar className="h-11 w-11 shrink-0 ring-1 ring-border"><AvatarImage src={getAvatarUrl(profile.avatar_url)} /><AvatarFallback className="bg-gradient-to-br from-pink-500 to-purple-500 font-bold text-white">{profile.username?.[0]?.toUpperCase()}</AvatarFallback></Avatar>
                  <div className="min-w-0 flex-1"><p className="flex items-center gap-1 truncate text-sm font-semibold">{profile.username}{profile.is_verified && <VerifiedBadge type={profile.verification_type} className="text-xs" />}</p>{profile.full_name && <p className="truncate text-xs text-muted-foreground">{profile.full_name}</p>}</div>
                  <p className="shrink-0 text-xs text-muted-foreground">{formatCount(profile.followers_count)} followers</p>
                </Link>)}
              </div>
            </section>
          )}
          {(activeTab === 'all' || activeTab === 'hashtags') && searchHashtags.length > 0 && (
            <section className="rounded-2xl border border-border/70 bg-card/40 p-3 sm:p-4">
              <SectionHeading icon={<Hash className="h-4 w-4" />} title="Hashtags" subtitle="Capitalization variants are merged" />
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {searchHashtags.map(({ tag, count }) => <button key={tag.toLocaleLowerCase()} onClick={() => setSelectedHashtag(tag)} className="flex min-w-0 items-center gap-3 rounded-xl border border-border/70 bg-background/50 p-3 text-left transition-colors hover:border-pink-500/40 hover:bg-pink-500/5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pink-500/15 text-pink-400"><Hash className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{tag}</span><span className="text-xs text-muted-foreground">{formatCount(count)} posts</span></span><ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>)}
              </div>
            </section>
          )}
          {(activeTab === 'all' || activeTab === 'posts') && searchPosts.length > 0 && (
            <section><SectionHeading icon={<Grid3x3 className="h-4 w-4" />} title="Posts" subtitle="Real posts matching your search" /><div className="grid gap-4 xl:grid-cols-2">{interleaveAds(dedupeById(searchPosts), 3, 8).map((item, i) => item === 'ad' ? <AdPostSlot key={`ad-${i}`} /> : <PostCard key={item.id} post={item} />)}</div></section>
          )}
          {!searchProfiles.length && !searchPosts.length && !searchHashtags.length && <div className="rounded-2xl border border-border/70 bg-card/40 px-4 py-16 text-center text-muted-foreground"><Search className="mx-auto mb-3 h-10 w-10 opacity-40" /><p className="font-semibold">No results for “{query}”</p><p className="mt-1 text-sm">Try a different name, keyword or hashtag.</p></div>}
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-6">
          {(true || false) && (
            <section className="rounded-xl border border-border/70 bg-card/30 p-2.5 sm:rounded-2xl sm:p-4">
              <SectionHeading
                icon={<Hash className="h-4 w-4" />}
                title="Hashtags"
                
                action={<Link href="/explore/hashtags" className="shrink-0 text-xs font-semibold text-pink-400 transition-colors hover:text-fuchsia-400">See All <ArrowUpRight className="ml-1 inline h-3.5 w-3.5" /></Link>}
              />
              {popularHashtags.length ? false ? (
                <div className="max-h-[520px] space-y-1 overflow-y-auto pr-1 [scrollbar-width:thin]">
                  {popularHashtags.map(({ tag, views }) => <button key={tag.toLocaleLowerCase()} onClick={() => setSelectedHashtag(tag)} className="group flex w-full items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/50 px-4 py-3 text-left transition-colors hover:border-pink-500/50 hover:bg-pink-500/5">
                    <span className="min-w-0 truncate text-sm font-semibold text-pink-400 group-hover:text-fuchsia-400">{tag}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatCount(views)} views</span>
                  </button>)}
                </div>
              ) : (
                <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {popularHashtags.slice(0, 10).map(({ tag, views }) => <button key={tag.toLocaleLowerCase()} onClick={() => setSelectedHashtag(tag)} className="group w-[108px] shrink-0 rounded-lg border border-border/80 bg-background/60 px-2.5 py-2.5 text-left transition-all hover:border-pink-500/50 hover:bg-pink-500/5 sm:w-[142px] sm:rounded-xl sm:px-3 sm:py-3">
                    <span className="block truncate text-xs font-bold text-pink-400 group-hover:text-fuchsia-400 sm:text-sm">{tag}</span>
                    <span className="mt-1 block text-[10px] text-muted-foreground sm:text-[11px]">{formatCount(views)} views</span>
                  </button>)}
                </div>
              ) : <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No hashtags found in posts yet.</p>}
            </section>
          )}

          <section className="rounded-xl border border-border/70 bg-card/30 p-2.5 sm:rounded-2xl sm:p-4">
            <SectionHeading icon={<ReelsMark className="h-5 w-5" />} title="Reels" action={<Link href="/explore/reels" className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-pink-400 hover:text-fuchsia-400">See All <ArrowUpRight className="h-3.5 w-3.5" /></Link>} />
            {topReelsLoading ? <div className="flex gap-2 overflow-hidden">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="aspect-[3/4] w-28 shrink-0 animate-pulse rounded-xl bg-muted sm:w-36" />)}</div> :
              topReelsError ? <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Reels could not be loaded. Please try again.</div> :
              topReels.length ? <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {topReels.filter(reel => !hiddenReelIds.includes(reel.id)).map(reel => <article key={reel.id} className="group w-[118px] shrink-0 overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm transition-all hover:border-pink-500/40 sm:w-[160px] sm:rounded-2xl">
                  <ReelViewer post={reel} onNotInterested={id => setHiddenReelIds(previous => [...previous, id])} trigger={<button type="button" aria-label={`Play reel by @${reel.profiles?.username ?? 'user'}`} className="relative block w-full aspect-[3/4] overflow-hidden bg-black text-left"><video src={reel.media_url ?? undefined} muted playsInline preload="metadata" className="pointer-events-none h-full w-full object-cover" aria-label={`Video post by @${reel.profiles?.username ?? 'user'}`} /><span className="pointer-events-none absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/65 px-1.5 py-1 text-[9px] font-semibold text-white"><Play className="h-2.5 w-2.5 fill-current" /> Reel</span></button>} />
                  <div className="p-2 sm:p-2.5"><Link href={`/profile/${reel.profiles?.username ?? ''}`} className="block truncate text-[11px] font-semibold hover:text-pink-400 sm:text-xs">@{reel.profiles?.username ?? 'user'}</Link>{reel.content?.trim() && <PostCaption content={reel.content} expandMode="dialog" titleClassName="text-[11px] leading-snug sm:text-xs" captionClassName="mt-1 text-[10px] text-muted-foreground whitespace-pre-wrap sm:text-[11px]" buttonClassName="mt-1 text-[10px] font-semibold text-pink-400 hover:underline sm:text-[11px]" />}<div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground"><span className="inline-flex items-center gap-1"><Heart className="h-3 w-3" />{formatCount(reel.likes_count)}</span><span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" />{formatCount(reel.comments_count)}</span></div></div>
                </article>)}
              </div> : <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-muted-foreground"><ReelsMark className="mx-auto mb-2 h-8 w-8 opacity-40" /><p className="text-sm font-semibold">No reels available yet</p></div>}
          </section>

          <section className="rounded-xl border border-border/70 bg-card/30 p-2.5 sm:rounded-2xl sm:p-4">
            <SectionHeading icon={<Grid3x3 className="h-4 w-4" />} title="Posts" action={<Link href="/explore/posts" className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-pink-400 hover:text-fuchsia-400">See All <ArrowUpRight className="h-3.5 w-3.5" /></Link>} />
            {photoPostsLoading ? (
              <div className="flex gap-2 overflow-hidden">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="aspect-[3/4] w-[118px] shrink-0 animate-pulse rounded-xl bg-muted sm:w-[160px]" />)}</div>
            ) : photoPostsError ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"><div className="flex items-start gap-2 text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-semibold">Posts could not be loaded</p><p className="mt-1 opacity-80">Please refresh and try again.</p></div></div></div>
            ) : explorePhotoPosts.length > 0 ? (
              <div className="flex items-start gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {explorePhotoPosts.filter(item => !hiddenPostIds.includes(item.id)).slice(0, 10).map(item => (
                  <article key={item.id} className="flex h-[300px] w-[118px] shrink-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm sm:h-[360px] sm:w-[160px] sm:rounded-2xl">
                    <ReelViewer post={item} onNotInterested={id => setHiddenPostIds(previous => [...previous, id])} trigger={<button type="button" aria-label={`Open post by @${item.profiles?.username ?? 'user'}`} className="relative block aspect-[3/4] w-full overflow-hidden bg-black text-left"><img src={item.media_url!} alt="" loading="lazy" className="pointer-events-none h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" /></button>} />
                    <div className="p-2 sm:p-2.5">
                      <Link href={`/profile/${item.profiles?.username ?? ''}`} className="block truncate text-[11px] font-semibold hover:text-pink-400 sm:text-xs">@{item.profiles?.username ?? 'user'}</Link>
                      {item.content?.trim() && <PostCaption content={item.content} expandMode="dialog" titleClassName="line-clamp-2 text-[11px] leading-snug sm:text-xs" captionClassName="mt-1 text-[10px] text-muted-foreground whitespace-pre-wrap sm:text-[11px]" buttonClassName="mt-1 text-[10px] font-semibold text-pink-400 hover:underline sm:text-[11px]" />}
                      <div className="mt-auto flex items-center gap-2 pt-2 text-[10px] text-muted-foreground"><span className="inline-flex items-center gap-1"><Heart className="h-3 w-3" />{formatCount(item.likes_count)}</span><span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" />{formatCount(item.comments_count)}</span></div>
                    </div>
                  </article>
                ))}
              </div>
            ) : <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-muted-foreground"><Grid3x3 className="mx-auto mb-2 h-8 w-8 opacity-40" /><p className="text-sm font-semibold">No photo posts available yet</p></div>}
            <InfiniteScrollSentinel onIntersect={fetchNextExplorePage} hasMore={!!hasMoreExplore && false} isLoading={isFetchingMoreExplore} />
          </section>
          {false && <p className="text-center text-xs text-muted-foreground">Hashtag totals are calculated from real post captions. Capitalization differences are merged.</p>}
        </div>
      )}
    </main>
  )
}
