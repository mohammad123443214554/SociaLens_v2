'use client'

import { useState, useEffect } from 'react'
import { X, Send, Search, Check, Sparkles } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/hooks/useUser'
import { getAvatarUrl } from '@/lib/utils/helpers'
import { VerifiedBadge } from '@/components/shared/VerifiedBadge'
import { ExternalShareBar } from '@/components/shared/ExternalShareBar'

interface AperonixShareModalProps {
  replyText: string
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

// Same followers+following picker as the post ShareModal, reused here so an.
// Aperonix reply can be forwarded to one or more people in chat.
export function AperonixShareModal({ replyText, onClose }: AperonixShareModalProps) {
  const { user } = useUser()
  const [people, setPeople] = useState<Person[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const supabase = createClient()

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
    setSending(true)

    for (const receiverId of selected) {
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

      await supabase.from('messages').insert({
        chat_id: chatId,
        sender_id: user.id,
        content: replyText,
        is_aperonix_reply: true,
      })

      await supabase.from('chats').update({
        last_message: '✨ Shared an Aperonix reply',
        last_message_time: new Date().toISOString(),
        last_message_type: 'aperonix',
        last_message_sender_id: user.id,
      }).eq('id', chatId)
    }

    setSent(true)
    setSending(false)
    setTimeout(onClose, 1500)
  }

  const filtered = people.filter(p =>
    p.username.toLowerCase().includes(search.toLowerCase()) ||
    (p.full_name || '').toLowerCase().includes(search.toLowerCase())
  )

  const getExternalShareUrl = async () => {
    if (!user) throw new Error('Not signed in')
    const { data, error } = await supabase
      .from('shared_aperonix_replies')
      .insert({ shared_by: user.id, content: replyText })
      .select('id')
      .single()
    if (error || !data) throw error || new Error('Could not create link')
    return `${window.location.origin}/share/aperonix/${data.id}`
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-[110] flex items-end sm:items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-card border rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="font-bold text-base">Share Aperonix reply</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>

        <div className="px-4 py-2 border-b bg-muted/30 flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold">Aperonix</p>
            <p className="text-xs text-muted-foreground truncate">{replyText.slice(0, 60)}</p>
          </div>
        </div>

        <ExternalShareBar
          getShareUrl={getExternalShareUrl}
          shareTitle="Aperonix - SociaLens"
          shareText="Check out this reply from Aperonix on SociaLens"
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
