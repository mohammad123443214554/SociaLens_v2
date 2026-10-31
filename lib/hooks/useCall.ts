'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { RING_TIMEOUT_MS } from '@/lib/utils/webrtc'
import { getAvatarUrl } from '@/lib/utils/helpers'
import { canAccessByPrivacy } from '@/lib/utils/privacyAccess'
import { pauseRingtone, resumeRingtone } from '@/lib/utils/ringtone'

export type CallType = 'audio' | 'video'
export type CallStatus = 'ringing' | 'accepted' | 'rejected' | 'missed' | 'ended' | 'cancelled' | 'busy'
export type CallProviderName = 'agora' | 'daily'

export interface CallRow {
  id: string
  chat_id: string | null
  caller_id: string
  callee_id: string
  type: CallType
  status: CallStatus
  created_at: string
  started_at: string | null
  ended_at: string | null
  ended_by?: string | null
  is_on_hold?: boolean | null
}

interface PeerProfile {
  id: string
  username: string
  avatar_url: string | null
  is_verified?: boolean
  verification_type?: 'blue' | 'yellow' | null
}

export type CallPhase = 'idle' | 'outgoing-ringing' | 'incoming-ringing' | 'connecting' | 'permission-prompt' | 'permission-blocked' | 'in-call'

/**
 * How many times a join may be retried after Agora reports UID_CONFLICT.
 * Each retry asks the SERVER for a fresh uid + a token minted for that uid,
 * so uid/token/channel can never drift apart - see /api/calls/connect.
 */
const MAX_JOIN_ATTEMPTS = 3
/** Long enough for Agora to drop a connection that died with a page reload. */
const JOIN_RETRY_DELAY_MS = 1500

function describeCallError(err: any, context: 'media' | 'connect'): string {
  if (context === 'media') {
    if (err?.name === 'NotAllowedError' || err?.message?.includes('Permission')) {
      return "Camera/microphone access was denied. Please allow access in your browser's site settings and try again."
    }
    if (err?.name === 'NotFoundError') return 'No camera or microphone was found on this device.'
    if (err?.name === 'NotReadableError') return 'Your camera/microphone is already in use by another app.'
    if (!navigator.mediaDevices?.getUserMedia) {
      return 'This browser (or this connection) does not support calls. Calling needs a modern browser over HTTPS.'
    }
    const detail = err?.message || err?.code || err?.name
    return detail ? `Could not connect the call: ${detail}` : 'Could not access your camera/microphone.'
  }
  const msg = String(err?.message || '')
  if (msg.includes('AGORA_APP_ID') || msg.includes('AGORA_APP_CERTIFICATE')) {
    return 'Calling isn\'t fully set up yet - Agora API keys are missing from the server environment variables.'
  }
  if (msg.includes('DAILY_API_KEY') || msg.includes('DAILY_DOMAIN')) {
    return 'Calling isn\'t fully set up yet - Daily API keys are missing from the server environment variables.'
  }
  if (msg.includes('does not exist') || msg.includes('schema cache') || err?.code === '42P01') {
    return 'Calling isn\'t set up on the server yet - the "calls" database table is missing. Run supabase-migration-calls-v2.sql in the Supabase SQL Editor.'
  }
  return msg || 'Could not connect the call.'
}

/** Adds a track to a persistent MediaStream, replacing any existing track of the same kind. */
function upsertTrack(stream: MediaStream, track: MediaStreamTrack) {
  stream.getTracks().filter((t) => t.kind === track.kind).forEach((t) => stream.removeTrack(t))
  stream.addTrack(track)
}
function removeTracksOfKind(stream: MediaStream, kind: string) {
  stream.getTracks().filter((t) => t.kind === kind).forEach((t) => stream.removeTrack(t))
}

type CallAnnouncement = 'unanswered' | 'rejected' | 'busy' | 'on-hold' | 'resumed'

const CALL_ANNOUNCEMENT_FILES: Record<CallAnnouncement, string> = {
  unanswered: 'call-unanswered.mp3',
  rejected: 'call-rejected.mp3',
  busy: 'call-user-busy.mp3',
  'on-hold': 'call-on-hold.mp3',
  resumed: 'call-resumed.mp3',
}

function playCallAnnouncement(fileName: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  pauseRingtone()
  return new Promise((resolve) => {
    const audio = new Audio(`/audio/calls/${fileName}`)
    audio.preload = 'auto'
    audio.volume = 1
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      audio.onended = null
      audio.onerror = null
      resumeRingtone()
      resolve()
    }
    audio.onended = finish
    audio.onerror = () => {
      console.warn(`[SociaLens Call] announcement audio unavailable: ${fileName}`)
      finish()
    }
    void audio.play().catch((error) => {
      console.warn('[SociaLens Call] voice announcement playback was blocked', error)
      finish()
    })
  })
}

/**
 * Drives one call end-to-end:
 *  - Global listener for incoming calls (works from any page, not just chat)
 *  - call lifecycle (ring timeout, accept, reject, cancel, hangup) via the
 *    "calls" Supabase table + realtime, same as before
 *  - the actual audio/video transport, via Agora.io (primary) or Daily.co
 *    (automatic fallback once Agora's free minutes for the month are used
 *    up) - see /api/calls/connect for how that's decided server-side
 *
 * Mounted once, high up in the tree (see CallProvider), so an incoming
 * call can interrupt whatever page the person is currently on.
 */
