'use client'

import { useEffect, useState } from 'react'
import { AtSign, Check, Loader2, Search, X } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { createClient } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/utils/helpers'

export interface MentionPerson {
  id: string
  username: string
  full_name: string | null
  avatar_url: string | null
  is_verified?: boolean
}

interface StoryMentionPickerProps {
  userId: string
  selected: MentionPerson[]
  onClose: () => void
  onConfirm: (people: MentionPerson[]) => void
}

export function StoryMentionPicker({ userId, selected, onClose, onConfirm }: StoryMentionPickerProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MentionPerson[]>([])
  const [picked, setPicked] = useState<MentionPerson[]>(selected)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const term = query.trim().replace(/^@/, '')
    if (term.length < 2) {
      setResults([])
      setLoading(false)
      setError(null)
      return
    }
    let active = true
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const { data, error: searchError } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url, is_verified, is_suspended, search_privacy')
          .ilike('username', `%${term.replace(/[%_,]/g, '')}%`)
          .neq('id', userId)
          .limit(20)
        if (searchError) throw searchError
        const candidates = (data || []) as (MentionPerson & { is_suspended?: boolean; search_privacy?: string })[]
        const visibleCandidates = candidates.filter(person => !person.is_suspended && person.search_privacy !== 'none')
        const ids = visibleCandidates.map(person => person.id)
        if (!ids.length) {
          if (active) setResults([])
          return
        }

        const [{ data: blockedByMe }, { data: blockedMe }, { data: following }, { data: followedBy }, { data: selectedSearch }] = await Promise.all([
          supabase.from('blocks').select('blocked_id').eq('blocker_id', userId).in('blocked_id', ids),
          supabase.from('blocks').select('blocker_id').eq('blocked_id', userId).in('blocker_id', ids),
          supabase.from('follows').select('following_id').eq('follower_id', userId).eq('status', 'accepted').in('following_id', ids),
          supabase.from('follows').select('follower_id').eq('following_id', userId).eq('status', 'accepted').in('follower_id', ids),
          supabase.from('privacy_selected_users').select('owner_id').eq('category', 'search').eq('selected_user_id', userId).in('owner_id', ids),
        ])
        const blocked = new Set([...(blockedByMe || []).map(row => row.blocked_id), ...(blockedMe || []).map(row => row.blocker_id)])
        const follows = new Set((following || []).map(row => row.following_id))
        const followers = new Set((followedBy || []).map(row => row.follower_id))
        const selectedIds = new Set((selectedSearch || []).map(row => row.owner_id))
        const safe = visibleCandidates.filter(person => {
          if (blocked.has(person.id)) return false
          switch (person.search_privacy) {
            case 'followers': return follows.has(person.id)
            case 'following': return followers.has(person.id)
            case 'selected': return selectedIds.has(person.id)
            case 'none': return false
            default: return true
          }
        }).map(({ id, username, full_name, avatar_url, is_verified }) => ({ id, username, full_name, avatar_url, is_verified }))
        if (active) setResults(safe)
      } catch {
        if (active) setError('Could not search users. Please try again.')
      } finally {
        if (active) setLoading(false)
      }
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [query, userId, supabase])

  const toggle = (person: MentionPerson) => setPicked(current =>
    current.some(item => item.id === person.id)
      ? current.filter(item => item.id !== person.id)
      : [...current, person]
  )

  return (
    <div className="fixed inset-0 z-[180] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="story-mention-title" onClick={onClose}>
      <section className="flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-border bg-card text-foreground shadow-2xl sm:rounded-2xl" onClick={event => event.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2"><AtSign className="h-5 w-5 text-pink-500" /><h2 id="story-mention-title" className="font-semibold">Mention people</h2></div>
          <button type="button" onClick={onClose} aria-label="Close mention picker" className="rounded-full p-2 hover:bg-muted"><X className="h-5 w-5" /></button>
        </header>
        <div className="border-b border-border p-3">
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by username…" className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-pink-500/40" />
          </label>
          {picked.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{picked.map(person => <button key={person.id} type="button" onClick={() => toggle(person)} className="flex items-center gap-1.5 rounded-full border border-pink-500/40 bg-pink-500/10 px-2.5 py-1 text-xs"><span>@{person.username}</span><X className="h-3 w-3" /></button>)}</div>}
        </div>
        <div className="min-h-24 flex-1 overflow-y-auto p-2">
          {loading && <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Searching users…</div>}
          {!loading && error && <p role="alert" className="px-3 py-8 text-center text-sm text-red-500">{error}</p>}
          {!loading && !error && query.trim().replace(/^@/, '').length < 2 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">Type at least 2 characters to find people.</p>}
          {!loading && !error && query.trim().replace(/^@/, '').length >= 2 && results.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">No users found.</p>}
          {results.map(person => {
            const isPicked = picked.some(item => item.id === person.id)
            return <button key={person.id} type="button" onClick={() => toggle(person)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500">
              <Avatar className="h-10 w-10"><AvatarImage src={getAvatarUrl(person.avatar_url)} /><AvatarFallback>{person.username.slice(0, 1).toUpperCase()}</AvatarFallback></Avatar>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{person.full_name || person.username}</span><span className="block truncate text-xs text-muted-foreground">@{person.username}</span></span>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${isPicked ? 'border-pink-500 bg-pink-500 text-white' : 'border-border'}`}>{isPicked && <Check className="h-3.5 w-3.5" />}</span>
            </button>
          })}
        </div>
        <footer className="flex gap-2 border-t border-border p-3">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button>
          <button type="button" onClick={() => onConfirm(picked)} className="flex-1 rounded-xl bg-pink-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-pink-600">Add {picked.length ? `(${picked.length})` : 'mentions'}</button>
        </footer>
      </section>
    </div>
  )
}
