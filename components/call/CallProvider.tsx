'use client'

import { createClient } from '@/lib/supabase/client'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useUser } from '@/lib/hooks/useUser'
import { useCallEngine, peerAvatar, type CallType } from '@/lib/hooks/useCall'
import { useCallSettings } from '@/lib/hooks/useChatSettings'
import { usePushSubscription } from '@/lib/hooks/usePushSubscription'
import { useNativePush } from '@/lib/hooks/useNativePush'
import { IncomingCallModal } from './IncomingCallModal'
import { CallScreen } from './CallScreen'
import { PermissionGate } from './PermissionGate'

interface StartCallPeer {
  id: string
  username: string
  avatar_url: string | null
}

interface CallContextValue {
  startCall: (peer: StartCallPeer, chatId: string | null, type: CallType) => Promise<void>
  isCallActive: boolean
  reportBlocked: (reason: string) => void
}

const CallContext = createContext<CallContextValue | null>(null)

export function useCallContext() {
  const ctx = useContext(CallContext)
  if (!ctx) throw new Error('useCallContext must be used within CallProvider')
  return ctx
}

/**
 * Mounted once near the root (see ResponsiveLayout) so a call can ring in
 * from anywhere in the app, not just the chat page. Renders the incoming
 * call screen, the active call screen, and a self-contained error banner
 * as global overlays.
 *
 * The error banner is driven directly by this component's own state
 * (bannerError below) rather than routing through the separate Toast
 * module - that removes a whole class of "the message technically fired
 * but nothing rendered" bugs, since the exact same render that owns the
 * call state also owns what's displayed for it.
 */
