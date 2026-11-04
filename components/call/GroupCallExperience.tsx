'use client'

import { useCallback, useEffect, useState } from 'react'
import AgoraRTC from 'agora-rtc-sdk-ng'
import type { IAgoraRTCClient, IAgoraRTCRemoteUser, ILocalAudioTrack } from 'agora-rtc-sdk-ng'
import { createClient } from '@/lib/supabase/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Phone, PhoneOff, Users, X, Plus, Check, Mic, MicOff } from 'lucide-react'

type Person = { id: string; username: string; fullName: string | null; avatarUrl: string | null }
type Invitation = { groupCallId: string; invitedBy: string; participants: Person[] }
type Contact = Person
type RosterPerson = Person & { status: 'joined' | 'invited' | 'ringing' | 'left' | 'declined' | 'missed' }

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
  const [expanded, setExpanded] = useState(false)
  const clientRef = useRef<IAgoraRTCClient | null>(null)
  const localTrackRef = useRef<ILocalAudioTrack | null>(null)
  const remoteUsersRef = useRef<Map<string | number, IAgoraRTCRemoteUser>>(new Map())
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
        if (mediaType === 'audio') remoteUser.audioTrack?.play()
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
    })
    await client.join(connection.appId, connection.channel, connection.token, connection.uid)
    const track = await AgoraRTC.createMicrophoneAudioTrack()
    localTrackRef.current = track
    await client.publish([track])
  }, [])

  const acceptInvitation = useCallback(async () => {
    if (!incoming || busy) return
    setBusy(true)
    try {
      const response = await fetch(`/api/group-calls/${incoming.groupCallId}/respond`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not join group call')
      activeCallIdRef.current = incoming.groupCallId
      setActiveCallId(incoming.groupCallId)
      await refreshRoster(incoming.groupCallId)
      await connectToGroup(incoming.groupCallId)
      setIncoming(null)
      setExpanded(true)
    } catch (error) {
      await cleanupMedia()
      activeCallIdRef.current = null
      setActiveCallId(null)
      onError(error instanceof Error ? error.message : 'Could not join group voice call')
    } finally {
      setBusy(false)
    }
  }, [incoming, busy, refreshRoster, connectToGroup, cleanupMedia, onError])

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
      setActiveCallId(data.groupCallId)
      await refreshRoster(data.groupCallId)
      await connectToGroup(data.groupCallId)
      setPickerOpen(false)
      setSelected([])
      setExpanded(true)
    } catch (error) {
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
    void refreshRoster(activeCallId)
    const channel = supabase.channel(`group-call-roster:${activeCallId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_call_participants', filter: `group_call_id=eq.${activeCallId}` }, () => void refreshRoster(activeCallId))
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [activeCallId, supabase, refreshRoster])

  useEffect(() => {
    if (!localTrackRef.current) return
    void localTrackRef.current.setEnabled(!muted)
  }, [muted])

  const toggleContact = (id: string) => setSelected((current) =>
    current.includes(id) ? current.filter((item) => item !== id) : current.length < 9 ? [...current, id] : current
  )

  if (disabled && !incoming && !activeCallId && !pickerOpen) return null

  return (
    <>
      {!activeCallId && !incoming && !disabled && (
        <button onClick={async () => {
          try { await loadContacts(); setSelected([]); setPickerOpen(true) }
          catch (error) { onError(error instanceof Error ? error.message : 'Could not load contacts') }
        }} className="fixed bottom-24 right-5 z-[190] flex items-center gap-2 rounded-full bg-pink-600 px-4 py-3 text-sm font-semibold text-white shadow-xl hover:bg-pink-700">
          <Users className="h-4 w-4" /> Group call
        </button>
      )}

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
              <button disabled={busy} onClick={() => void acceptInvitation()} className="flex flex-col items-center gap-2 text-xs text-white/70"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600"><Phone /></span>{busy ? 'Joining…' : 'Join'}</button>
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
        <div className={`fixed z-[210] ${expanded ? 'inset-0 bg-[#101014]' : 'bottom-4 right-4 w-[min(92vw,390px)] rounded-2xl bg-[#19191f]'} border border-white/10 p-4 text-white shadow-2xl`}>
          <div className="flex items-center justify-between">
            <div><p className="text-xs font-semibold uppercase tracking-wider text-pink-300">Group Call</p><p className="text-sm text-white/60">{roster.filter(p => p.status === 'joined').length}/10 participants</p></div>
            <div className="flex items-center gap-2">
              <button onClick={() => setExpanded((v) => !v)} className="rounded-full p-2 hover:bg-white/10">{expanded ? <X className="h-4 w-4" /> : <Users className="h-4 w-4" />}</button>
            </div>
          </div>
          <div className={`my-5 grid grid-cols-2 gap-3 ${expanded ? 'mx-auto max-w-3xl sm:grid-cols-3 md:grid-cols-4' : ''}`}>
            {roster.filter(p => p.status === 'joined').map((person) => (
              <div key={person.id} className="flex flex-col items-center gap-2 rounded-xl bg-white/5 p-3">
                <Avatar className="h-16 w-16 ring-2 ring-emerald-400/50"><AvatarImage src={person.avatarUrl || undefined} /><AvatarFallback>{(person.fullName || person.username).slice(0,1).toUpperCase()}</AvatarFallback></Avatar>
                <span className="max-w-full truncate text-xs">{person.id === userId ? 'You' : person.fullName || person.username}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-4">
            <button onClick={() => setMuted((v) => !v)} className={`flex h-12 w-12 items-center justify-center rounded-full ${muted ? 'bg-white text-black' : 'bg-white/10'}`}>{muted ? <MicOff /> : <Mic />}</button>
            <button onClick={async () => { try { await loadContacts(); setSelected([]); setPickerOpen(true) } catch (error) { onError(error instanceof Error ? error.message : 'Could not load contacts') } }} className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10"><Plus /></button>
            <button onClick={() => void leaveCall()} disabled={busy} className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600"><PhoneOff /></button>
          </div>
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
    </>
  )
}
