'use client'

import { useState, useMemo } from 'react'
import { Search, Users, Grid3x3, Hash, X, AlertCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { PostCard } from '@/components/feed/PostCard'
import { PostSkeleton } from '@/components/feed/PostSkeleton'
import { AdPostSlot } from '@/components/ads/AdPostSlot'
import { interleaveAds, dedupeById } from '@/lib/utils/adInsertion'
import { useExplorePosts } from '@/lib/hooks/usePosts'
import { useUser } from '@/lib/hooks/useUser'
import { createClient } from '@/lib/supabase/client'
import { useQuery } from '@tanstack/react-query'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getAvatarUrl, formatCount } from '@/lib/utils/helpers'
import Link from 'next/link'
import { Profile, PostWithProfile } from '@/lib/types/database.types'
import { cn } from '@/lib/utils/helpers'
import { VerifiedBadge } from '@/components/shared/VerifiedBadge'
import { InfiniteScrollSentinel } from '@/components/shared/InfiniteScrollSentinel'

type Tab = 'all' | 'profiles' | 'posts' | 'hashtags'
const POST_SELECT = '*, profiles!posts_user_id_fkey(*)'

function extractHashtags(content: string): string[] {
  return content.match(/#[\w\u0600-\u06FF]+/g) || []
}

export default function ExplorePage() {
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('all')
  const [selectedHashtag, setSelectedHashtag] = useState<string | null>(null)
  const { user } = useUser()
  const {
    data: explorePages,
    isLoading: postsLoading,
    isError: postsError,
    error: exploreError,
    fetchNextPage: fetchNextExplorePage,
    hasNextPage: hasMoreExplore,
    isFetchingNextPage: isFetchingMoreExplore,
  } = useExplorePosts(user?.id)
  const posts = explorePages?.pages.flatMap(page => page.posts) ?? []
  const exploreItems = useMemo(() => interleaveAds(dedupeById(posts), 3, 8), [posts])
  const supabase = createClient()

  const { data: searchProfiles = [] } = useQuery({
    queryKey: ['search-profiles', query, user?.id],
    queryFn: async () => {
      if (!query.trim()) return []
      const { data, error } = await supabase.from('profiles').select('*').ilike('username', `%${query}%`).limit(20)
      if (error) throw error
      const candidates = (data as Profile[]) || []
      if (!user) return candidates.filter(p => p.search_privacy === 'everyone').slice(0, 10)

      const ids = candidates.map(p => p.id)
      const [{ data: iFollow }, { data: followMe }, { data: selectedMe }, { data: blockRows }] = await Promise.all([
        supabase.from('follows').select('following_id').eq('follower_id', user.id).eq('status', 'accepted').in('following_id', ids),
        supabase.from('follows').select('follower_id').eq('following_id', user.id).eq('status', 'accepted').in('follower_id', ids),
        supabase.from('privacy_selected_users').select('owner_id').eq('category', 'search').eq('selected_user_id', user.id).in('owner_id', ids),
        supabase.from('blocks').select('blocker_id, blocked_id').or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`),
      ])
      const iFollowSet = new Set((iFollow || []).map((r: any) => r.following_id))
      const followsMeSet = new Set((followMe || []).map((r: any) => r.follower_id))
      const selectedMeSet = new Set((selectedMe || []).map((r: any) => r.owner_id))
      // Anyone on either side of a block with me never shows up in search,
      // Regardless of their search_privacy setting.
      const blockedRelationSet = new Set(
        (blockRows || []).flatMap((b: any) => [b.blocker_id, b.blocked_id]).filter((id: string) => id !== user.id)
      )

      const visible = candidates.filter(p => {
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
      })
      return visible.slice(0, 10)
    },
    enabled: query.length > 1,
  })

  const { data: searchPosts = [] } = useQuery({
    queryKey: ['search-posts', query],
    queryFn: async () => {
      if (!query.trim()) return []
      const { data, error } = await supabase.from('posts').select(POST_SELECT).ilike('content', `%${query}%`).order('created_at', { ascending: false }).limit(20)
      if (error) throw error
      return (data || []) as PostWithProfile[]
    },
    enabled: query.length > 1,
  })

  const { data: searchHashtags = [] } = useQuery({
    queryKey: ['search-hashtags', query],
    queryFn: async () => {
      if (!query.trim()) return []
      const tag = query.startsWith('#') ? query : `#${query}`
      const { data, error } = await supabase.from('posts').select('content').ilike('content', `%${tag}%`)
      if (error) throw error
      const counts: Record<string, number> = {}
      ;(data || []).forEach(p => {
        extractHashtags(p.content || '').forEach(t => {
          if (t.toLowerCase().includes(query.toLowerCase().replace('#', ''))) counts[t] = (counts[t] || 0) + 1
        })
      })
      return Object.entries(counts).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count).slice(0, 20)
    },
    enabled: query.length > 1,
  })

  const { data: hashtagPosts = [], isLoading: hashtagLoading } = useQuery({
    queryKey: ['hashtag-posts', selectedHashtag],
    queryFn: async () => {
      if (!selectedHashtag) return []
      const { data, error } = await supabase.from('posts').select(POST_SELECT).ilike('content', `%${selectedHashtag}%`).order('likes_count', { ascending: false })
      if (error) throw error
      return (data || []) as PostWithProfile[]
    },
    enabled: !!selectedHashtag,
  })

  const { data: popularHashtags = [] } = useQuery({
    queryKey: ['popular-hashtags'],
    queryFn: async () => {
      const { data } = await supabase.from('posts').select('content').limit(200)
      const counts: Record<string, number> = {}
      ;(data || []).forEach(p => extractHashtags(p.content || '').forEach(t => { counts[t] = (counts[t] || 0) + 1 }))
      return Object.entries(counts).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count).slice(0, 3)
    },
  })

  const isSearching = query.length > 1
  const searchItems = useMemo(() => interleaveAds(dedupeById(searchPosts), 3, 8), [searchPosts])

  if (selectedHashtag) {
    return (
      <div className="max-w-xl mx-auto">
        <div className="sticky top-14 z-10 bg-background border-b px-4 py-3 flex items-center gap-3">
          <button onClick={() => setSelectedHashtag(null)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
          <div>
            <h2 className="font-bold text-lg text-pink-500">{selectedHashtag}</h2>
            <p className="text-xs text-muted-foreground">{hashtagPosts.length} posts</p>
          </div>
        </div>
        {hashtagLoading ? Array.from({ length: 3 }).map((_, i) => <PostSkeleton key={i} />) :
          hashtagPosts.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground"><Hash className="h-12 w-12 mx-auto mb-3 opacity-30" /><p>No posts with {selectedHashtag}</p></div>
          ) : hashtagPosts.map(post => <PostCard key={post.id} post={post} />)
        }
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="sticky top-14 z-10 bg-background px-4 py-3 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search profiles, posts, #hashtags..." value={query} onChange={e => setQuery(e.target.value)} className="pl-9 pr-9" />
          {query && <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="h-4 w-4" /></button>}
        </div>
        {isSearching && (
          <div className="flex gap-1 mt-3">
            {[{ id: 'all', label: 'All' }, { id: 'profiles', label: `People (${searchProfiles.length})` }, { id: 'posts', label: `Posts (${searchPosts.length})` }, { id: 'hashtags', label: `Tags (${searchHashtags.length})` }].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as Tab)} className={cn('flex-1 py-1.5 px-1 rounded-lg text-xs font-semibold transition-all', activeTab === tab.id ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white' : 'bg-muted text-muted-foreground')}>
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {isSearching ? (
        <div className="pb-20">
          {(activeTab === 'all' || activeTab === 'profiles') && searchProfiles.length > 0 && (
            <div className="p-4">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> People</h3>
              {searchProfiles.map(profile => (
                <Link key={profile.id} href={`/profile/${profile.username}`} className="flex items-center gap-3 p-3 rounded-xl hover:bg-accent transition-colors">
                  <Avatar className="h-11 w-11">
                    <AvatarImage src={getAvatarUrl(profile.avatar_url)} />
                    <AvatarFallback className="bg-gradient-to-br from-pink-500 to-purple-500 text-white font-bold">{profile.username?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm flex items-center gap-1">
                      {profile.username}
                      {profile.is_verified && <VerifiedBadge type={profile.verification_type} className="text-xs" />}
                    </p>
                    {profile.full_name && <p className="text-xs text-muted-foreground">{profile.full_name}</p>}
                  </div>
                  <p className="text-xs text-muted-foreground shrink-0">{formatCount(profile.followers_count)} followers</p>
                </Link>
              ))}
            </div>
          )}
          {(activeTab === 'all' || activeTab === 'hashtags') && searchHashtags.length > 0 && (
            <div className="px-4 pb-4">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5"><Hash className="h-3.5 w-3.5" /> Hashtags</h3>
              {searchHashtags.map(({ tag, count }) => (
                <button key={tag} onClick={() => setSelectedHashtag(tag)} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-accent transition-colors text-left">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500/20 to-purple-500/20 flex items-center justify-center shrink-0"><Hash className="h-5 w-5 text-pink-500" /></div>
                  <div className="flex-1"><p className="font-semibold text-sm text-pink-500">{tag}</p><p className="text-xs text-muted-foreground">{count} posts</p></div>
                  <span className="text-xs text-muted-foreground">→</span>
                </button>
              ))}
            </div>
          )}
          {(activeTab === 'all' || activeTab === 'posts') && searchPosts.length > 0 && (
            <div>
              <div className="px-4 pb-2"><h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><Grid3x3 className="h-3.5 w-3.5" /> Posts</h3></div>
              {searchItems.map((item, i) => item === 'ad' ? <AdPostSlot key={`ad-${i}`} /> : <PostCard key={item.id} post={item} />)}
            </div>
          )}
          {!searchProfiles.length && !searchPosts.length && !searchHashtags.length && (
            <div className="text-center py-16 text-muted-foreground"><Search className="h-12 w-12 mx-auto mb-3 opacity-30" /><p className="font-semibold">No results for "{query}"</p><p className="text-sm mt-1">Try different keywords</p></div>
          )}
        </div>
      ) : (
        <div className="pb-20">
          {popularHashtags.length > 0 && (
            <div className="px-4 pt-4 pb-4">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5"><Hash className="h-3.5 w-3.5" /> Trending Hashtags</h3>
              <div className="flex flex-wrap gap-2">
                {popularHashtags.map(({ tag, count }) => (
                  <button key={tag} onClick={() => setSelectedHashtag(tag)} className="flex items-center gap-1.5 bg-muted hover:bg-pink-500/10 hover:text-pink-500 border hover:border-pink-500/30 rounded-full px-3 py-1.5 text-sm transition-all"><span className="text-pink-500 font-medium">{tag}</span><span className="text-xs text-muted-foreground bg-background/50 rounded-full px-1.5">{count}</span></button>
                ))}
              </div>
            </div>
          )}
          <div className="px-4 pb-2"><h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5"><Grid3x3 className="h-3.5 w-3.5" /> Trending Posts</h3></div>
          {postsLoading ? Array.from({ length: 3 }).map((_, i) => <PostSkeleton key={i} />) : postsError ? (
            <div className="mx-4 mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <div className="flex items-start gap-2 text-destructive"><AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /><div><p className="font-semibold">Posts could not be loaded</p><p className="mt-1 opacity-80">{exploreError instanceof Error ? exploreError.message : 'Please refresh and try again.'}</p></div></div>
            </div>
          ) : posts.length > 0 ? exploreItems.map((item, i) => item === 'ad' ? <AdPostSlot key={`ad-${i}`} /> : <PostCard key={item.id} post={item} />) : (
            <div className="text-center py-12 text-muted-foreground"><Grid3x3 className="h-12 w-12 mx-auto mb-3 opacity-30" /><p>No posts to show right now</p></div>
          )}
          <InfiniteScrollSentinel onIntersect={fetchNextExplorePage} hasMore={!!hasMoreExplore} isLoading={isFetchingMoreExplore} />
        </div>
      )}
    </div>
  )
}
