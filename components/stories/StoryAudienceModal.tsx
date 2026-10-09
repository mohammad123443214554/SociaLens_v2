'use client'

import { useEffect, useState } from 'react'
import { Globe, Users, UserCheck, ListChecks, Check, Search, Loader2 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { createClient } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/utils/helpers'
import { VerifiedBadge } from '@/components/shared/VerifiedBadge'
import type { StoryVisibility } from '@/lib/types/database.types'

interface Person {
  id: string
  username: string
  avatar_url: string | null
  full_name: string | null
  is_verified?: boolean
  verification_type?: 'blue' | 'yellow' | null
}

interface StoryAudienceModalProps {
  userId: string
  isPending?: boolean
  confirmLabel?: string
  onClose: () => void
  onConfirm: (visibility: StoryVisibility, selectedIds: string[]) => void
}

const OPTIONS: { value: StoryVisibility; label: string; sub: string; icon: typeof Globe }[] = [
  { value: 'everyone', label: 'Everyone', sub: 'Anyone on SociaLens can view this story', icon: Globe },
  { value: 'followers', label: 'Followers', sub: 'Only people who follow you', icon: Users },
  { value: 'following', label: 'Following', sub: 'Only people you follow', icon: UserCheck },
  { value: 'selected', label: 'Selected people', sub: 'Choose exactly who can see it', icon: ListChecks },
]

// Shown right before a text/photo/video story is posted - Picks who the
// Story is visible to. "Selected people" opens a follower/following search
// List, same idea as Instagram's Close Friends / hide-from picker.
export function StoryAudienceModal({ userId, isPending, confirmLabel, onClose, onConfirm }: StoryAudienceModalProps) {
  const [visibility, setVisibility] = useState<StoryVisibility>('everyone')
  const [people, setPeople] = useState<Person[]>([])
  const [loadingPeople, setLoadingPeople] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const supabase = createClient()

  useEffect(() => {
    if (visibility !== 'selected' || people.length > 0) return
    const fetchPeople = async () => {
      setLoadingPeople(true)
      const { data: f1 } = await supabase
        .from('follows')
        .select('profiles!follows_following_id_fkey(id,username,avatar_url,full_name,is_verified,verification_type)')
        .eq('follower_id', userId).eq('status', 'accepted')
      const { data: f2 } = await supabase
        .from('follows')
        .select('profiles!follows_follower_id_fkey(id,username,avatar_url,full_name,is_verified,verification_type)')
        .eq('following_id', userId).eq('status', 'accepted')
      const l1 = (f1 || []).map((d: any) => d.profiles).filter(Boolean)
      const l2 = (f2 || []).map((d: any) => d.profiles).filter(Boolean)
      const merged = [...l1, ...l2.filter((p: Person) => !l1.find((l: Person) => l.id === p.id))]
      setPeople(merged)
      setLoadingPeople(false)
    }
    fetchPeople()
  }, [visibility])

  const toggleSelected = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const filteredPeople = people.filter((p) =>
    p.username.toLowerCase().includes(search.toLowerCase()) || (p.full_name || '').toLowerCase().includes(search.toLowerCase())
  )

  const canConfirm = visibility !== 'selected' || selected.length > 0

  return (
    <div className="fixed inset-0 bg-black/70 z-[130] flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl w-full max-w-sm max-h-[80vh] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="font-bold text-lg">Who can see your story?</h3>
        </div>


        <div className="overflow-y-auto flex-1">
          <div className="p-2">
            {OPTIONS.map((opt) => {
              const Icon = opt.icon
              const active = visibility === opt.value
              return (
                <button
                  key={opt.value}
                  onClick={() => setVisibility(opt.value)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors ${
                    active ? 'bg-pink-500/10' : 'hover:bg-muted'
                  }`}
                >
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${active ? 'bg-pink-500 text-white' : 'bg-muted text-muted-foreground'}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{opt.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{opt.sub}</p>
                  </div>
                  {active && <Check className="h-5 w-5 text-pink-500 shrink-0" />}
                </button>
              )
            })}
          </div>

          {visibility === 'selected' && (
            <div className="border-t border-border p-3 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search people"
                  className="w-full bg-muted rounded-lg pl-9 pr-3 py-2 text-sm outline-none"
                />
              </div>

              {loadingPeople ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredPeople.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No one to show here yet.</p>
              ) : (
                <div className="space-y-1 max-h-56 overflow-y-auto">
                  {filteredPeople.map((p) => {
                    const isSel = selected.includes(p.id)
                    return (
                      <button
                        key={p.id}
                        onClick={() => toggleSelected(p.id)}
                        className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors"
                      >
                        <Avatar className="h-9 w-9">
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
                        <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ${isSel ? 'bg-pink-500 border-pink-500' : 'border-muted-foreground'}`}>
                          {isSel && <Check className="h-3 w-3 text-white" />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-3 border-t border-border flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-muted-foreground font-medium hover:bg-muted transition-colors">
            Cancel
          </button>
          <button
            onClick={() => canConfirm && !isPending && onConfirm(visibility, selected)}
            disabled={!canConfirm || isPending}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (confirmLabel || 'Share to Story')}
          </button>
        </div>
      </div>
    </div>
  )
}
