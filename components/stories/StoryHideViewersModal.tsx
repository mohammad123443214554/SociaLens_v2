'use client'

import { useEffect, useState } from 'react'
import { X, Search, EyeOff } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { createClient } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/utils/helpers'
import { VerifiedBadge } from '@/components/shared/VerifiedBadge'
import { useHiddenViewers, useToggleHiddenViewer } from '@/lib/hooks/useStories'

interface Person {
  id: string
  username: string
  avatar_url: string | null
  full_name: string | null
  is_verified?: boolean
  verification_type?: 'blue' | 'yellow' | null
}

interface StoryHideViewersModalProps {
  ownerId: string
  onClose: () => void
}

// Reached from a story's 3-dot menu -> "Hide story from...". Whoever gets
// Toggled on here stops seeing ANY of this person's stories, until removed
// From the list again - It isn't tied to a single story.
export function StoryHideViewersModal({ ownerId, onClose }: StoryHideViewersModalProps) {
  const [people, setPeople] = useState<Person[]>([])
  const [search, setSearch] = useState('')
  const supabase = createClient()
  const { data: hidden = [] } = useHiddenViewers(ownerId)
  const toggleHidden = useToggleHiddenViewer()

  useEffect(() => {
    const fetchPeople = async () => {
      const { data: f1 } = await supabase
        .from('follows')
        .select('profiles!follows_follower_id_fkey(id,username,avatar_url,full_name,is_verified,verification_type)')
        .eq('following_id', ownerId).eq('status', 'accepted')
      const { data: f2 } = await supabase
        .from('follows')
        .select('profiles!follows_following_id_fkey(id,username,avatar_url,full_name,is_verified,verification_type)')
        .eq('follower_id', ownerId).eq('status', 'accepted')
      const l1 = (f1 || []).map((d: any) => d.profiles).filter(Boolean)
      const l2 = (f2 || []).map((d: any) => d.profiles).filter(Boolean)
      const merged = [...l1, ...l2.filter((p: Person) => !l1.find((x: Person) => x.id === p.id))]
      setPeople(merged)
    }
    fetchPeople()
  }, [ownerId])

  const hiddenIds = hidden.map((h) => h.hidden_user_id)
  const filtered = people.filter((p) =>
    p.username.toLowerCase().includes(search.toLowerCase()) || (p.full_name || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="fixed inset-0 bg-black/70 z-[130] flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl w-full max-w-sm max-h-[80vh] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg">Hide story from</h3>
            <p className="text-xs text-muted-foreground">They won't see any of your stories</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search people"
              className="w-full bg-muted rounded-lg pl-9 pr-3 py-2 text-sm outline-none"
            />
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No one found.</p>
          ) : (
            filtered.map((p) => {
              const isHidden = hiddenIds.includes(p.id)
              return (
                <button
                  key={p.id}
                  onClick={() => toggleHidden.mutate({ ownerId, hiddenUserId: p.id, hide: !isHidden })}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={getAvatarUrl(p.avatar_url)} />
                    <AvatarFallback>{p.username[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium truncate flex items-center gap-1">
                      {p.username}
                      {p.is_verified && <VerifiedBadge type={p.verification_type} className="text-xs shrink-0" />}
                    </p>
                    {p.full_name && <p className="text-xs text-muted-foreground truncate">{p.full_name}</p>}
                  </div>
                  <div className={`h-6 w-11 rounded-full flex items-center px-0.5 shrink-0 transition-colors ${isHidden ? 'bg-pink-500 justify-end' : 'bg-muted justify-start'}`}>
                    <div className="h-5 w-5 rounded-full bg-white flex items-center justify-center">
                      {isHidden && <EyeOff className="h-3 w-3 text-pink-500" />}
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
