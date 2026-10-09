'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { resolveBackgroundCss, getTextFillStyle } from '@/lib/utils/storyStyle'
import type { Story } from '@/lib/types/database.types'

interface SharedStoryMessageProps {
  storyId: string
  content: string
  isOwn: boolean
}

// Renders a "Replied to your story" chat bubble - the small story preview
// on top, the actual typed reply underneath, same layout as Instagram.
// Stories expire after 24h, so the story itself may be gone by the time
// This message is read - that's handled gracefully below.
export function SharedStoryMessage({ storyId, content, isOwn }: SharedStoryMessageProps) {
  const [story, setStory] = useState<Story | null | undefined>(undefined)
  const supabase = createClient()

  useEffect(() => {
    let active = true
    supabase.from('stories').select('*').eq('id', storyId).maybeSingle().then(({ data }) => {
      if (active) setStory(data as Story | null)
    })
    return () => { active = false }
  }, [storyId])

  return (
    <div className={`flex flex-col gap-1 max-w-[75%] ${isOwn ? 'items-end' : 'items-start'}`}>
      <div className="rounded-xl overflow-hidden border border-border w-32">
        {story === undefined ? (
          <div className="h-44 bg-muted animate-pulse" />
        ) : story === null ? (
          <div className="h-20 bg-muted flex items-center justify-center p-2">
            <p className="text-[11px] text-muted-foreground text-center">Story no longer available</p>
          </div>
        ) : story.story_type === 'photo' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={story.media_url || ''} alt="Story" className="w-32 h-44 object-cover" />
        ) : story.story_type === 'video' ? (
          <video src={story.media_url || ''} className="w-32 h-44 object-cover" muted />
        ) : (
          <div
            className="w-32 h-44 flex items-center justify-center p-2"
            style={{ background: resolveBackgroundCss(story.background_color) }}
          >
            <p
              className="text-[11px] text-center font-medium line-clamp-5"
              style={getTextFillStyle(story.text_color)}
            >
              {story.text_content}
            </p>
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground px-1">
        {isOwn ? 'You replied to their story' : 'Replied to your story'}
      </p>
      <div className={`px-3 py-2 rounded-2xl text-sm ${isOwn ? 'bg-pink-500 text-white' : 'bg-muted'}`}>
        {content}
      </div>
    </div>
  )
}
