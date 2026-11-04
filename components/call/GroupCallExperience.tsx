'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import AgoraRTC from 'agora-rtc-sdk-ng'
import type { IAgoraRTCClient, ILocalAudioTrack } from 'agora-rtc-sdk-ng'
import { createClient } from '@/lib/supabase/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Phone, PhoneOff, Users, X, Plus, Check, Mic, MicOff, Volume2, Pause, Play, Signal, SmilePlus, Search } from 'lucide-react'
import { CallReactionLottie } from './CallReactionLottie'
import { CALL_REACTION_ALL_IDS, CALL_REACTION_CATEGORIES, CALL_REACTION_CUSTOM_OPTIONS, getCallReactionCategory, getCallReactionLabel, isCallReactionId, type CallReactionCategoryId, type CallReactionId } from '@/lib/call-reactions'

type Person = { id: string; username: string; fullName: string | null; avatarUrl: string | null }
type Invitation = { groupCallId: string; invitedBy: string; participants: Person[] }
type Contact = Person
type RosterPerson = Person & { status: 'joined' | 'invited' | 'ringing' | 'left' | 'declined' | 'missed'; isSpeaking?: boolean }
type IncomingGroupReaction = { id: string; reaction: CallReactionId; senderName: string }

function groupAgoraUid(userId: string) {
  let hash = 0
  for (const ch of userId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return (hash % 1_000_000_000) + 1
}

type Props = { userId: string; disabled?: boolean; onError: (message: string) => void }

export function GroupCallExperience({ userId, disabled = false, onError }: Props) {
  const [supabase] = useState(() => createClient())
  const [incoming, setIncoming] = useState<Invitation | null>(null)
  const [activeCallId, setActiveCallId] = useState<string | null>(null)
  const [roster, setRoster] = useState<RosterPerson[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [muted, setMuted] = useState(false)
  const [held, setHeld] = useState(false)
  const [speakerOn, setSpeakerOn] = useState(false)
  const [speakingUids, setSpeakingUids] = useState<Set<string>>(() => new Set())
  const [expanded, setExpanded] = useState(false)
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false)
  const [recipientPickerOpen, setRecipientPickerOpen] = useState(false)
  const [reactionSearch, setReactionSearch] = useState('')
  const [reactionCategory, setReactionCategory] = useState<CallReactionCategoryId>('all')
  const [pendingReaction, setPendingReaction] = useState<CallReactionId | null>(null)
  const [selectedReactionRecipients, setSelectedReactionRecipients] = useState<string[]>([])
  const [sendingReaction, setSendingReaction] = useState(false)
  const [incomingGroupReaction, setIncomingGroupReaction] = useState<IncomingGroupReaction | null>(null)
  const heldRef = useRef(false)
  const speakerRef = useRef(false)
  const clientRef = useRef<IAgoraRTCClient | null>(null)
  const localTrackRef = useRef<ILocalAudioTrack | null>(null)
  const remoteUsersRef = useRef<Map<string | number, any>>(new Map())
  const mountedRef = useRef(true)
  const activeCallIdRef = useRef<string | null>(null)

  const loadIncoming = useCallback(async () => {
    try {
      const response = await fetch('/api/group-calls/incoming', { cache: 'no-store' })
      if (!response.ok) return
      const data = await response.json()
      if (mountedRef.current && !activeCallIdRef.current) setIncoming(data.invitations?.[0] ?? null)
    } catch (error) {
      console.warn('[Group Call] incoming invitation refresh failed', error)
    }
  }, [])

  const refreshRoster = useCallback(async (groupCallId: string) => {
    const { data, error } = await supabase
      .from('group_call_participants')
      .select('user_id,status')
      .eq('group_call_id', groupCallId)
      .in('status', ['joined','invited','ringing','left','declined','missed'])
    if (error) {
      console.error('[Group Call] roster refresh failed', error)
      return
    }
    const ids = [...new Set((data || []).map((row) => row.user_id))]
    const { data: profiles } = ids.length
      ? await supabase.from('profiles').select('id,username,full_name,avatar_url').in('id', ids)
      : { data: [] }
    const map = new Map((profiles || []).map((p) => [p.id, p]))
    if (!mountedRef.current) return
    setRoster((data || []).map((row) => {
      const profile = map.get(row.user_id)
      return {
        id: row.user_id,
        username: profile?.username || 'user',
        fullName: profile?.full_name || null,
        avatarUrl: profile?.avatar_url || null,
        status: row.status,
      } as RosterPerson
    }))
  }, [supabase])

  const cleanupMedia = useCallback(async () => {
    const client = clientRef.current
    const track = localTrackRef.current
    localTrackRef.current = null
    clientRef.current = null
    remoteUsersRef.current.clear()
    try { track?.stop(); track?.close() } catch {}
    try { await client?.leave() } catch {}
  }, [])

  const connectToGroup = useCallback(async (groupCallId: string) => {
    const response = await fetch(`/api/group-calls/${groupCallId}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attempt: 0 }),
    })
    const connection = await response.json()
    if (!response.ok) throw new Error(connection.error || 'Could not prepare group call audio')
    const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
    clientRef.current = client
    client.on('user-published', async (remoteUser, mediaType) => {
      try {
        await client.subscribe(remoteUser, mediaType)
        remoteUsersRef.current.set(remoteUser.uid, remoteUser)
        if (mediaType === 'audio') {
          remoteUser.audioTrack?.setVolume(heldRef.current ? 0 : speakerRef.current ? 100 : 55)
          remoteUser.audioTrack?.play()
        }
        if (mountedRef.current) setExpanded(true)
      } catch (error) {
        console.error('[Group Call] remote participant subscription failed', error)
      }
    })
    client.on('user-unpublished', (remoteUser) => {
      if (remoteUser.audioTrack) remoteUser.audioTrack.stop()
    })
    client.on('user-left', (remoteUser) => {
      remoteUsersRef.current.delete(remoteUser.uid)
      setSpeakingUids((current) => { const next = new Set(current); next.delete(String(remoteUser.uid)); return next })
    })
    client.on('volume-indicator', (volumes: Array<{ uid: string | number; level: number }>) => {
      const active = new Set(volumes.filter((item) => item.level >= 8).map((item) => String(item.uid)))
      if (mountedRef.current) setSpeakingUids(active)
    })
    await client.join(connection.appId, connection.channel, connection.token, connection.uid)
    client.enableAudioVolumeIndicator()
    const track = await AgoraRTC.createMicrophoneAudioTrack()
    localTrackRef.current = track
    await client.publish([track])
  }, [])

  const acceptInvitation = useCallback(async () => {
    if (!incoming || busy) return
    if (disabled) { onError('You are already on another call. End that call before joining a group voice call.'); return }
    setBusy(true)
    try {
      const response = await fetch(`/api/group-calls/${incoming.groupCallId}/respond`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not join group call')
      activeCallIdRef.current = incoming.groupCallId
      setMuted(false); setHeld(false); setSpeakerOn(false)
      setActiveCallId(incoming.groupCallId)
      await refreshRoster(incoming.groupCallId)
      await connectToGroup(incoming.groupCallId)
      setIncoming(null)
      setExpanded(true)
    } catch (error) {
      await fetch(`/api/group-calls/${incoming.groupCallId}/leave`, { method: 'POST' }).catch(() => undefined)
      await cleanupMedia()
      activeCallIdRef.current = null
      setActiveCallId(null)
      onError(error instanceof Error ? error.message : 'Could not join group voice call')
    } finally {
      setBusy(false)
    }
  }, [incoming, busy, disabled, refreshRoster, connectToGroup, cleanupMedia, onError])

  const declineInvitation = useCallback(async () => {
    if (!incoming || busy) return
    setBusy(true)
    try {
      await fetch(`/api/group-calls/${incoming.groupCallId}/respond`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: false }),
      })
      setIncoming(null)
      void loadIncoming()
    } finally {
      setBusy(false)
    }
  }, [incoming, busy, loadIncoming])

  const leaveCall = useCallback(async () => {
    const id = activeCallIdRef.current
    if (!id || busy) return
    setBusy(true)
    try {
      await fetch(`/api/group-calls/${id}/leave`, { method: 'POST' })
    } catch (error) {
      console.warn('[Group Call] leave request failed', error)
    } finally {
      await cleanupMedia()
      activeCallIdRef.current = null
      setActiveCallId(null)
      setRoster([])
      setMuted(false); setHeld(false); setSpeakerOn(false); setSpeakingUids(new Set())
      setExpanded(false)
      setBusy(false)
    }
  }, [busy, cleanupMedia])

  const loadContacts = useCallback(async () => {
    const response = await fetch('/api/group-calls/contacts', { cache: 'no-store' })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Could not load contacts')
    setContacts(data.contacts || [])
  }, [])

  const createGroupCall = useCallback(async () => {
    if (busy || !selected.length) return
    setBusy(true)
    try {
      const response = await fetch('/api/group-calls/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userIds: selected }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not start group call')
      activeCallIdRef.current = data.groupCallId
      setMuted(false); setHeld(false); setSpeakerOn(false)
      setActiveCallId(data.groupCallId)
      await refreshRoster(data.groupCallId)
      await connectToGroup(data.groupCallId)
      setPickerOpen(false)
      setSelected([])
      setExpanded(true)
    } catch (error) {
      if (activeCallIdRef.current) await fetch(`/api/group-calls/${activeCallIdRef.current}/leave`, { method: 'POST' }).catch(() => undefined)
      await cleanupMedia()
      activeCallIdRef.current = null
      setActiveCallId(null)
      onError(error instanceof Error ? error.message : 'Could not start group voice call')
    } finally {
      setBusy(false)
    }
  }, [busy, selected, refreshRoster, connectToGroup, cleanupMedia, onError])

  const inviteMore = useCallback(async () => {
    if (!activeCallId || !selected.length || busy) return
    setBusy(true)
    try {
      const response = await fetch(`/api/group-calls/${activeCallId}/invite`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userIds: selected }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not invite participants')
      await refreshRoster(activeCallId)
      setPickerOpen(false)
      setSelected([])
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not invite participants')
    } finally {
      setBusy(false)
    }
  }, [activeCallId, selected, busy, refreshRoster, onError])

  useEffect(() => {
    mountedRef.current = true
    void loadIncoming()
    const timer = window.setInterval(() => void loadIncoming(), 4000)
    const channel = supabase.channel(`group-call-invites:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_call_participants', filter: `user_id=eq.${userId}` }, () => void loadIncoming())
      .subscribe()
    return () => {
      mountedRef.current = false
      window.clearInterval(timer)
      void supabase.removeChannel(channel)
      void cleanupMedia()
    }
  }, [userId, supabase, loadIncoming, cleanupMedia])

  useEffect(() => {
    if (!activeCallId) return
    let alive = true
    void refreshRoster(activeCallId)
    const channel = supabase.channel(`group-call-roster:${activeCallId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_call_participants', filter: `group_call_id=eq.${activeCallId}` }, () => void refreshRoster(activeCallId))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'group_calls', filter: `id=eq.${activeCallId}` }, (payload) => {
        if (payload.new?.status === 'ended' && alive) {
          void cleanupMedia()
          activeCallIdRef.current = null
          setActiveCallId(null)
          setRoster([])
          setExpanded(false)
          onError('The group call has ended.')
        }
      })
      .subscribe()
    const recovery = window.setInterval(() => { if (alive) void refreshRoster(activeCallId) }, 12000)
    return () => { alive = false; window.clearInterval(recovery); void supabase.removeChannel(channel) }
  }, [activeCallId, supabase, refreshRoster, cleanupMedia, onError])

  useEffect(() => {
    if (!activeCallId) {
      setIncomingGroupReaction(null)
      return
    }
    let alive = true
    const channel = supabase.channel(`group-call-reactions:${activeCallId}:${userId}`, {
      config: { private: true, broadcast: { self: false, ack: false } },
    })
      .on('broadcast', { event: 'call-reaction' }, ({ payload }) => {
        if (!alive || !payload || payload.callId !== activeCallId || payload.recipientId !== userId) return
        if (payload.senderId === userId || typeof payload.id !== 'string' || !isCallReactionId(payload.reaction)) return
        setIncomingGroupReaction({
          id: payload.id,
          reaction: payload.reaction,
          senderName: typeof payload.senderName === 'string' ? payload.senderName : 'Participant',
        })
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[Group Call] private reaction channel unavailable:', status)
        }
      })
    return () => {
      alive = false
      void supabase.removeChannel(channel)
    }
  }, [activeCallId, userId, supabase])

  useEffect(() => {
    if (!incomingGroupReaction) return
    const id = incomingGroupReaction.id
    const timer = window.setTimeout(() => {
      setIncomingGroupReaction((current) => current?.id === id ? null : current)
    }, 5600)
    return () => window.clearTimeout(timer)
  }, [incomingGroupReaction?.id])

  useEffect(() => {
    heldRef.current = held
    speakerRef.current = speakerOn
    void localTrackRef.current?.setEnabled(!muted && !held)
    for (const remote of remoteUsersRef.current.values()) {
      remote.audioTrack?.setVolume(held ? 0 : speakerOn ? 100 : 55)
    }
  }, [muted, held, speakerOn])

  const toggleHold = () => setHeld((current) => !current)
  const joinedReactionRecipients = roster.filter((person) => person.status === 'joined' && person.id !== userId)

  const openReactionPicker = () => {
    if (!activeCallId || joinedReactionRecipients.length === 0) {
      onError('At least one other participant must be connected to receive a reaction.')
      return
    }
    setReactionSearch('')
    setReactionCategory('all')
    setReactionPickerOpen(true)
  }

  const chooseGroupReaction = (reaction: CallReactionId) => {
    const recipients = joinedReactionRecipients.map((person) => person.id)
    if (!recipients.length) {
      onError('No other joined participants are available to receive this reaction.')
      return
    }
    setPendingReaction(reaction)
    setSelectedReactionRecipients(recipients)
    setReactionPickerOpen(false)
    setRecipientPickerOpen(true)
  }

  const toggleReactionRecipient = (id: string) => {
    setSelectedReactionRecipients((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : current.length < 9 ? [...current, id] : current
    )
  }

  const sendGroupReaction = async () => {
    if (!activeCallId || !pendingReaction || selectedReactionRecipients.length === 0 || sendingReaction) return
    setSendingReaction(true)
    try {
      const response = await fetch(`/api/group-calls/${activeCallId}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reaction: pendingReaction, recipientIds: selectedReactionRecipients }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not send reaction')
      setRecipientPickerOpen(false)
      setPendingReaction(null)
      setSelectedReactionRecipients([])
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not send reaction')
    } finally {
      setSendingReaction(false)
    }
  }

  const visibleReactionIds = CALL_REACTION_ALL_IDS.filter((reaction) => {
    const categoryMatches = reactionCategory === 'all' || getCallReactionCategory(reaction) === reactionCategory
    const searchMatches = getCallReactionLabel(reaction).toLowerCase().includes(reactionSearch.trim().toLowerCase())
    return categoryMatches && searchMatches
  })


  const toggleContact = (id: string) => setSelected((current) =>
    current.includes(id) ? current.filter((item) => item !== id) : current.length < 9 ? [...current, id] : current
  )

  if (disabled && !incoming && !activeCallId && !pickerOpen) return null

  return (
    <>
      {incoming && !activeCallId && (
        <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/80 p-4 text-white">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#17171b] p-6 shadow-2xl">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-pink-500/15"><Users className="h-7 w-7 text-pink-400" /></div>
              <p className="text-sm font-semibold text-pink-300">Incoming Group Voice Call</p>
              <h2 className="mt-1 text-xl font-bold">Group Call</h2>
              <p className="mt-1 text-sm text-white/55">{incoming.participants.length} participant{incoming.participants.length === 1 ? '' : 's'} in the call</p>
            </div>
            <div className="my-5 flex flex-wrap justify-center gap-3">
              {incoming.participants.map((person) => (
                <div key={person.id} className="flex w-20 flex-col items-center gap-1">
                  <Avatar className="h-14 w-14 ring-2 ring-pink-400/40"><AvatarImage src={person.avatarUrl || undefined} /><AvatarFallback>{(person.fullName || person.username).slice(0,1).toUpperCase()}</AvatarFallback></Avatar>
                  <span className="max-w-full truncate text-xs text-white/80">{person.fullName || person.username}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-center gap-8">
              <button disabled={busy} onClick={() => void declineInvitation()} className="flex flex-col items-center gap-2 text-xs text-white/70"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600"><PhoneOff /></span>Decline</button>
              <button disabled={busy || disabled} onClick={() => void acceptInvitation()} className="flex flex-col items-center gap-2 text-xs text-white/70"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600"><Phone /></span>{busy ? 'Joining…' : 'Join'}</button>
            </div>
          </div>
        </div>
      )}

      {pickerOpen && !activeCallId && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div><h2 className="font-semibold">New Group Voice Call</h2><p className="text-xs text-muted-foreground">Select up to 9 people · 10 participants maximum</p></div>
              <button onClick={() => setPickerOpen(false)} className="rounded-full p-2 hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-2">
              {contacts.map((person) => (
                <button key={person.id} onClick={() => toggleContact(person.id)} className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-muted">
                  <Avatar className="h-10 w-10"><AvatarImage src={person.avatarUrl || undefined} /><AvatarFallback>{(person.fullName || person.username).slice(0,1).toUpperCase()}</AvatarFallback></Avatar>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{person.fullName || person.username}</span><span className="block truncate text-xs text-muted-foreground">@{person.username}</span></span>
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${selected.includes(person.id) ? 'border-pink-600 bg-pink-600 text-white' : 'border-muted-foreground/40'}`}>{selected.includes(person.id) && <Check className="h-3 w-3" />}</span>
                </button>
              ))}
              {!contacts.length && <p className="p-8 text-center text-sm text-muted-foreground">No message contacts available to invite.</p>}
            </div>
            <div className="flex items-center justify-between border-t border-border p-4">
              <span className="text-xs text-muted-foreground">{selected.length} selected</span>
              <button disabled={!selected.length || busy} onClick={() => void createGroupCall()} className="rounded-full bg-pink-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? 'Starting…' : 'Start group call'}</button>
            </div>
          </div>
        </div>
      )}

      {activeCallId && (
        <div className={`fixed z-[210] ${expanded ? 'inset-0 overflow-y-auto bg-[#101014] px-3 pb-8 pt-[max(1rem,env(safe-area-inset-top))]' : 'bottom-4 right-4 w-[min(92vw,390px)] rounded-2xl bg-[#19191f]'} border border-white/10 p-4 text-white shadow-2xl`}>
          <div className="flex items-center justify-between">
            <div><p className="text-xs font-semibold uppercase tracking-wider text-pink-300">Group Call</p><p className="text-sm text-white/60">{roster.filter(p => p.status === 'joined').length}/10 participants</p></div>
            <div className="flex items-center gap-2">
              <button onClick={() => setExpanded((v) => !v)} className="rounded-full p-2 hover:bg-white/10">{expanded ? <X className="h-4 w-4" /> : <Users className="h-4 w-4" />}</button>
            </div>
          </div>
          <div className={`my-5 grid grid-cols-2 gap-3 sm:grid-cols-3 ${expanded ? 'mx-auto max-w-5xl md:grid-cols-4 lg:grid-cols-5' : ''}`}>
            {roster.filter(p => p.status === 'joined').map((person) => {
              const speaking = speakingUids.has(String(groupAgoraUid(person.id)))
              return (
                <div key={person.id} className={`flex min-w-0 flex-col items-center gap-2 rounded-xl border p-3 transition-colors ${speaking ? 'border-emerald-400/80 bg-emerald-400/10 shadow-[0_0_22px_rgba(52,211,153,0.14)]' : 'border-white/5 bg-white/5'}`}>
                  <div className="relative">
                    <Avatar className={`h-14 w-14 sm:h-16 sm:w-16 ring-2 ${speaking ? 'ring-emerald-400' : 'ring-white/15'}`}><AvatarImage src={person.avatarUrl || undefined} /><AvatarFallback>{(person.fullName || person.username).slice(0,1).toUpperCase()}</AvatarFallback></Avatar>
                    {speaking && <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-[#101014]"><Signal className="h-3 w-3 text-white" /></span>}
                  </div>
                  <span className="max-w-full truncate text-xs">{person.id === userId ? 'You' : person.fullName || person.username}</span>
                  <span className={`text-[10px] ${speaking ? 'text-emerald-300' : 'text-white/40'}`}>{speaking ? 'Speaking' : person.id === userId && muted ? 'Mic off' : person.id === userId && held ? 'On hold' : 'Connected'}</span>
                </div>
              )
            })}
          </div>
          {roster.some(p => ['invited','ringing'].includes(p.status)) && (
            <div className="mx-auto mb-4 flex max-w-5xl flex-wrap justify-center gap-2">
              {roster.filter(p => ['invited','ringing'].includes(p.status)).map(p => <span key={p.id} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-white/60">{p.fullName || p.username} · {p.status === 'ringing' ? 'Ringing' : 'Invited'}</span>)}
            </div>
          )}
          <div className="mx-auto flex w-full max-w-xl items-center justify-center gap-3 sm:gap-5">
            <button type="button" aria-label={muted ? 'Unmute microphone' : 'Mute microphone'} onClick={() => setMuted((v) => !v)} className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-colors ${muted ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20'}`}>{muted ? <MicOff /> : <Mic />}</button>
            <button type="button" aria-label={speakerOn ? 'Turn speaker mode off' : 'Turn speaker mode on'} aria-pressed={speakerOn} onClick={() => setSpeakerOn((v) => !v)} className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-colors ${speakerOn ? 'bg-pink-600 text-white' : 'bg-white/10 hover:bg-white/20'}`}><Volume2 /></button>
            <button type="button" aria-label={held ? 'Resume group call' : 'Put group call on hold'} aria-pressed={held} onClick={toggleHold} className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-colors ${held ? 'bg-amber-400 text-black' : 'bg-white/10 hover:bg-white/20'}`}>{held ? <Play /> : <Pause />}</button>
            <button type="button" aria-label="Invite participants" onClick={async () => { try { await loadContacts(); setSelected([]); setPickerOpen(true) } catch (error) { onError(error instanceof Error ? error.message : 'Could not load contacts') } }} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"><Plus /></button>
            <button type="button" aria-label="Send reaction" title="Send reaction" onClick={openReactionPicker} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"><SmilePlus /></button>
            <button type="button" aria-label="Leave group call" onClick={() => void leaveCall()} disabled={busy} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-600 disabled:opacity-50"><PhoneOff /></button>
          </div>
          <p className="mt-3 text-center text-[10px] text-white/35">Speaker mode adjusts call playback level. Device output routing follows your system audio settings.</p>
        </div>
      )}
      {pickerOpen && activeCallId && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-background p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between"><div><h2 className="font-semibold">Invite to Group Call</h2><p className="text-xs text-muted-foreground">Choose message contacts to invite</p></div><button onClick={() => setPickerOpen(false)}><X className="h-4 w-4" /></button></div>
            <div className="max-h-[50vh] overflow-y-auto">
              {contacts.filter(p => !roster.some(r => r.id === p.id && ['joined','invited','ringing'].includes(r.status))).map((person) => (
                <button key={person.id} onClick={() => toggleContact(person.id)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-muted">
                  <Avatar className="h-9 w-9"><AvatarImage src={person.avatarUrl || undefined} /><AvatarFallback>{person.username.slice(0,1).toUpperCase()}</AvatarFallback></Avatar><span className="flex-1 text-sm">{person.fullName || person.username}</span>{selected.includes(person.id) && <Check className="h-4 w-4 text-pink-600" />}
                </button>
              ))}
            </div>
            <div className="mt-3 flex justify-end"><button disabled={!selected.length || busy} onClick={() => void inviteMore()} className="rounded-full bg-pink-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? 'Sending…' : 'Send invitations'}</button></div>
          </div>
        </div>
      )}

      {incomingGroupReaction && activeCallId && (
        <div key={incomingGroupReaction.id} className="pointer-events-none fixed inset-0 z-[280] flex flex-col items-center justify-center overflow-hidden bg-black/10" aria-live="polite">
          <div className="rounded-full border border-white/15 bg-black/45 px-4 py-1.5 text-xs font-medium text-white/90 backdrop-blur-md">{incomingGroupReaction.senderName} sent a reaction</div>
          {incomingGroupReaction.reaction === 'flying-heart' || incomingGroupReaction.reaction === 'heart-burst' ? (
            <div className="mt-3 animate-bounce text-[min(38vw,190px)] leading-none drop-shadow-[0_10px_35px_rgba(255,70,145,0.55)]">
              {incomingGroupReaction.reaction === 'flying-heart' ? '💗' : '💞'}
            </div>
          ) : (
            <CallReactionLottie
              reaction={incomingGroupReaction.reaction as Exclude<CallReactionId, 'flying-heart' | 'heart-burst'>}
              loop
              className="mt-2 h-[min(72vw,460px)] w-[min(72vw,460px)] drop-shadow-[0_12px_30px_rgba(255,105,180,0.28)]"
            />
          )}
        </div>
      )}

      {reactionPickerOpen && activeCallId && (
        <div className="fixed inset-0 z-[270] flex items-center justify-center bg-black/75 p-3">
          <div className="flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#19191f] text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 p-4">
              <div><h2 className="font-semibold">Choose a reaction</h2><p className="text-xs text-white/55">You will choose who receives it next</p></div>
              <button type="button" onClick={() => setReactionPickerOpen(false)} aria-label="Close reactions" className="rounded-full p-2 hover:bg-white/10"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex items-center gap-2 border-b border-white/10 p-3">
              <Search className="h-4 w-4 shrink-0 text-white/50" />
              <input value={reactionSearch} onChange={(event) => setReactionSearch(event.target.value)} placeholder="Search reactions" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-white/40" />
            </div>
            <div className="flex gap-1 overflow-x-auto border-b border-white/10 p-2">
              {CALL_REACTION_CATEGORIES.filter((category) => category.id !== 'recent').map((category) => (
                <button key={category.id} type="button" onClick={() => setReactionCategory(category.id)} className={`shrink-0 rounded-full px-3 py-2 text-xs font-medium ${reactionCategory === category.id ? 'bg-pink-600 text-white' : 'bg-white/5 text-white/65 hover:bg-white/10'}`}>{category.label}</button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="grid grid-cols-4 auto-rows-[92px] items-stretch gap-2 sm:grid-cols-5">
                {visibleReactionIds.map((reaction) => {
                  const custom = CALL_REACTION_CUSTOM_OPTIONS.find((option) => option.id === reaction)
                  return (
                    <button key={reaction} type="button" onClick={() => chooseGroupReaction(reaction)} title={getCallReactionLabel(reaction)} aria-label={getCallReactionLabel(reaction)} className="flex h-[92px] min-h-[92px] min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-white/10 bg-white/5 px-1.5 py-2 text-center text-xs hover:border-pink-400/50 hover:bg-pink-500/10">
                      {custom ? <span className="flex h-10 w-10 shrink-0 items-center justify-center text-[30px] leading-none" aria-hidden="true">{custom.emoji}</span> : <CallReactionLottie reaction={reaction as Exclude<CallReactionId, 'flying-heart' | 'heart-burst'>} loop className="h-10 w-10 shrink-0" />}
                      <span className="line-clamp-2 h-6 w-full overflow-hidden text-[10px] leading-3 text-white/90">{getCallReactionLabel(reaction)}</span>
                    </button>
                  )
                })}
              </div>
              {!visibleReactionIds.length && <p className="p-8 text-center text-sm text-white/50">No reactions found.</p>}
            </div>
          </div>
        </div>
      )}

      {recipientPickerOpen && activeCallId && pendingReaction && (
        <div className="fixed inset-0 z-[275] flex items-center justify-center bg-black/75 p-3">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#19191f] text-white shadow-2xl">
            <div className="border-b border-white/10 p-4">
              <div className="flex items-center justify-between">
                <div><h2 className="font-semibold">Who should receive this reaction?</h2><p className="mt-1 text-xs text-white/55">Only selected participants will receive it.</p></div>
                <button type="button" onClick={() => { setRecipientPickerOpen(false); setPendingReaction(null); setSelectedReactionRecipients([]) }} aria-label="Cancel reaction" className="rounded-full p-2 hover:bg-white/10"><X className="h-4 w-4" /></button>
              </div>
              <p className="mt-3 rounded-xl bg-white/5 px-3 py-2 text-sm text-pink-200">{CALL_REACTION_CUSTOM_OPTIONS.find((option) => option.id === pendingReaction)?.emoji || '✨'} {getCallReactionLabel(pendingReaction)}</p>
            </div>
            <div className="max-h-[52dvh] overflow-y-auto p-2">
              {joinedReactionRecipients.map((person) => (
                <button key={person.id} type="button" onClick={() => toggleReactionRecipient(person.id)} className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-white/5">
                  <Avatar className="h-10 w-10"><AvatarImage src={person.avatarUrl || undefined} /><AvatarFallback>{(person.fullName || person.username).slice(0,1).toUpperCase()}</AvatarFallback></Avatar>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{person.fullName || person.username}</span><span className="block truncate text-xs text-white/45">@{person.username}</span></span>
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${selectedReactionRecipients.includes(person.id) ? 'border-pink-500 bg-pink-600 text-white' : 'border-white/30'}`}>{selectedReactionRecipients.includes(person.id) && <Check className="h-3 w-3" />}</span>
                </button>
              ))}
              {!joinedReactionRecipients.length && <p className="p-8 text-center text-sm text-white/50">No other participants are currently connected.</p>}
            </div>
            <div className="flex items-center justify-between border-t border-white/10 p-4">
              <span className="text-xs text-white/55">{selectedReactionRecipients.length} selected · defaults to everyone</span>
              <button type="button" disabled={!selectedReactionRecipients.length || sendingReaction || joinedReactionRecipients.length === 0} onClick={() => void sendGroupReaction()} className="rounded-full bg-pink-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{sendingReaction ? 'Sending…' : 'Done'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
