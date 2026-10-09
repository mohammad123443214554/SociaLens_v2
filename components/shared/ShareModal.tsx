'use client'

import { useState, useEffect } from 'react'
import { X, Send, Search, Check } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/hooks/useUser'
import { getAvatarUrl, getPostPreviewText } from '@/lib/utils/helpers'
import { PostWithProfile } from '@/lib/types/database.types'
import { VerifiedBadge } from '@/components/shared/VerifiedBadge'
import { ExternalShareBar } from '@/components/shared/ExternalShareBar'

interface ShareModalProps {
  post: PostWithProfile
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

export function ShareModal({ post, onClose }: ShareModalProps) {
  const { user } = useUser()
  const [people, setPeople] = useState<Person[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const fetch = async () => {
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
      const merged = [...l1, ...l2.filter((p: Person) => !l1.find((l: Person) => l.id === p.id))]
      setPeople(merged)
    }
    fetch()
  }, [user])

  const handleSend = async () => {
    if (!user || selected.length === 0) return
    setSending(true)
    const isVideo = post.media_type === 'video'
    const msgType = isVideo ? 'reel' : post.media_url ? 'post' : 'text'
    const preview = isVideo ? '🎬 Shared a reel' : '📎 Shared a post'

    for (const receiverId of selected) {
      // Find or create chat
      let chatId: string | null = null
      const { data: existing } = await supabase
        .from('chats')
        .select('id')
        .or(`and(participant1_id.eq.${user.id},participant2_id.eq.${receiverId}),and(participant1_id.eq.${receiverId},participant2_id.eq.${user.id})`)
        .maybeSingle()

      if (existing) {
        chatId = existing.id
      } else {
        const { data: newChat } = await supabase
          .from('chats')
          .insert({ participant1_id: user.id, participant2_id: receiverId })
          .select('id').single()
        chatId = newChat?.id || null
      }

      if (!chatId) continue

      // Insert message With post_id
      await supabase.from('messages').insert({
        chat_id: chatId,
        sender_id: user.id,
        content: preview,
        post_id: post.id,
      })

      // Records the share so shares_count (shown next to the Share button
      // everywhere) actually reflects reality - a database trigger keeps
      // that count in sync with this table automatically.
      await supabase.from('shares').insert({ post_id: post.id, shared_by_id: user.id, shared_to_chat_id: chatId })

      // Update chat last message
      await supabase.from('chats').update({
        last_message: preview,
        last_message_time: new Date().toISOString(),
        last_message_type: msgType,
        last_message_sender_id: user.id,
      }).eq('id', chatId)

      // Note: no manual notification insert here - the database trigger on
      // `messages` INSERT already creates one, respecting the recipient's
      // notify_messages privacy setting. Inserting one here too would create
      // a duplicate notification for every shared post.
    }

    setSent(true)
    setSending(false)
    setTimeout(onClose, 1500)
  }

  const filtered = people.filter(p =>
    p.username.toLowerCase().includes(search.toLowerCase()) ||
    (p.full_name || '').toLowerCase().includes(search.toLowerCase())
  )

  const isVideo = post.media_type === 'video'

  const getExternalShareUrl = async () => {
    // Record this as a real share too (same counter the internal-share
    // path already updates), just with no destination chat.
    if (user) {
      await supabase.from('shares').insert({ post_id: post.id, shared_by_id: user.id, shared_to_chat_id: null })
    }
    return `${window.location.origin}/share/post/${post.id}`
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-[60] flex items-end sm:items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-card border rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="font-bold text-base">Share</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>

        {/* Post preview */}
        <div className="px-4 py-2 border-b bg-muted/30 flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-muted overflow-hidden shrink-0 flex items-center justify-center">
            {post.media_type === 'video' ? <span className="text-lg">🎬</span>
              : post.media_url ? <span className="text-lg">📸</span>
              : <span className="text-lg">✍️</span>}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold">@{post.profiles?.username}</p>
            <p className="text-xs text-muted-foreground truncate">{getPostPreviewText(post.content).slice(0, 50) || 'Post'}</p>
          </div>
        </div>

        <ExternalShareBar
          getShareUrl={getExternalShareUrl}
          shareTitle="SociaLens"
          shareText={`Check out this ${isVideo ? 'reel' : 'post'} by @${post.profiles?.username} on SociaLens`}
        />

        <p className="px-4 pt-2 text-[11px] text-muted-foreground text-center">Or send directly to someone on SociaLens</p>

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
            <div className="w-full py-3 bg-green-500 text-white rounded-xl text-center font-semibold">✓ Sent!</div>
          ) : (
            <button onClick={handleSend} disabled={selected.length === 0 || sending}
              className="w-full py-3 rounded-xl font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, #ec4899, #a855f7)' }}>
              <Send className="h-4 w-4" />
              {sending ? 'Sending...' : `Send${selected.length > 0 ? ` (${selected.length})` : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
