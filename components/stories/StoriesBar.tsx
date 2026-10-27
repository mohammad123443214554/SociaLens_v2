'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Plus } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getAvatarUrl } from '@/lib/utils/helpers'
import { useActiveStories } from '@/lib/hooks/useStories'
import { useUser } from '@/lib/hooks/useUser'
import { AdStorySlot } from '@/components/ads/AdStorySlot'
import { AdStoryViewer } from '@/components/ads/AdStoryViewer'
import { interleaveAds } from '@/lib/utils/adInsertion'

// StoriesBar renders on the Feed page, which is the very first thing
// most people see. CreateStoryModal alone transitively pulls in the
// Photo/Video/Text story editors (music picker, font picker, filters -
// well over 2,000 lines combined) and StoryViewer is another ~800 -
// none of that should be part of Feed's initial bundle when most visits
// never open either of them. Loaded on demand instead, the moment
// someone actually taps "Your Story" or a story ring.
const StoryViewer = dynamic(() => import('./StoryViewer').then(m => m.StoryViewer), { ssr: false })

export function StoriesBar() {
  const { user, profile } = useUser()
  const router = useRouter()
  const { data: groups = [] } = useActiveStories(user?.id)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [viewerStoryIndex, setViewerStoryIndex] = useState(0)
  const [showAdStory, setShowAdStory] = useState(false)

  // Whether the ad story we're showing was reached by finishing (or
  // tapping past) the very last real story, rather than by tapping the
  // sponsored ring directly - only then does a back-tap on it make sense
  // (there's a real story to return to).
  const [adFromChain, setAdFromChain] = useState(false)

  // Keep a directly opened story addressable after refresh. The viewer writes
  // its current story ID to ?story=..., and this restores the matching group
  // once the active-story query has loaded.
  useEffect(() => {
    const storyId = new URLSearchParams(window.location.search).get('story')
    if (!storyId || groups.length === 0) return
    const groupIndex = groups.findIndex((candidate) => candidate.stories.some((item) => item.id === storyId))
    if (groupIndex < 0) return
    const storyIndex = groups[groupIndex].stories.findIndex((item) => item.id === storyId)
    setViewerStoryIndex(storyIndex >= 0 ? storyIndex : 0)
    setViewerIndex(groupIndex)
  }, [groups])

  const closeStoryViewer = () => {
    setViewerIndex(null)
    const url = new URL(window.location.href)
    url.searchParams.delete('story')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }

  const myGroup = groups.find((g) => g.userId === user?.id)
  const otherGroups = useMemo(() => groups.filter((g) => g.userId !== user?.id), [groups, user?.id])

  // Randomized gaps (3-5 real stories apart), and always one more right
  // at the end of the row - the one fixed rule, everything else varies.
  const otherItems = useMemo(() => {
    const withRandomAds = interleaveAds(otherGroups, 3, 5)
    if (withRandomAds.length === 0 || withRandomAds[withRandomAds.length - 1] !== 'ad') {
      withRandomAds.push('ad')
    }
    return withRandomAds
  }, [otherGroups])

  // Finishing (or tapping past) the very last story of the very last
  // group now chains into the trailing sponsored story instead of just
  // closing the viewer - so people actually reach it in the normal
  // scroll-through-stories flow, not only by tapping the ring directly.
  const handleReachEndOfStories = () => {
    closeStoryViewer()
    setAdFromChain(true)
    setShowAdStory(true)
  }

  // Tapping back (left side) on a chained-in ad story returns to exactly
  // where the person left off - the last story of the last group.
  const handleAdGoBack = () => {
    setShowAdStory(false)
    setAdFromChain(false)
    const lastGroup = groups[groups.length - 1]
    setViewerIndex(groups.length - 1)
    setViewerStoryIndex(lastGroup ? lastGroup.stories.length - 1 : 0)
  }

  if (!profile) return null

  return (
    <div className="mx-0 mt-4 mb-3 min-w-0 rounded-2xl border border-border/70 bg-card p-3 shadow-sm sm:p-4">
      <div className="flex min-w-0 gap-4 overflow-x-auto pb-1 scrollbar-hide">
        {/* Separate Add Story bubble */}
        <button
          onClick={() => router.push('/story/create')}
          className="flex w-16 shrink-0 flex-col items-center gap-1"
          aria-label="Add a story"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-border bg-muted/40">
            <Plus className="h-6 w-6 text-pink-500" />
          </div>
          <span className="w-full truncate text-center text-[11px] text-muted-foreground">Add Story</span>
        </button>

        {/* Your existing story appears in its own circle beside Add Story */}
        {myGroup && (
          <button
            key={myGroup.userId}
            onClick={() => {
              setViewerStoryIndex(0)
              setViewerIndex(groups.indexOf(myGroup))
            }}
            className="flex w-16 shrink-0 flex-col items-center gap-1"
          >
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-pink-500 via-purple-500 to-cyan-500 p-[2px]">
              <Avatar className="h-full w-full border-2 border-background">
                <AvatarImage src={getAvatarUrl(myGroup.profile?.avatar_url)} />
                <AvatarFallback>{myGroup.profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
            </div>
            <span className="w-full truncate text-center text-[11px] text-muted-foreground">Your Story</span>
          </button>
        )}

        {/* Friends' stories, with sponsored rings mixed in at random gaps */}
        {otherItems.map((item, index) => {
          if (item === 'ad') {
            return <AdStorySlot key={`ad-${index}`} onClick={() => setShowAdStory(true)} />
          }
          return (
            <button
              key={item.userId}
              onClick={() => {
                setViewerStoryIndex(0)
                setViewerIndex(groups.indexOf(item))
              }}
              className="flex w-16 shrink-0 flex-col items-center gap-1"
            >
              <div className="h-16 w-16 rounded-full bg-gradient-to-br from-pink-500 via-purple-500 to-cyan-500 p-[2px]">
                <Avatar className="h-full w-full border-2 border-background">
                  <AvatarImage src={getAvatarUrl(item.profile?.avatar_url)} />
                  <AvatarFallback>{item.profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
              </div>
              <span className="w-full truncate text-center text-[11px] text-muted-foreground">{item.profile?.username}</span>
            </button>
          )
        })}
      </div>


      {viewerIndex !== null && (
        <StoryViewer
          groups={groups}
          startGroupIndex={viewerIndex}
          startStoryIndex={viewerStoryIndex}
          currentUserId={user?.id}
          onClose={closeStoryViewer}
          onReachEnd={handleReachEndOfStories}
        />
      )}

      {showAdStory && (
        <AdStoryViewer
          onClose={() => { setShowAdStory(false); setAdFromChain(false) }}
          onGoBack={adFromChain ? handleAdGoBack : undefined}
        />
      )}

    </div>
  )
}
