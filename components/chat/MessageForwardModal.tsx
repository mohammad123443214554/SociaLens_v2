'use client'

import { useState, useEffect } from 'react'
import { X, Send, Search, Check } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/hooks/useUser'
import { useForwardMessage, ForwardableMessage } from '@/lib/hooks/useMessageActions'
import { getAvatarUrl } from '@/lib/utils/helpers'
import { VerifiedBadge } from '@/components/shared/VerifiedBadge'

interface MessageForwardModalProps {
  message: ForwardableMessage
  onClose: () => void
}

interface Person {
  id: string
  username: string
  avatar_url: string | null
  full_name: string | null
  is_verified?: boolean
  verification_type?: 'blue' | 'yellow' | null
}

// Same followers+following multi-select picker used for sharing an
// Aperonix reply, Reused here to forward an existing chat message.
export function MessageForwardModal({ message, onClose }: MessageForwardModalProps) {
  const { user } = useUser()
  const [people, setPeople] = useState<Person[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [sent, setSent] = useState(false)
  const supabase = createClient()
  const forwardMessage = useForwardMessage()

  useEffect(() => {
    const fetchPeople = async () => {
      if (!user) return
      const { data: f1 } = await supabase
        .from('follows')
        .select('profiles!follows_following_id_fkey(id,username,avatar_url,full_name,is_verified,verification_type)')
        .eq('follower_id', user.id).eq('status', 'accepted')
      const { data: f2 } = await supabase
        .from('follows')
        .select('profiles!follows_follower_id_fkey(id,username,avatar_url,full_name,is_verified,verification_type)')
        .eq('following_id', user.id).eq('status', 'accepted')
      const l1 = (f1 || []).map((d: any) => d.profiles).filter(Boolean)
      const l2 = (f2 || []).map((d: any) => d.profiles).filter(Boolean)
      const merged = [...l1, ...l2.filter((p: Person) => !l1.find((x: Person) => x.id === p.id))]
      setPeople(merged)
    }
    fetchPeople()
  }, [user])

  const handleSend = async () => {
    if (!user || selected.length === 0) return
    await forwardMessage.mutateAsync({ message, senderId: user.id, recipientIds: selected })
    setSent(true)
    setTimeout(onClose, 1200)
  }

  // What the little preview strip at the top of this modal shows - a real
  // label for media/posts/reels/stickers instead of showing nothing (or the
  // Raw caption) when there's no plain text content.
  const previewLabel =
    message.sticker ? message.sticker
    : message.post_id ? '📷 Shared post'
    : message.story_id ? '⭐ Shared story'
    : message.media_type === 'video' ? '🎬 Video'
    : message.media_type === 'image' ? '📷 Photo'
    : message.media_type === 'audio' ? '🎤 Voice message'
    : message.content

  const filtered = people.filter(p =>
    p.username.toLowerCase().includes(search.toLowerCase()) ||
    (p.full_name || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="fixed inset-0 bg-black/80 z-[110] flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="font-bold text-base">Forward message</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>

        <div className="px-4 py-2 border-b bg-muted/30">
          <p className="text-xs text-muted-foreground truncate">{previewLabel}</p>
        </div>

        <div className="px-4 py-2 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search people..."
              className="w-full bg-muted rounded-full pl-8 pr-3 py-1.5 text-sm outline-none" />
          </div>
        </div>

        <div className="max-h-56 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted-foreground">No followers/following found</p>
          ) : filtered.map(person => (
            <button key={person.id} onClick={() => setSelected(prev =>
              prev.includes(person.id) ? prev.filter(s => s !== person.id) : [...prev, person.id]
            )}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors text-left">
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarImage src={getAvatarUrl(person.avatar_url)} />
                <AvatarFallback>{person.username?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate flex items-center gap-1">
                  {person.username}
                  {person.is_verified && <VerifiedBadge type={person.verification_type} className="text-xs shrink-0" />}
                </p>
                {person.full_name && <p className="text-xs text-muted-foreground truncate">{person.full_name}</p>}
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                selected.includes(person.id) ? 'bg-pink-500 border-pink-500' : 'border-muted-foreground'}`}>
                {selected.includes(person.id) && <Check className="h-3 w-3 text-white" />}
              </div>
            </button>
          ))}
        </div>

        <div className="p-4 border-t">
          {sent ? (
            <div className="w-full py-3 bg-green-500 text-white rounded-xl text-center font-semibold">✓ Forwarded!</div>
          ) : (
            <button onClick={handleSend} disabled={selected.length === 0 || forwardMessage.isPending}
              className="w-full py-3 rounded-xl font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, #ec4899, #a855f7)' }}>
              <Send className="h-4 w-4" />
              {forwardMessage.isPending ? 'Sending...' : `Forward${selected.length > 0 ? ` (${selected.length})` : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