export function useCallEngine(currentUserId?: string) {
  const supabase = createClient()

  const [phase, setPhase] = useState<CallPhase>('idle')
  const [call, setCall] = useState<CallRow | null>(null)
  const [peer, setPeer] = useState<PeerProfile | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isCameraOff, setIsCameraOff] = useState(false)
  const [isOnHold, setIsOnHold] = useState(false)
  const [callDurationSec, setCallDurationSec] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const localStreamObjRef = useRef<MediaStream>(new MediaStream())
  const remoteStreamObjRef = useRef<MediaStream>(new MediaStream())
  const agoraRef = useRef<{ client: any; audioTrack: any; videoTrack: any } | null>(null)
  const dailyRef = useRef<any>(null)
  const providerRef = useRef<CallProviderName | null>(null)
  const startedAtMsRef = useRef<number | null>(null)

  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const callRef = useRef<CallRow | null>(null)
  const pendingCallRef = useRef<CallRow | null>(null)
  const remoteLeftTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const connectingCallIdRef = useRef<string | null>(null)
  const roleRef = useRef<'caller' | 'callee' | null>(null)
  const loggedCallIdsRef = useRef<Set<string>>(new Set())
  const connectionSetupRef = useRef<Map<string, Promise<{ info: any; agoraModule: any; dailyModule?: any }>>>(new Map())
  const transportCleanupRef = useRef(false)
  const announcedCallEventsRef = useRef<Map<string, Promise<void>>>(new Map())

  useEffect(() => { callRef.current = call }, [call])
  useEffect(() => { console.log('[SociaLens Call] phase changed ->', phase) }, [phase])

  const clearRingTimeout = () => { if (ringTimeoutRef.current) { clearTimeout(ringTimeoutRef.current); ringTimeoutRef.current = null } }
  const clearDurationTimer = () => { if (durationIntervalRef.current) { clearInterval(durationIntervalRef.current); durationIntervalRef.current = null } }
  const clearRemoteLeftTimeout = () => { if (remoteLeftTimeoutRef.current) { clearTimeout(remoteLeftTimeoutRef.current); remoteLeftTimeoutRef.current = null } }

  const announceCallEvent = useCallback((callId: string, event: CallAnnouncement): Promise<void> => {
    const key = `${callId}:${event}`
    const existing = announcedCallEventsRef.current.get(key)
    if (existing) return existing
    const playback = playCallAnnouncement(CALL_ANNOUNCEMENT_FILES[event])
    announcedCallEventsRef.current.set(key, playback)
    return playback
  }, [])

  const reportUsageAndCleanupTransport = useCallback(async () => {
    const activeCall = callRef.current
    const provider = providerRef.current
    if (activeCall && provider && startedAtMsRef.current) {
      const seconds = Math.round((Date.now() - startedAtMsRef.current) / 1000)
      try {
        await fetch('/api/calls/end', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callId: activeCall.id, durationSeconds: seconds }),
        })
      } catch { /* best-effort - never block hangup on this */ }
    }

    if (agoraRef.current) {
      const { client, audioTrack, videoTrack } = agoraRef.current
      try { audioTrack?.close() } catch {}
      try { videoTrack?.close() } catch {}
      try { await client.leave() } catch {}
      agoraRef.current = null
    }
    if (dailyRef.current) {
      try { await dailyRef.current.leave() } catch {}
      try { dailyRef.current.destroy() } catch {}
      dailyRef.current = null
    }
    providerRef.current = null
    startedAtMsRef.current = null
  }, [])

  /**
   * Tears the transport down WITHOUT reporting usage or logging anything -
   * for failure paths, where the call never actually started. The important
   * part is client.leave(): a client that joined but never published still
   * occupies its uid in the channel, and any retry would then collide with
   * itself (AgoraRTCError UID_CONFLICT).
   */
  const teardownTransportSilently = useCallback(async () => {
    if (agoraRef.current) {
      const { client, audioTrack, videoTrack } = agoraRef.current
      try { audioTrack?.close() } catch {}
      try { videoTrack?.close() } catch {}
      try { await client.leave() } catch {}
      agoraRef.current = null
    }
    if (dailyRef.current) {
      try { await dailyRef.current.leave() } catch {}
      try { dailyRef.current.destroy() } catch {}
      dailyRef.current = null
    }
    providerRef.current = null
  }, [])

  // Logs a finished call into the chat as a message, like a normal phone
  // app does ("Voice call - 2:14", "Missed call", etc). Only the caller's
  // side writes this (mirroring how only the caller's usage gets counted
  // above) so a call never ends up logged twice - whichever side actually
  // hangs up, the caller's own listener always eventually notices the
  // final status and logs it exactly once.
  const logCallToChat = async (call: CallRow, status: CallStatus) => {
    if (!call.chat_id || loggedCallIdsRef.current.has(call.id)) return
    loggedCallIdsRef.current.add(call.id)
    const durationSec = startedAtMsRef.current ? Math.round((Date.now() - startedAtMsRef.current) / 1000) : 0
    const outcome = durationSec > 0 ? 'completed' : status
    try {
      await supabase.from('messages').insert({
        chat_id: call.chat_id,
        sender_id: call.caller_id,
        content: JSON.stringify({ callType: call.type, outcome, durationSec, callerId: call.caller_id, calleeId: call.callee_id, endedBy: call.ended_by ?? null }),
        media_type: 'call',
      })
      // Also update the chat list preview - without this a call never
      // shows up there at all, only inside the conversation itself.
      const callLabel = call.type === 'video' ? '📹 Video call' : '📞 Voice call'
      const callKind = call.type === 'video' ? 'video' : 'voice'
      const preview =
        outcome === 'completed' ? callLabel
        : outcome === 'missed' ? `📞 Missed ${callKind} call`
        : outcome === 'rejected' ? `${call.type === 'video' ? 'Video' : 'Voice'} call declined`
        : outcome === 'cancelled' ? `${call.type === 'video' ? 'Video' : 'Voice'} call cancelled`
        : callLabel
      await supabase
        .from('chats')
        .update({
          last_message: preview,
          last_message_time: new Date().toISOString(),
          last_message_type: 'call',
          last_message_sender_id: call.caller_id,
        })
        .eq('id', call.chat_id)
    } catch (e) {
      console.error('[SociaLens Call] failed to log call to chat', e)
    }
  }

  // Full teardown - stops media, tears down whichever provider is active,
  // and resets every piece of state back to idle. Used whenever a call
  // ends for ANY reason (hangup, reject, cancel, timeout, error).
  const cleanup = useCallback((logStatus?: CallStatus) => {
    transportCleanupRef.current = true
    const callToLog = callRef.current
    if (callToLog) {
      for (const key of connectionSetupRef.current.keys()) {
        if (key.startsWith(`${callToLog.id}:`)) connectionSetupRef.current.delete(key)
      }
    }
    if (callToLog && logStatus && roleRef.current === 'caller') {
      void logCallToChat(callToLog, logStatus)
    }

    clearRingTimeout()
    clearDurationTimer()
    clearRemoteLeftTimeout()
    void reportUsageAndCleanupTransport()

    localStreamObjRef.current.getTracks().forEach((t) => { t.stop(); localStreamObjRef.current.removeTrack(t) })
    remoteStreamObjRef.current.getTracks().forEach((t) => remoteStreamObjRef.current.removeTrack(t))

    roleRef.current = null
    pendingCallRef.current = null
    connectingCallIdRef.current = null
    setLocalStream(null)
    setRemoteStream(null)
    setCall(null)
    setPeer(null)
    setPhase('idle')
    setIsMuted(false)
    setIsCameraOff(false)
    setIsOnHold(false)
    setCallDurationSec(0)
  }, [reportUsageAndCleanupTransport])

  const updateCallStatus = useCallback(async (callId: string, patch: Partial<Pick<CallRow, 'status' | 'started_at' | 'ended_at' | 'ended_by' | 'is_on_hold'>>) => {
    await supabase.from('calls').update(patch).eq('id', callId)
  }, [])

  // Warm signed provider credentials and SDK while the call is ringing.
  // No microphone or camera is opened until the user accepts.
  const prepareConnection = useCallback((activeCall: CallRow, attempt = 0) => {
    const key = `${activeCall.id}:${attempt}`
    const cached = connectionSetupRef.current.get(key)
    if (cached) return cached

    const setup = (async () => {
      const [res, agoraModule] = await Promise.all([
        fetch('/api/calls/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callId: activeCall.id, attempt }),
        }),
        import('agora-rtc-sdk-ng'),
      ])
      const info = await res.json()
      if (!res.ok) throw new Error(info?.error || 'Could not prepare the call.')
      const dailyModule = info.provider === 'daily' ? await import('@daily-co/daily-js') : undefined
      return { info, agoraModule, dailyModule }
    })().catch((err) => {
      connectionSetupRef.current.delete(key)
      throw err
    })
    connectionSetupRef.current.set(key, setup)
    return setup
  }, [])

  // ------------------------------------------------------------------
  // Joins the actual audio/video transport (Agora or Daily, whichever
  // /api/calls/connect decides) once both sides have accepted the call.
  // ------------------------------------------------------------------
  const doConnectMedia = useCallback(async (activeCall: CallRow) => {
    setPhase('connecting')

    // One join attempt, deliberately ordered:
    //   1. acquire microphone (and camera) FIRST
    //   2. only then create the Agora client and join the channel
    //   3. only then publish
    //
    // The previous order (join -> then ask for the mic) is the direct cause
    // of AgoraRTCError UID_CONFLICT in the Android app. When the mic request
    // failed there, the catch below did `setPhase('permission-blocked');
    // return` and left behind a client that had ALREADY joined the channel.
    // "Allow microphone" / "I've fixed it - Try Again" then called back into
    // this same function, which built a SECOND client and asked it to join
    // the SAME channel with the SAME uid. Agora refuses that, correctly.
    // Acquiring media first means a permission failure happens before
    // anything has joined, so there is never a ghost to collide with.
    const attemptConnect = async (attempt: number): Promise<void> => {
      const { info, agoraModule, dailyModule } = await prepareConnection(activeCall, attempt)
      providerRef.current = info.provider
      transportCleanupRef.current = false

      if (info.provider === 'agora') {
        const AgoraRTC = agoraModule.default

        // Acquire microphone and camera concurrently to reduce call setup
        // time. A camera failure is non-fatal: keep audio running and leave
        // the video surface blank instead of showing a red error banner.
        const audioPromise = AgoraRTC.createMicrophoneAudioTrack({
          encoderConfig: 'high_quality',
          AEC: true,
          ANS: true,
          AGC: true,
        })
        const videoPromise = activeCall.type === 'video'
          ? AgoraRTC.createCameraVideoTrack({ encoderConfig: '720p_1' }).catch((camErr: any) => {
              console.warn('[Agora] camera unavailable; keeping video surface blank', camErr)
              return null
            })
          : Promise.resolve(null)
        const [audioTrack, videoTrack] = await Promise.all([audioPromise, videoPromise])
        const closeTracks = () => {
          try { audioTrack?.close() } catch {}
          try { videoTrack?.close() } catch {}
        }

        // ---- 2. Client + handlers ----
        const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
        agoraRef.current = { client, audioTrack, videoTrack }

        client.on('user-published', async (remoteUser: any, mediaType: 'audio' | 'video') => {
          try {
            await client.subscribe(remoteUser, mediaType)
            const track = mediaType === 'audio' ? remoteUser.audioTrack : remoteUser.videoTrack
            if (track) {
              upsertTrack(remoteStreamObjRef.current, track.getMediaStreamTrack())
              setRemoteStream(new MediaStream(remoteStreamObjRef.current.getTracks()))
              setPhase('in-call')
              if (!startedAtMsRef.current) startedAtMsRef.current = Date.now()
            }
          } catch (subErr) {
            console.error('[Agora] subscribe failed', subErr)
          }
          // The other side is back - cancel any pending "they disconnected" grace timer.
          if (remoteLeftTimeoutRef.current) { clearTimeout(remoteLeftTimeoutRef.current); remoteLeftTimeoutRef.current = null }
        })
        client.on('user-unpublished', (_remoteUser: any, mediaType: 'audio' | 'video') => {
          removeTracksOfKind(remoteStreamObjRef.current, mediaType === 'audio' ? 'audio' : 'video')
        })
        // A transport-level user-left event is NOT a hangup. Mobile networks,
        // browser tab suspension and brief Wi-Fi/cellular handoffs can make
        // Agora temporarily remove a peer. Keep the call session alive and
        // let Agora reconnect; only the explicit Supabase call status (when
        // a participant presses End) is allowed to finish the call.
        client.on('user-left', async (remoteUser: any) => {
          console.warn('[Agora] remote participant left; verifying call-session status', remoteUser?.uid)
          removeTracksOfKind(remoteStreamObjRef.current, 'video')
          removeTracksOfKind(remoteStreamObjRef.current, 'audio')
          setRemoteStream(new MediaStream(remoteStreamObjRef.current.getTracks()))

          // Agora can report a temporary mobile-network handoff as user-left.
          // A deliberate hangup updates the call row before leaving; a
          // transient transport drop leaves the row in accepted state.
          try {
            const { data: latest } = await supabase
              .from('calls')
              .select('*')
              .eq('id', activeCall.id)
              .maybeSingle()
            if (latest && ['rejected', 'missed', 'cancelled', 'busy', 'ended'].includes(latest.status)) {
              callRef.current = { ...activeCall, ...latest } as CallRow
              setCall(callRef.current)
              cleanup(latest.status as CallStatus)
            }
          } catch (statusError) {
            console.warn('[Agora] could not verify remote leave; keeping call session active', statusError)
          }
        })
        client.on('connection-state-change', (curState: string, _prevState: string, reason: string) => {
          console.log('[Agora] connection state ->', curState, reason)
        })

        // ---- 3. Join. uid + token both come from the server response and
        // are never touched here - they are minted as a matching pair. ----
        try {
          await client.join(info.appId, info.channel, info.token, info.uid)
        } catch (joinErr: any) {
          // Never leave a half-joined client behind, whatever went wrong.
          try { await client.leave() } catch {}
          agoraRef.current = null

          // UID_CONFLICT is not suppressed or hidden - it is handled for
          // what it actually means: a PREVIOUS session belonging to this
          // same person is still registered in this channel on Agora's
          // side. In the APK that happens when the WebView reloads (a
          // notification tap) faster than Agora times the dead connection
          // out. The fix is to ask the server for a brand-new uid AND a
          // token minted for that new uid, then retry - so uid, token and
          // channel always stay consistent, because the server always
          // issues them together.
          const detail = `${joinErr?.code ?? ''} ${joinErr?.message ?? ''}`
          if (/UID_CONFLICT/i.test(detail) && attempt < MAX_JOIN_ATTEMPTS) {
            console.warn('[Agora] UID_CONFLICT on attempt', attempt, '- retrying with a fresh server-issued uid')
            closeTracks()
            await new Promise((resolve) => setTimeout(resolve, JOIN_RETRY_DELAY_MS))
            return attemptConnect(attempt + 1)
          }
          closeTracks()
          throw joinErr
        }

        // ---- 4. Publish ----
        upsertTrack(localStreamObjRef.current, audioTrack.getMediaStreamTrack())
        if (videoTrack) upsertTrack(localStreamObjRef.current, videoTrack.getMediaStreamTrack())
        setLocalStream(localStreamObjRef.current)
        await client.publish([audioTrack, videoTrack].filter(Boolean))
      } else {
        const Daily = dailyModule?.default
        if (!Daily) throw new Error('Daily calling SDK could not be loaded.')
        const call = Daily.createCallObject({ subscribeToTracksAutomatically: true })
        dailyRef.current = call

        call.on('track-started', (ev: any) => {
          if (!ev?.track) return
          const targetStream = ev.participant?.local ? localStreamObjRef.current : remoteStreamObjRef.current
          upsertTrack(targetStream, ev.track)
          if (ev.participant?.local) setLocalStream(localStreamObjRef.current)
          else {
            setRemoteStream(new MediaStream(remoteStreamObjRef.current.getTracks()))
            setPhase('in-call')
            if (!startedAtMsRef.current) startedAtMsRef.current = Date.now()
          }
        })
        call.on('track-stopped', (ev: any) => {
          if (!ev?.track) return
          const targetStream = ev.participant?.local ? localStreamObjRef.current : remoteStreamObjRef.current
          targetStream.removeTrack(ev.track)
          if (!ev.participant?.local) {
            setRemoteStream(new MediaStream(remoteStreamObjRef.current.getTracks()))
          }
        })
        call.on('left-meeting', async () => {
          if (transportCleanupRef.current || dailyRef.current !== call) return
          try {
            const { data: latest } = await supabase
              .from('calls')
              .select('status, ended_by, ended_at')
              .eq('id', activeCall.id)
              .maybeSingle()
            if (latest && ['rejected', 'missed', 'cancelled', 'busy', 'ended'].includes(latest.status)) {
              callRef.current = { ...activeCall, ...latest } as CallRow
              cleanup(latest.status as CallStatus)
              return
            }
            if (latest?.status === 'accepted' && dailyRef.current === call) {
              console.warn('[Daily] unexpected room exit; attempting to rejoin active call')
              setPhase('connecting')
              try {
                await call.join({ url: info.roomUrl, token: info.token })
              } catch (rejoinError) {
                console.error('[Daily] automatic rejoin failed', rejoinError)
                setError('Call connection interrupted. Please check your internet and try again.')
              }
            }
          } catch (statusError) {
            console.warn('[Daily] could not verify room exit; keeping call active', statusError)
          }
        })
        call.on('error', (ev: any) => { console.error('[Daily] error', ev); setError(describeCallError(ev, 'connect')) })

        await call.join({ url: info.roomUrl, token: info.token })
        if (activeCall.type === 'audio') await call.setLocalVideo(false)
      }
    }

    try {
      await attemptConnect(0)
    } catch (initialError: any) {
      let err = initialError
      const errName = String(err?.name || '')
      const errMsg = String(err?.message || err?.code || '')
      const isMediaError = ['NotAllowedError', 'NotFoundError', 'NotReadableError'].includes(errName)
        || /permission|not allowed|notallowed|denied/i.test(errMsg)
        || !navigator.mediaDevices?.getUserMedia

      // Retry transient provider/network failures before ending the call.
      // A failed join/publish must not immediately turn into a permanent
      // "ended" call when the network only hiccupped during setup.
      const isRetryable = !isMediaError && /network|timeout|timed out|failed to fetch|operation_aborted|connection|gateway|temporar|unavailable/i.test(
        `${errName} ${errMsg} ${String(err?.code || '')}`
      )
      if (isRetryable) {
        for (let retry = 1; retry <= 2; retry += 1) {
          await teardownTransportSilently()
          await new Promise((resolve) => setTimeout(resolve, retry * 700))
          try {
            const { data: latest } = await supabase
              .from('calls')
              .select('status')
              .eq('id', activeCall.id)
              .maybeSingle()
            if (latest?.status !== 'accepted') break
            await attemptConnect(retry)
            return
          } catch (retryError: any) {
            err = retryError
            console.warn('[SociaLens Call] transient connection retry failed', retry, retryError)
          }
        }
      }

      console.error('connectMedia failed after retries', err)
      await teardownTransportSilently()
      connectingCallIdRef.current = null

      if (isMediaError) {
        pendingCallRef.current = activeCall
        setPhase('permission-blocked')
        return
      }
      const message = describeCallError(err, 'media')
      setError(message)
      await updateCallStatus(activeCall.id, { status: 'ended', ended_at: new Date().toISOString() })
      cleanup('ended')
    }
  }, [cleanup, updateCallStatus, teardownTransportSilently, prepareConnection])

  // Checks the browser's current camera/mic permission state (where the
  // Permissions API is available - Safari doesn't support querying
  // 'camera'/'microphone', in which case we just proceed straight to the
  // real request, which is exactly what happened before this existed).
  const checkMediaPermission = async (type: CallType): Promise<'granted' | 'prompt' | 'denied' | 'unknown'> => {
    if (!navigator.permissions?.query) return 'unknown'
    try {
      const mic = await navigator.permissions.query({ name: 'microphone' as PermissionName })
      if (mic.state === 'denied') return 'denied'
      if (type === 'audio') return mic.state as 'granted' | 'prompt'
      const cam = await navigator.permissions.query({ name: 'camera' as PermissionName })
      if (cam.state === 'denied') return 'denied'
      return (mic.state === 'granted' && cam.state === 'granted') ? 'granted' : 'prompt'
    } catch {
      return 'unknown'
    }
  }

  // Gatekeeper in front of doConnectMedia: if the browser has never been
  // asked before, show our own friendly explainer first (so people
  // understand why we're asking, before the real browser prompt appears -
  // people are far more likely to hit "Allow" that way). If access was
  // already explicitly blocked, there's no popup that can fix that - only
  // the person changing it in their browser's site settings can - so we
  // show clear instructions instead of just quietly failing.
  const connectMedia = useCallback(async (activeCall: CallRow) => {
    // The realtime listener and the polling backstop can both notice
    // "this call just got accepted" within moments of each other - without
    // this guard, that would spin up two Agora/Daily connections for the
    // same call, which then fight each other (this is what was producing
    // the "PeerConnection already disconnected" error). Whichever path
    // notices first claims the call id; the other becomes a no-op.
    if (connectingCallIdRef.current === activeCall.id) return
    connectingCallIdRef.current = activeCall.id
    // The caller's original "ringing" timeout (45s) must stop the moment
    // the call is actually accepted - otherwise it keeps counting down in
    // the background and force-ends a perfectly healthy call anywhere from
    // a few seconds to tens of seconds later, depending on how long the
    // callee took to pick up.
    clearRingTimeout()

    pendingCallRef.current = activeCall
    const state = await checkMediaPermission(activeCall.type)
    if (state === 'denied') {
      setPhase('permission-blocked')
      return
    }
    if (state === 'prompt') {
      setPhase('permission-prompt')
      return
    }
    await doConnectMedia(activeCall)
  }, [doConnectMedia])

  // Called when the person taps "Allow camera & microphone" on our
  // explainer screen - this click IS the user gesture the browser needs
  // to show its own native permission prompt.
  const confirmPermissionAndConnect = useCallback(async () => {
    if (!pendingCallRef.current) return
    await doConnectMedia(pendingCallRef.current)
  }, [doConnectMedia])

  // Called from the "I've fixed it" button on the blocked-access screen -
  // re-checks in case they just changed the site setting.
  const recheckPermission = useCallback(async () => {
    if (!pendingCallRef.current) return
    const state = await checkMediaPermission(pendingCallRef.current.type)
    if (state === 'denied') {
      setError('Still blocked. Make sure you reloaded the page after changing the browser setting.')
      return
    }
    if (state === 'prompt') {
      setPhase('permission-prompt')
      return
    }
    await doConnectMedia(pendingCallRef.current)
  }, [doConnectMedia])

  // ------------------------------------------------------------------
  // Outgoing call
  // ------------------------------------------------------------------
  const startCall = useCallback(async (calleeId: string, chatId: string | null, type: CallType, calleeProfile: PeerProfile) => {
    if (!currentUserId) return
    setError(null)
    roleRef.current = 'caller'
    try {
      // Call Privacy gate (Settings > Privacy > Call Privacy) - checked
      // before ever creating the call row, so a disallowed call never
      // even starts ringing on the other end.
      const { data: calleeProfileRow } = await supabase.from('profiles').select('call_privacy').eq('id', calleeId).single()
      const allowed = await canAccessByPrivacy(supabase, currentUserId, calleeId, (calleeProfileRow as any)?.call_privacy, 'call')
      if (!allowed) {
        setError("This person isn't accepting calls right now")
        roleRef.current = null
        return
      }

      console.log('[SociaLens Call] inserting call row into Supabase...', { calleeId, chatId, type })
      const { data: newCall, error: insertError } = await supabase
        .from('calls')
        .insert({ chat_id: chatId, caller_id: currentUserId, callee_id: calleeId, type, status: 'ringing' })
        .select()
        .single()
      console.log('[SociaLens Call] insert result', { newCall, insertError })
      if (insertError || !newCall) throw insertError || new Error('Could not start call')

      setCall(newCall as CallRow)
      setPeer(calleeProfile)
      setPhase('outgoing-ringing')
      console.log('[SociaLens Call] phase -> outgoing-ringing, call row:', newCall)

      // Prepare credentials and SDK while the callee is being notified.
      void prepareConnection(newCall as CallRow, 0).catch((prewarmError) => {
        console.warn('[SociaLens Call] connection pre-warm failed; will retry on accept', prewarmError)
      })

      // Fire-and-forget - notifies the callee with a system notification
      // even if they don't have SociaLens open right now.
      fetch('/api/push/notify-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: newCall.id }),
      }).catch(() => {})

      ringTimeoutRef.current = setTimeout(async () => {
        await updateCallStatus(newCall.id, { status: 'missed' })
        await announceCallEvent(newCall.id, 'unanswered')
        cleanup('missed')
      }, RING_TIMEOUT_MS)
    } catch (err: any) {
      console.error('[SociaLens Call] startCall failed', err)
      const message = describeCallError(err, 'connect')
      setError(message)
      cleanup()
    }
  }, [currentUserId, cleanup, updateCallStatus, prepareConnection, announceCallEvent])

  const cancelOutgoing = useCallback(async () => {
    if (!call) return
    await updateCallStatus(call.id, { status: 'cancelled', ended_at: new Date().toISOString(), ended_by: currentUserId ?? null })
    callRef.current = { ...call, status: 'cancelled', ended_at: new Date().toISOString(), ended_by: currentUserId ?? null }
    cleanup('cancelled')
  }, [call, cleanup, updateCallStatus, currentUserId])

  // ------------------------------------------------------------------
  // Incoming call
  // ------------------------------------------------------------------
  /**
   * Loads a call row straight from the database and puts it into local
   * state. This is what makes the Android notification's Accept button real:
   * after a cold start (or the WebView reloading), this client has no idea a
   * call is ringing, and waiting for the realtime INSERT event is hopeless -
   * that event fired before this page existed. The 4-second polling backstop
   * would eventually find it, but "eventually" is exactly how a caller ends
   * up seeing "not answered". So we fetch it directly, by id.
   *
   * Returns null unless the call really is still ringing AND really is
   * addressed to this user - the notification is never trusted on its own.
   */
  const hydrateIncomingCall = useCallback(async (callId: string): Promise<CallRow | null> => {
    if (!currentUserId) return null
    const { data } = await supabase.from('calls').select('*').eq('id', callId).single()
    const row = (data ?? null) as CallRow | null
    if (!row) return null
    if (row.callee_id !== currentUserId) return null
    if (row.status !== 'ringing') return null

    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, is_verified, verification_type')
      .eq('id', row.caller_id)
      .single()

    roleRef.current = 'callee'
    callRef.current = row
    setCall(row)
    setPeer(callerProfile as PeerProfile)
    return row
  }, [currentUserId])

  /**
   * Answers one specific existing call. Used by the in-app Accept button AND
   * by ?incomingCall=<id> (the Android notification action and public/sw.js
   * both land here), so there is exactly ONE accept path in the app - the
   * same one the working browser flow already used.
   */
  const acceptIncomingById = useCallback(async (callId: string): Promise<boolean> => {
    const known = callRef.current?.id === callId ? callRef.current : null
    const row = known ?? (await hydrateIncomingCall(callId))
    if (!row) {
      setError('That call has already ended.')
      return false
    }
    // The notification action and the on-screen button can both fire within
    // a moment of each other. Whichever gets here first claims the call;
    // the other must NOT start a second transport session.
    if (connectingCallIdRef.current === row.id) return true

    clearRingTimeout()
    roleRef.current = 'callee'
    try {
      await updateCallStatus(row.id, { status: 'accepted', started_at: new Date().toISOString() })
      const acceptedCall = { ...row, status: 'accepted' as CallStatus }
      callRef.current = acceptedCall
      setCall(acceptedCall)
      await connectMedia(acceptedCall)
      return true
    } catch (err: any) {
      console.error('acceptIncoming failed', err)
      setError(describeCallError(err, 'media'))
      await updateCallStatus(row.id, { status: 'rejected', ended_at: new Date().toISOString(), ended_by: currentUserId ?? null })
      cleanup()
      return false
    }
  }, [hydrateIncomingCall, updateCallStatus, connectMedia, cleanup, currentUserId])

  /**
   * Rejects one specific existing call. Goes through /api/calls/decline
   * because that works even when this client never had the call in state at
   * all (Decline tapped on the notification while the app was closed) - the
   * route re-checks on the server that this user really is the callee.
   * Falls back to a direct row update if the request itself fails.
   */
  const rejectIncomingById = useCallback(async (callId: string): Promise<void> => {
    try {
      const res = await fetch('/api/calls/decline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId }),
      })
      if (!res.ok) throw new Error('decline endpoint returned ' + res.status)
    } catch {
      await updateCallStatus(callId, { status: 'rejected', ended_at: new Date().toISOString(), ended_by: currentUserId ?? null })
    }
    if (callRef.current?.id === callId) {
      callRef.current = { ...callRef.current, status: 'rejected', ended_at: new Date().toISOString(), ended_by: currentUserId ?? null }
      cleanup('rejected')
    }
  }, [cleanup, updateCallStatus, currentUserId])

  const acceptIncoming = useCallback(async () => {
    const current = callRef.current
    if (!current) return
    await acceptIncomingById(current.id)
  }, [acceptIncomingById])

  const rejectIncoming = useCallback(async () => {
    const current = callRef.current
    if (!current) return
    await rejectIncomingById(current.id)
  }, [rejectIncomingById])

  const endCall = useCallback(async (finalStatus: CallStatus = 'ended') => {
    const current = callRef.current
    if (current) {
      const endedAt = new Date().toISOString()
      await updateCallStatus(current.id, { status: finalStatus, ended_at: endedAt, ended_by: currentUserId ?? null })
      callRef.current = { ...current, status: finalStatus, ended_at: endedAt, ended_by: currentUserId ?? null }
    }
    cleanup(finalStatus)
  }, [cleanup, currentUserId])

  const toggleMute = useCallback(() => {
    const next = !isMuted
    setIsMuted(next)
    const enabled = !next && !isOnHold
    if (agoraRef.current?.audioTrack) void agoraRef.current.audioTrack.setEnabled(enabled)
    if (dailyRef.current) void dailyRef.current.setLocalAudio(enabled)
  }, [isMuted, isOnHold])

  const toggleCamera = useCallback(() => {
    const next = !isCameraOff
    setIsCameraOff(next)
    const enabled = !next && !isOnHold
    if (agoraRef.current?.videoTrack) void agoraRef.current.videoTrack.setEnabled(enabled)
    if (dailyRef.current) void dailyRef.current.setLocalVideo(enabled)
  }, [isCameraOff, isOnHold])

  // Hold suspends this participant's outgoing media without leaving the
  // RTC room. The remote peer and call session stay connected; Resume
  // restores only the devices that were not already muted/disabled.
  const toggleHold = useCallback(() => {
    const next = !isOnHold
    setIsOnHold(next)
    const activeCall = callRef.current
    if (activeCall) void updateCallStatus(activeCall.id, { is_on_hold: next })
    const audioEnabled = !next && !isMuted
    const videoEnabled = !next && !isCameraOff
    if (agoraRef.current?.audioTrack) void agoraRef.current.audioTrack.setEnabled(audioEnabled)
    if (agoraRef.current?.videoTrack) void agoraRef.current.videoTrack.setEnabled(videoEnabled)
    if (dailyRef.current) {
      void dailyRef.current.setLocalAudio(audioEnabled)
      void dailyRef.current.setLocalVideo(videoEnabled)
    }
  }, [isOnHold, isMuted, isCameraOff, updateCallStatus])

  // Call duration timer, running once the transport is actually live.
  useEffect(() => {
    if (phase === 'in-call') {
      const startedAt = call?.started_at ? new Date(call.started_at).getTime() : Date.now()
      durationIntervalRef.current = setInterval(() => {
        setCallDurationSec(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
      }, 1000)
    } else {
      clearDurationTimer()
    }
    return clearDurationTimer
  }, [phase, call?.started_at])

  // ------------------------------------------------------------------
  // Global listeners - work from anywhere in the app, not just the chat
  // page, so a call can ring while someone's browsing the feed.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!currentUserId) return

    const channel = supabase
      .channel(`calls-listener:${currentUserId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'calls', filter: `callee_id=eq.${currentUserId}` },
        async (payload: any) => {
          const row = payload.new as CallRow
          if (row.status !== 'ringing') return

          // A second incoming call must not replace the call already shown
          // to this user. Mark the new caller as busy and let their caller
          // side play the dedicated busy announcement.
          const activeCall = callRef.current
          if (activeCall && activeCall.id !== row.id && ['ringing', 'accepted'].includes(activeCall.status)) {
            await updateCallStatus(row.id, {
              status: 'busy',
              ended_at: new Date().toISOString(),
              ended_by: currentUserId,
            })
            return
          }

          roleRef.current = 'callee'
          const { data: callerProfile } = await supabase
            .from('profiles')
            .select('id, username, avatar_url, is_verified, verification_type')
            .eq('id', row.caller_id)
            .single()
          setCall(row)
          setPeer(callerProfile as PeerProfile)
          setPhase('incoming-ringing')
          void prepareConnection(row, 0).catch((prewarmError) => {
            console.warn('[SociaLens Call] incoming connection pre-warm failed; will retry on accept', prewarmError)
          })

          ringTimeoutRef.current = setTimeout(() => cleanup(), RING_TIMEOUT_MS)
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'calls', filter: `caller_id=eq.${currentUserId}` },
        (payload: any) => handleStatusUpdate(payload.new as CallRow)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'calls', filter: `callee_id=eq.${currentUserId}` },
        (payload: any) => handleStatusUpdate(payload.new as CallRow)
      )
      .subscribe()

    function handleStatusUpdate(row: CallRow) {
      if (!callRef.current || row.id !== callRef.current.id) return
      const previous = callRef.current
      if (roleRef.current === 'caller' && row.is_on_hold !== previous.is_on_hold) {
        void announceCallEvent(row.id, row.is_on_hold ? 'on-hold' : 'resumed')
      }
      let terminalAnnouncement: CallAnnouncement | null = null
      if (roleRef.current === 'caller' && row.status !== previous.status) {
        if (row.status === 'rejected') terminalAnnouncement = 'rejected'
        else if (row.status === 'missed') terminalAnnouncement = 'unanswered'
        else if (row.status === 'busy') terminalAnnouncement = 'busy'
      }
      callRef.current = { ...previous, ...row }
      setCall((current) => current?.id === row.id ? { ...current, ...row } : current)

      if (row.status === 'accepted' && roleRef.current === 'caller') {
        const acceptedCall = { ...callRef.current, status: 'accepted' as CallStatus }
        setCall(acceptedCall)
        connectMedia(acceptedCall)
        return
      }
      if (['rejected', 'missed', 'cancelled', 'busy', 'ended'].includes(row.status)) {
        if (terminalAnnouncement) {
          void announceCallEvent(row.id, terminalAnnouncement).then(() => cleanup(row.status))
        } else {
          cleanup(row.status)
        }
      }
    }

    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId])

  // ------------------------------------------------------------------
  // Reliability backstop for the realtime listener above. Realtime
  // websockets can lag or get suspended (mobile browsers throttle
  // background tabs, network switches between wifi/cellular, etc.) - when
  // that happens, an incoming call can arrive late or not visibly at all.
  // This polls every few seconds as a safety net so a call is never
  // missed for more than a moment, even if the realtime event itself
  // never arrives. It's deliberately lightweight (one small query) and
  // only runs while idle or actively ringing, not during a live call.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!currentUserId) return

    const poll = async () => {
      // Catch a missed "someone is calling me" event - only relevant when
      // we're not already dealing with some other call.
      if (phase === 'idle') {
        const { data: incoming } = await supabase
          .from('calls')
          .select('*')
          .eq('callee_id', currentUserId)
          .eq('status', 'ringing')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (incoming && Date.now() - new Date(incoming.created_at).getTime() < RING_TIMEOUT_MS) {
          roleRef.current = 'callee'
          const { data: callerProfile } = await supabase
            .from('profiles')
            .select('id, username, avatar_url, is_verified, verification_type')
            .eq('id', incoming.caller_id)
            .single()
          setCall(incoming as CallRow)
          setPeer(callerProfile as PeerProfile)
          setPhase('incoming-ringing')
          void prepareConnection(incoming as CallRow, 0).catch((prewarmError) => {
            console.warn('[SociaLens Call] polled incoming connection pre-warm failed', prewarmError)
          })
          ringTimeoutRef.current = setTimeout(() => cleanup(), RING_TIMEOUT_MS - (Date.now() - new Date(incoming.created_at).getTime()))
        }
        return
      }

      // Catch a missed status change (callee accepted/rejected, caller
      // cancelled, etc) on whatever call is currently active - this needs
      // to run for the ENTIRE life of a call (ringing, connecting, in-call),
      // not just while idle - otherwise a caller stuck on "Ringing..."
      // never notices the callee already picked up if the realtime event
      // for it happens to get lost.
      const current = callRef.current
      if (current) {
        const { data: fresh } = await supabase.from('calls').select('status, ended_by, ended_at, is_on_hold').eq('id', current.id).single()
        if (fresh && (fresh.status !== current.status || fresh.is_on_hold !== current.is_on_hold)) {
          if (roleRef.current === 'caller' && fresh.is_on_hold !== current.is_on_hold) {
            void announceCallEvent(current.id, fresh.is_on_hold ? 'on-hold' : 'resumed')
          }
          let terminalAnnouncement: CallAnnouncement | null = null
          if (roleRef.current === 'caller' && fresh.status !== current.status) {
            if (fresh.status === 'rejected') terminalAnnouncement = 'rejected'
            else if (fresh.status === 'missed') terminalAnnouncement = 'unanswered'
            else if (fresh.status === 'busy') terminalAnnouncement = 'busy'
          }
          callRef.current = { ...current, ...fresh }
          setCall((existing) => existing?.id === current.id ? { ...existing, ...fresh } : existing)
          if (fresh.status === 'accepted' && fresh.status !== current.status && roleRef.current === 'caller') {
            const acceptedCall = { ...current, status: 'accepted' as CallStatus }
            setCall(acceptedCall)
            connectMedia(acceptedCall)
          } else if (['rejected', 'missed', 'cancelled', 'busy', 'ended'].includes(fresh.status)) {
            callRef.current = { ...current, ...fresh }
            setCall((existing) => existing?.id === current.id ? { ...existing, ...fresh } : existing)
            if (terminalAnnouncement) {
              void announceCallEvent(current.id, terminalAnnouncement).then(() => cleanup(fresh.status))
            } else {
              cleanup(fresh.status)
            }
          }
        }
      }
    }

    const intervalId = setInterval(poll, phase === 'in-call' ? 1500 : 4000)
    return () => clearInterval(intervalId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, phase])

  return {
    phase,
    call,
    peer,
    localStream,
    remoteStream,
    isMuted,
    isCameraOff,
    isOnHold,
    callDurationSec,
    error,
    startCall,
    cancelOutgoing,
    acceptIncoming,
    rejectIncoming,
    acceptIncomingById,
    rejectIncomingById,
    hangup: () => endCall('ended'),
    toggleMute,
    toggleCamera,
    toggleHold,
    confirmPermissionAndConnect,
    recheckPermission,
  }
}

export function peerAvatar(peer: PeerProfile | null) {
  return getAvatarUrl(peer?.avatar_url ?? null)
}
