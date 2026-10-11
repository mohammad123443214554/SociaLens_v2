'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { X, Send, Search, Check, Users } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/hooks/useUser'
import { getAvatarUrl } from '@/lib/utils/helpers'
import { VerifiedBadge } from '@/components/shared/VerifiedBadge'
import { ExternalShareBar } from '@/components/shared/ExternalShareBar'

interface AperonixShareModalProps {
  replyText: string
  contentType?: 'reply' | 'prompt' | 'chat'
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

// Lets people share an Aperonix reply or a user's prompt externally or in SocialLens chats.
export function AperonixShareModal({ replyText, contentType = 'reply', onClose }: AperonixShareModalProps) {
  const isPrompt = contentType === 'prompt'
  const isChat = contentType === 'chat'
  const sharedChat = (() => {
    if (!isChat) return null
    try {
      const parsed = JSON.parse(replyText)
      return parsed?.type === 'chat' && Array.isArray(parsed.messages) ? parsed : null
    } catch {
      return null
    }
  })()
  const chatTranscript = sharedChat
    ? sharedChat.messages.map((message: { role?: string; content?: string; attachments?: { name?: string }[] }) => `${message.role === 'user' ? (sharedChat.owner?.username || 'User') : 'Aperonix'}:\n${message.content || ''}${message.attachments?.length ? `\n[Attachments: ${message.attachments.map((a: { name?: string }) => a.name || 'file').join(', ')}]` : ''}`).join('\n\n')
    : ''
  const shareLabel = isChat ? 'Chat' : isPrompt ? 'Your prompt' : 'Aperonix'
  const shareTitle = isChat ? 'Share Chat' : isPrompt ? 'Share your prompt' : 'Share Aperonix reply'
  const externalTitle = isChat ? `${sharedChat?.title || 'Chat'} - SociaLens` : isPrompt ? 'SociaLens prompt' : 'Aperonix - SociaLens'
  const externalText = isChat
    ? `Read this conversation, ${sharedChat?.title || 'shared chat'}, on SociaLens`
    : isPrompt
      ? 'Check out this prompt shared from SociaLens'
      : 'Check out this reply from Aperonix on SociaLens'
  const { user, profile } = useUser()
  const [people, setPeople] = useState<Person[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
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
    setSendError(null)
    let successful = 0

    try {
      for (const receiverId of selected) {
        let chatId: string | null = null
        const { data: existing, error: lookupError } = await supabase
          .from('chats')
          .select('id')
          .or(`and(participant1_id.eq.${user.id},participant2_id.eq.${receiverId}),and(participant1_id.eq.${receiverId},participant2_id.eq.${user.id})`)
          .limit(1)
          .maybeSingle()

        if (lookupError) continue
        if (existing) {
          chatId = existing.id
        } else {
          const { data: newChat, error: createError } = await supabase
            .from('chats')
            .insert({ participant1_id: user.id, participant2_id: receiverId })
            .select('id').single()
          if (createError) continue
          chatId = newChat?.id || null
        }

        if (!chatId) continue

        const { error: messageError } = await supabase.from('messages').insert({
          chat_id: chatId,
          sender_id: user.id,
          content: isPrompt || isChat
            ? JSON.stringify({
                __sociaLensShare: 1,
                type: isChat ? 'chat' : 'prompt',
                owner: {
                  username: profile?.username || user.email?.split('@')[0] || 'SociaLens user',
                  avatar_url: profile?.avatar_url ?? null,
                },
                ...(isPrompt ? { prompt: replyText } : {
                  title: sharedChat?.title || 'Shared chat',
                  messages: sharedChat?.messages || [],
                }),
              })
            : replyText,
          is_aperonix_reply: !isPrompt && !isChat,
        })
        if (messageError) continue

        await supabase.from('chats').update({
          last_message: isChat ? `Shared a chat: ${sharedChat?.title || 'Chat'}` : isPrompt ? 'Shared a prompt' : '✨ Shared an Aperonix reply',
          last_message_time: new Date().toISOString(),
          last_message_type: isPrompt || isChat ? 'text' : 'aperonix',
          last_message_sender_id: user.id,
        }).eq('id', chatId)
        successful += 1
      }

      if (successful > 0) {
        setSent(true)
        setTimeout(onClose, 1500)
      } else {
        setSendError('Could not send this content. Check that you can message the selected person and try again.')
      }
    } catch {
      setSendError('Something went wrong while sharing. Please try again.')
    } finally {
      setSending(false)
    }
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
    const url = new URL(`/share/aperonix/${data.id}`, window.location.origin)
    if (isPrompt) url.searchParams.set('type', 'prompt')
    if (isChat) url.searchParams.set('type', 'chat')
    return url.toString()
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
        className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-border bg-card text-card-foreground shadow-[0_24px_90px_rgba(0,0,0,0.18)] sm:max-h-[min(88dvh,760px)] sm:rounded-3xl"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-border px-5 py-4">
          <Image
            src="/images/aperonix-logo.png"
            alt="Aperonix"
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 object-contain"
            priority
          />
          <div className="min-w-0 flex-1">
            <h2 id="aperonix-share-title" className="text-base font-semibold tracking-tight">{shareTitle}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Send it to friends or share a link</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close share dialog"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-4 overflow-y-auto overscroll-contain p-5">
          <div className="rounded-2xl border border-border bg-muted/50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Avatar className="h-7 w-7 shrink-0 ring-1 ring-white/10">
                <AvatarImage src={isPrompt ? getAvatarUrl(profile?.avatar_url ?? null) : '/images/aperonix-logo.png'} />
                <AvatarFallback className="bg-muted text-[10px] font-semibold text-muted-foreground">
                  {isPrompt ? (profile?.username?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U') : 'A'}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-semibold">{shareLabel}</span>
              <span className="rounded-full border border-fuchsia-400/20 bg-fuchsia-400/10 px-2 py-0.5 text-[10px] font-medium text-fuchsia-200">{isChat ? `${sharedChat?.messages?.length || 0} messages` : isPrompt ? 'User prompt' : 'AI reply'}</span>
            </div>
            {isChat ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground">{sharedChat?.title || 'Shared chat'}</p>
                <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:4] overflow-hidden">{chatTranscript}</p>
              </div>
            ) : (
              <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] overflow-hidden">{replyText}</p>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-muted/30 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Share outside SocialLens</p>
            <ExternalShareBar
              getShareUrl={getExternalShareUrl}
              shareTitle={externalTitle}
              shareText={externalText}
            />
            <p className="mt-2 text-xs leading-5 text-muted-foreground">Create a share link or send it using your phone's share menu.</p>
          </div>

          <div>
            <div className="mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Send on SocialLens</h3>
              {selected.length > 0 && (
                <span className="ml-auto rounded-full bg-fuchsia-500/15 px-2.5 py-1 text-xs font-semibold text-fuchsia-200">
                  {selected.length} selected
                </span>
              )}
            </div>

            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search people by name..."
                aria-label="Search people"
                className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-fuchsia-400/70 focus:ring-2 focus:ring-fuchsia-400/15"
              />
            </div>

            <div className="max-h-52 overflow-y-auto rounded-2xl border border-border">
              {loadingPeople ? (
                <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-fuchsia-400" />
                  Loading people...
                </div>
              ) : filtered.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Users className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
                  <p className="text-sm font-medium text-muted-foreground">{search ? 'No matches found' : 'No followers or following yet'}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{search ? 'Try another name or username.' : 'People you follow or who follow you will appear here.'}</p>
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
                    className={`flex w-full items-center gap-3 border-b border-border px-3.5 py-3 text-left transition last:border-b-0 hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fuchsia-400 ${isSelected ? 'bg-fuchsia-500/[0.09]' : ''}`}
                  >
                    <Avatar className="h-10 w-10 shrink-0 ring-1 ring-white/10">
                      <AvatarImage src={getAvatarUrl(person.avatar_url)} />
                      <AvatarFallback className="bg-muted text-sm font-semibold text-muted-foreground">{person.username?.[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1 truncate text-sm font-semibold text-foreground">
                        <span className="truncate">{person.username}</span>
                        {person.is_verified && <VerifiedBadge type={person.verification_type} className="shrink-0 text-xs" />}
                      </p>
                      {person.full_name && <p className="mt-0.5 truncate text-xs text-muted-foreground">{person.full_name}</p>}
                    </div>
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${isSelected ? 'border-fuchsia-400 bg-fuchsia-500 text-white' : 'border-border text-transparent'}`}>
                      {isSelected && <Check className="h-3.5 w-3.5" />}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <footer className="border-t border-border bg-card p-4 sm:px-5">
          {sendError && <p role="alert" className="mb-3 text-center text-xs leading-5 text-rose-300">{sendError}</p>}
          {sent ? (
            <div className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500/15 py-3 text-sm font-semibold text-emerald-300">
              <Check className="h-4 w-4" /> Sent successfully
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={selected.length === 0 || sending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 to-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-fuchsia-950/25 transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-fuchsia-300 focus:ring-offset-2 focus:ring-offset-background disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
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
