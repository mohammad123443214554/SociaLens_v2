'use client'

import { useState, useEffect } from 'react'
import { X, Send, Search, Check, Sparkles, Users, Share2 } from 'lucide-react'
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

// Lets people share an Aperonix reply externally or forward it to SocialLens chats.
export function AperonixShareModal({ replyText, onClose }: AperonixShareModalProps) {
  const { user } = useUser()
  const [people, setPeople] = useState<Person[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [loadingPeople, setLoadingPeople] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    let active = true
    const fetchPeople = async () => {
      if (!user) {
        setLoadingPeople(false)
        return
      }
      setLoadingPeople(true)
      const { data: f1 } = await supabase
        .from('follows')
        .select('profiles!follows_following_id_fkey(id,username,avatar_url,full_name,is_verified,verification_type)')
        .eq('follower_id', user.id).eq('status', 'accepted')
      const { data: f2 } = await supabase
        .from('follows')
        .select('profiles!follows_follower_id_fkey(id,username,avatar_url,full_name,is_verified,verification_type)')
        .eq('following_id', user.id).eq('status', 'accepted')
      if (!active) return
      const l1 = (f1 || []).map((d: any) => d.profiles).filter(Boolean)
      const l2 = (f2 || []).map((d: any) => d.profiles).filter(Boolean)
      setPeople([...l1, ...l2.filter((p: Person) => !l1.find((x: Person) => x.id === p.id))])
      setLoadingPeople(false)
    }
    fetchPeople()
    return () => { active = false }
  }, [user])

  const handleSend = async () => {
    if (!user || selected.length === 0 || sending) return
    setSending(true)
    let successful = 0

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

      const { error: messageError } = await supabase.from('messages').insert({
        chat_id: chatId,
        sender_id: user.id,
        content: replyText,
        is_aperonix_reply: true,
      })
      if (messageError) continue

      await supabase.from('chats').update({
        last_message: '✨ Shared an Aperonix reply',
        last_message_time: new Date().toISOString(),
        last_message_type: 'aperonix',
        last_message_sender_id: user.id,
      }).eq('id', chatId)
      successful += 1
    }

    setSent(successful > 0)
    setSending(false)
    if (successful > 0) setTimeout(onClose, 1500)
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
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/75 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="aperonix-share-title"
        className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-slate-950 text-slate-100 shadow-[0_24px_90px_rgba(0,0,0,0.55)] sm:max-h-[min(88dvh,760px)] sm:rounded-3xl"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500 via-fuchsia-500 to-violet-600 shadow-lg shadow-fuchsia-950/40">
            <Share2 className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="aperonix-share-title" className="text-base font-semibold tracking-tight">Share Aperonix reply</h2>
            <p className="mt-0.5 text-xs text-slate-400">Send it to friends or share a link</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close share dialog"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-4 overflow-y-auto overscroll-contain p-5">
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-violet-600">
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </span>
              <span className="text-sm font-semibold">Aperonix</span>
              <span className="rounded-full border border-fuchsia-400/20 bg-fuchsia-400/10 px-2 py-0.5 text-[10px] font-medium text-fuchsia-200">AI reply</span>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-300 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] overflow-hidden">
              {replyText}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Share outside SocialLens</p>
            <ExternalShareBar
              getShareUrl={getExternalShareUrl}
              shareTitle="Aperonix - SociaLens"
              shareText="Check out this reply from Aperonix on SociaLens"
            />
            <p className="mt-2 text-xs leading-5 text-slate-500">Create a share link or send it using your phone's share menu.</p>
          </div>

          <div>
            <div className="mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-400" />
              <h3 className="text-sm font-semibold">Send on SocialLens</h3>
              {selected.length > 0 && (
                <span className="ml-auto rounded-full bg-fuchsia-500/15 px-2.5 py-1 text-xs font-semibold text-fuchsia-200">
                  {selected.length} selected
                </span>
              )}
            </div>

            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search people by name..."
                aria-label="Search people"
                className="h-11 w-full rounded-xl border border-white/10 bg-slate-900 pl-10 pr-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-fuchsia-400/70 focus:ring-2 focus:ring-fuchsia-400/15"
              />
            </div>

            <div className="max-h-52 overflow-y-auto rounded-2xl border border-white/[0.08]">
              {loadingPeople ? (
                <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-slate-400">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-fuchsia-400" />
                  Loading people...
                </div>
              ) : filtered.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Users className="mx-auto mb-2 h-5 w-5 text-slate-500" />
                  <p className="text-sm font-medium text-slate-300">{search ? 'No matches found' : 'No followers or following yet'}</p>
                  <p className="mt-1 text-xs text-slate-500">{search ? 'Try another name or username.' : 'People you follow or who follow you will appear here.'}</p>
                </div>
              ) : filtered.map(person => {
                const isSelected = selected.includes(person.id)
                return (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => setSelected(prev =>
                      prev.includes(person.id) ? prev.filter(s => s !== person.id) : [...prev, person.id]
                    )}
                    aria-pressed={isSelected}
                    className={`flex w-full items-center gap-3 border-b border-white/[0.06] px-3.5 py-3 text-left transition last:border-b-0 hover:bg-white/[0.045] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fuchsia-400 ${isSelected ? 'bg-fuchsia-500/[0.09]' : ''}`}
                  >
                    <Avatar className="h-10 w-10 shrink-0 ring-1 ring-white/10">
                      <AvatarImage src={getAvatarUrl(person.avatar_url)} />
                      <AvatarFallback className="bg-slate-800 text-sm font-semibold text-slate-300">{person.username?.[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1 truncate text-sm font-semibold text-slate-100">
                        <span className="truncate">{person.username}</span>
                        {person.is_verified && <VerifiedBadge type={person.verification_type} className="shrink-0 text-xs" />}
                      </p>
                      {person.full_name && <p className="mt-0.5 truncate text-xs text-slate-400">{person.full_name}</p>}
                    </div>
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${isSelected ? 'border-fuchsia-400 bg-fuchsia-500 text-white' : 'border-slate-600 text-transparent'}`}>
                      {isSelected && <Check className="h-3.5 w-3.5" />}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <footer className="border-t border-white/10 bg-slate-950/95 p-4 sm:px-5">
          {sent ? (
            <div className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500/15 py-3 text-sm font-semibold text-emerald-300">
              <Check className="h-4 w-4" /> Sent successfully
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={selected.length === 0 || sending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 to-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-fuchsia-950/25 transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-fuchsia-300 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              <Send className="h-4 w-4" />
              {sending ? 'Sending...' : selected.length > 0 ? `Send to ${selected.length} ${selected.length === 1 ? 'person' : 'people'}` : 'Select people to send'}
            </button>
          )}
        </footer>
      </section>
    </div>
  )
}