export function CallProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser()
  const engine = useCallEngine(user?.id)
  const { data: callSettings } = useCallSettings(user?.id)
  usePushSubscription(user?.id)
  useNativePush(user?.id)
  const [bannerError, setBannerError] = useState<string | null>(null)
  const [supabase] = useState(() => createClient())
  const reactionChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const [incomingReaction, setIncomingReaction] = useState<{ id: string; reaction: 'flying-heart' | 'heart-burst' } | null>(null)

  // Tapping "Accept" on the OS call notification lands here with
  // ?incomingCall=<id> in the URL - from public/sw.js on the web, and from
  // CallMessagingService.kt in the Android app, which now uses the exact
  // same contract. Decline lands here with ?declineCall=<id>: the
  // notification can't call /api/calls/decline itself, because that route
  // needs the person's real logged-in session, which only this WebView has.
  const pendingAcceptCallId = useRef<string | null>(null)
  const pendingDeclineCallId = useRef<string | null>(null)
  const handledNotificationRef = useRef(false)

  // Read the params exactly once, on the very first render, and strip them
  // from the address bar immediately so a refresh or a back-navigation can
  // never replay an accept/decline.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const incomingCall = params.get('incomingCall')
    const declineCall = params.get('declineCall')
    if (!incomingCall && !declineCall) return
    if (incomingCall) pendingAcceptCallId.current = incomingCall
    if (declineCall) pendingDeclineCallId.current = declineCall
    params.delete('incomingCall')
    params.delete('declineCall')
    const rest = params.toString()
    window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''))
  }, [])

  // Act on them as soon as the Supabase session is actually hydrated - not
  // before. useCallEngine can't verify that a call belongs to this person
  // until it knows who this person is, and on a cold start from the
  // notification that takes a moment.
  //
  // This no longer waits for the call to show up as 'incoming-ringing' on
  // its own (which relied on the 4-second polling backstop, and silently did
  // nothing at all if the realtime INSERT had already been missed). It goes
  // straight at the call by id, which is what makes the Android Accept
  // button genuinely answer the existing call instead of just opening chat.
  useEffect(() => {
    if (!user?.id || handledNotificationRef.current) return
    const accept = pendingAcceptCallId.current
    const decline = pendingDeclineCallId.current
    if (!accept && !decline) return

    handledNotificationRef.current = true
    pendingAcceptCallId.current = null
    pendingDeclineCallId.current = null

    // Decline wins if both somehow arrive - never answer a call the person
    // just rejected.
    if (decline) void engine.rejectIncomingById(decline)
    else if (accept) void engine.acceptIncomingById(accept)
  }, [user?.id, engine.acceptIncomingById, engine.rejectIncomingById])

  // Whenever the call engine reports an error (permission denied, DB
  // Insert failed, etc.) surface it here, auto-dismissing after a bit.
  useEffect(() => {
    if (!engine.error) return
    setBannerError(engine.error)
    const timer = setTimeout(() => setBannerError(null), 7000)
    return () => clearTimeout(timer)
  }, [engine.error])

  const reportBlocked = (reason: string) => {
    setBannerError(reason)
    window.setTimeout(() => setBannerError((current) => (current === reason ? null : current)), 5000)
  }

  // Ephemeral reactions are broadcast only to the two members of this call.
  // They are not stored in chat history or the calls table.
  useEffect(() => {
    const activeCallId = engine.call?.id
    if (!activeCallId || engine.phase !== 'in-call' || !user?.id) {
      reactionChannelRef.current = null
      return
    }

    let active = true
    const channel = supabase.channel(`call-reactions:${activeCallId}`, {
      config: { broadcast: { self: false, ack: true } },
    })
    reactionChannelRef.current = channel
    channel
      .on('broadcast', { event: 'call-reaction' }, ({ payload }) => {
        if (!active || !payload || payload.senderId === user.id) return
        if (payload.reaction !== 'flying-heart' && payload.reaction !== 'heart-burst') return
        if (typeof payload.id !== 'string') return
        setIncomingReaction({ id: payload.id, reaction: payload.reaction })
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[SociaLens Call] reaction channel unavailable:', status)
        }
      })

    return () => {
      active = false
      if (reactionChannelRef.current === channel) reactionChannelRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [engine.call?.id, engine.phase, user?.id, supabase])

  const sendCallReaction = async (reaction: 'flying-heart' | 'heart-burst') => {
    const channel = reactionChannelRef.current
    if (!channel || engine.phase !== 'in-call' || !user?.id) return
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const result = await channel.send({
      type: 'broadcast',
      event: 'call-reaction',
      payload: { id, reaction, senderId: user.id },
    })
    if (result !== 'ok') {
      console.warn('[SociaLens Call] reaction broadcast was not acknowledged:', result)
    }
  }

  const startCall = async (peer: StartCallPeer, chatId: string | null, type: CallType) => {
    console.log('[SociaLens Call] startCall requested', { peer, chatId, type, phase: engine.phase })
    if (engine.phase !== 'idle') {
      reportBlocked('You are already on a call.')
      return
    }
    await engine.startCall(peer.id, chatId, type, peer)
  }

  const value: CallContextValue = { startCall, isCallActive: engine.phase !== 'idle', reportBlocked }

  const peerName = engine.peer?.username || 'Unknown'
  const peerAvatarUrl = peerAvatar(engine.peer)

  return (
    <CallContext.Provider value={value}>
      {children}

      {bannerError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[300] max-w-[92vw] flex items-center gap-3 bg-red-600 text-white text-sm font-medium px-4 py-3 rounded-xl shadow-2xl">
          <span>{bannerError}</span>
          <button onClick={() => setBannerError(null)} className="shrink-0 opacity-80 hover:opacity-100">✕</button>
        </div>
      )}

      {engine.phase === 'incoming-ringing' && engine.call && (
        <IncomingCallModal
          callerName={peerName}
          callerAvatar={peerAvatarUrl}
          type={engine.call.type}
          ringtoneId={callSettings?.ringtone}
          ringtoneVolume={callSettings?.volume}
          onAccept={engine.acceptIncoming}
          onReject={engine.rejectIncoming}
        />
      )}

      {(engine.phase === 'permission-prompt' || engine.phase === 'permission-blocked') && engine.call && (
        <PermissionGate
          mode={engine.phase === 'permission-blocked' ? 'blocked' : 'prompt'}
          type={engine.call.type}
          peerName={peerName}
          onAllow={engine.phase === 'permission-blocked' ? engine.recheckPermission : engine.confirmPermissionAndConnect}
          onCancel={engine.hangup}
        />
      )}

      {(engine.phase === 'outgoing-ringing' || engine.phase === 'connecting' || engine.phase === 'in-call') && engine.call && (
        <CallScreen
          phase={engine.phase}
          type={engine.call.type}
          peerName={peerName}
          peerAvatar={peerAvatarUrl}
          onSendCallReaction={sendCallReaction}
          incomingReaction={incomingReaction}
          localStream={engine.localStream}
          remoteStream={engine.remoteStream}
          isMuted={engine.isMuted}
          isCameraOff={engine.isCameraOff}
          isOnHold={engine.isOnHold}
          canSwitchCamera={engine.canSwitchCamera}
          callDurationSec={engine.callDurationSec}
          error={engine.error}
          networkQuality={engine.networkQuality}
          backgroundBlurEnabled={engine.backgroundBlurEnabled}
          backgroundBlurIntensity={engine.backgroundBlurIntensity}
          onSetBackgroundBlur={engine.setBackgroundBlur}
          selectedCallEffectId={engine.selectedCallEffectId}
          callEffectIntensity={engine.callEffectIntensity}
          onSetCallEffect={engine.setCallEffect}
          ringtoneId={callSettings?.ringtone}
          ringtoneVolume={callSettings?.volume}
          onEnd={engine.phase === 'outgoing-ringing' ? engine.cancelOutgoing : engine.hangup}
          onToggleMute={engine.toggleMute}
          onToggleCamera={engine.toggleCamera}
          onSwitchCamera={engine.switchCamera}
          onToggleHold={engine.toggleHold}
        />
      )}
    </CallContext.Provider>
  )
}
