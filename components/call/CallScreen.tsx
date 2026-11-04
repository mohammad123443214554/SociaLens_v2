'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Mic, MicOff, Video, VideoOff, PhoneOff, ShieldCheck, Sparkles, ArrowLeftRight, RefreshCw, PauseCircle, PlayCircle, Volume1, Volume2, Minimize2, Maximize2, Move, Lock, Unlock, MoreHorizontal, SmilePlus, Users, Search, Check } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { startRingtone, stopRingtone } from '@/lib/utils/ringtone'
import type { CallPhase, CallType } from '@/lib/hooks/useCall'
import { CALL_EFFECT_CATEGORIES, PART_TWO_FACE_PRESETS, PART_FOUR_LIGHTING_PRESETS, PART_FOUR_CREATIVE_PRESETS } from '@/lib/call-effects'
import { CallReactionLottie } from './CallReactionLottie'
import { CALL_REACTION_ALL_IDS, CALL_REACTION_CATEGORIES, CALL_REACTION_CUSTOM_OPTIONS, getCallReactionCategory, getCallReactionLabel, isCallReactionId, type CallReactionAssetId, type CallReactionCategoryId, type CallReactionId } from '@/lib/call-reactions'

type GroupCallMember = { id: string; username: string; fullName: string | null; avatarUrl: string | null; status: string }

interface CallScreenProps {
  userId: string
  phase: CallPhase
  type: CallType
  peerName: string
  peerId?: string | null
  peerAvatar: string
  onSendCallReaction: (reaction: CallReactionId) => Promise<void>
  groupCallId?: string | null
  groupParticipants?: GroupCallMember[]
  speakerMode?: boolean
  onToggleSpeakerMode?: () => void
  onAddPeopleToGroup?: (userIds: string[]) => Promise<void>
  incomingReaction: { id: string; reaction: CallReactionId } | null
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  isMuted: boolean
  isCameraOff: boolean
  isOnHold: boolean
  canSwitchCamera: boolean
  callDurationSec: number
  error: string | null
  networkQuality: 'excellent' | 'good' | 'weak' | 'unknown'
  ringtoneId?: string
  ringtoneVolume?: number
  onEnd: () => void
  onToggleMute: () => void
  onToggleCamera: () => void
  onSwitchCamera: () => void
  onToggleHold: () => void
  backgroundBlurEnabled: boolean
  backgroundBlurIntensity: number
  onSetBackgroundBlur: (enabled: boolean, intensity: number) => Promise<void>
  selectedCallEffectId: string | null
  callEffectIntensity: number
  onSetCallEffect: (effectId: string | null, intensity?: number) => Promise<void>
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = Math.floor(sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function CallScreen({
  userId, phase, type, peerName, peerId = null, peerAvatar, localStream, remoteStream, onSendCallReaction, incomingReaction,
  groupCallId = null, groupParticipants = [], speakerMode, onToggleSpeakerMode, onAddPeopleToGroup,
  isMuted, isCameraOff, isOnHold, canSwitchCamera, callDurationSec, error, networkQuality, ringtoneId, ringtoneVolume,
  onEnd, onToggleMute, onToggleCamera, onSwitchCamera, onToggleHold,
  backgroundBlurEnabled, backgroundBlurIntensity, onSetBackgroundBlur,
  selectedCallEffectId, callEffectIntensity, onSetCallEffect,
}: CallScreenProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const remoteAudioRef = useRef<HTMLAudioElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioGainRef = useRef<GainNode | null>(null)
  const pipVideoRef = useRef<HTMLVideoElement>(null)
  const [localVideoIsMain, setLocalVideoIsMain] = useState(false)
  const [isSpeakerOn, setIsSpeakerOn] = useState(false)
  const [isScreenLocked, setIsScreenLocked] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [addPeopleOpen, setAddPeopleOpen] = useState(false)
  const [messageContacts, setMessageContacts] = useState<Array<{id:string;username:string;fullName:string|null;avatarUrl:string|null}>>([])
  const [selectedInvitees, setSelectedInvitees] = useState<string[]>([])
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [sendingInvites, setSendingInvites] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false)
  const [recipientPickerOpen, setRecipientPickerOpen] = useState(false)
  const [pendingGroupReaction, setPendingGroupReaction] = useState<CallReactionId | null>(null)
  const [selectedGroupReactionRecipients, setSelectedGroupReactionRecipients] = useState<string[]>([])
  const [sendingGroupReaction, setSendingGroupReaction] = useState(false)
  const [heartReactionId, setHeartReactionId] = useState(0)
  const [heartBurstId, setHeartBurstId] = useState(0)
  const [lottieReaction, setLottieReaction] = useState<{ id: string; reaction: CallReactionAssetId } | null>(null)
  const [reactionSearch, setReactionSearch] = useState('')
  const [reactionCategory, setReactionCategory] = useState<CallReactionCategoryId>('all')
  const [recentReactionIds, setRecentReactionIds] = useState<CallReactionId[]>([])
  const reactionScrollRef = useRef<HTMLDivElement>(null)
  const recentStorageKey = `socialens:call-reactions:recent:${userId}`

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(recentStorageKey)
      const parsed: unknown = saved ? JSON.parse(saved) : []
      setRecentReactionIds(Array.isArray(parsed) ? parsed.filter(isCallReactionId).slice(0, 24) : [])
    } catch {
      setRecentReactionIds([])
    }
  }, [recentStorageKey])

  useLayoutEffect(() => {
    if (reactionScrollRef.current) reactionScrollRef.current.scrollTop = 0
  }, [reactionCategory, reactionSearch, reactionPickerOpen])

  const [effectsMenuOpen, setEffectsMenuOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [effectsCategory, setEffectsCategory] = useState('natural-beauty')
  const [draftEffectId, setDraftEffectId] = useState<string | null>(selectedCallEffectId)
  const [effectDraftIntensity, setEffectDraftIntensity] = useState(callEffectIntensity)
  const [effectSaving, setEffectSaving] = useState(false)
  const [effectError, setEffectError] = useState<string | null>(null)
  const [blurPopupOpen, setBlurPopupOpen] = useState(false)
  const [blurDraft, setBlurDraft] = useState(backgroundBlurIntensity)
  const [blurSaving, setBlurSaving] = useState(false)
  const [blurError, setBlurError] = useState<string | null>(null)
  useEffect(() => {
    if (!incomingReaction) return
    switch (incomingReaction.reaction) {
      case 'flying-heart':
        setHeartReactionId((value) => value + 1)
        break
      case 'heart-burst':
        setHeartBurstId((value) => value + 1)
        break
      default:
        setLottieReaction({ id: incomingReaction.id, reaction: incomingReaction.reaction })
    }
  }, [incomingReaction?.id])

  useEffect(() => {
    const activeReactionId = lottieReaction?.id
    if (!activeReactionId) return
    const timer = window.setTimeout(() => {
      setLottieReaction((current) => current?.id === activeReactionId ? null : current)
    }, 5600)
    return () => window.clearTimeout(timer)
  }, [lottieReaction?.id])

  const joinedGroupReactionRecipients = groupParticipants.filter((person) => person.status === 'joined' && person.id !== userId)

  const triggerCallReaction = (reaction: CallReactionId) => {
    if (groupCallId && phase === 'in-call') {
      if (!joinedGroupReactionRecipients.length) return
      setPendingGroupReaction(reaction)
      setSelectedGroupReactionRecipients(joinedGroupReactionRecipients.map((person) => person.id))
      setReactionPickerOpen(false)
      setReactionSearch('')
      setRecipientPickerOpen(true)
      return
    }
    switch (reaction) {
      case 'flying-heart':
        setHeartReactionId((value) => value + 1)
        break
      case 'heart-burst':
        setHeartBurstId((value) => value + 1)
        break
      default: {
        const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`
        setLottieReaction({ id, reaction })
      }
    }
    setRecentReactionIds((current) => {
      const next = [reaction, ...current.filter((id) => id !== reaction)].slice(0, 24)
      try { window.localStorage.setItem(recentStorageKey, JSON.stringify(next)) } catch {}
      return next
    })
    void onSendCallReaction(reaction)
    setReactionPickerOpen(false)
    setReactionSearch('')
  }

  const sendGroupReaction = async () => {
    if (!groupCallId || !pendingGroupReaction || !selectedGroupReactionRecipients.length || sendingGroupReaction) return
    setSendingGroupReaction(true)
    try {
      const response = await fetch(`/api/group-calls/${groupCallId}/reactions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reaction: pendingGroupReaction, recipientIds: selectedGroupReactionRecipients }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not send reaction')
      setRecipientPickerOpen(false); setPendingGroupReaction(null); setSelectedGroupReactionRecipients([])
    } catch (error) { console.error('[CallScreen] group reaction delivery failed', error) }
    finally { setSendingGroupReaction(false) }
  }

  const allCallEffects = [...PART_TWO_FACE_PRESETS, ...PART_FOUR_LIGHTING_PRESETS, ...PART_FOUR_CREATIVE_PRESETS]
  const visibleCallEffects = allCallEffects.filter((effect) => effect.categoryId === effectsCategory)
  const activeCallEffect = allCallEffects.find((effect) => effect.id === draftEffectId) ?? null
  const availableEffectCategories = CALL_EFFECT_CATEGORIES.filter((category) => category.id !== 'makeup' && category.id !== 'eye-lenses')

  const [isMini, setIsMini] = useState(false)
  const [miniSize, setMiniSize] = useState(300)
  const [miniPosition, setMiniPosition] = useState<{ x: number; y: number } | null>(null)
  const gestureRef = useRef<{ kind: 'drag' | 'resize'; pointerId: number; startX: number; startY: number; startLeft: number; startTop: number; startWidth: number } | null>(null)

  const startMiniGesture = (event: React.PointerEvent<HTMLElement>, kind: 'drag' | 'resize') => {
    if (!isMini || (event.target as HTMLElement).closest('button')) return
    if (kind === 'drag' && (event.target as HTMLElement).closest('[data-mini-resize]')) return
    const rect = event.currentTarget.parentElement?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect()
    event.preventDefault()
    gestureRef.current = {
      kind, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      startLeft: miniPosition?.x ?? Math.max(8, window.innerWidth - miniSize - 12),
      startTop: miniPosition?.y ?? Math.max(8, window.innerHeight - Math.round(miniSize * 1.33) - 80),
      startWidth: miniSize,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveMiniGesture = (event: React.PointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current
    if (!isMini || !gesture || gesture.pointerId !== event.pointerId) return
    const dx = event.clientX - gesture.startX
    const dy = event.clientY - gesture.startY
    if (gesture.kind === 'drag') {
      const height = Math.round(miniSize * 1.33)
      setMiniPosition({
        x: Math.max(8, Math.min(window.innerWidth - miniSize - 8, gesture.startLeft + dx)),
        y: Math.max(8, Math.min(window.innerHeight - height - 8, gesture.startTop + dy)),
      })
    } else {
      const nextWidth = Math.max(220, Math.min(480, gesture.startWidth + dx + dy * 0.35))
      setMiniSize(nextWidth)
      setMiniPosition({
        x: Math.max(8, Math.min(window.innerWidth - nextWidth - 8, gesture.startLeft)),
        y: Math.max(8, Math.min(window.innerHeight - Math.round(nextWidth * 1.33) - 8, gesture.startTop)),
      })
    }
  }
  const endMiniGesture = (event: React.PointerEvent<HTMLElement>) => {
    if (gestureRef.current?.pointerId === event.pointerId) gestureRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const cycleMiniSize = () => setMiniSize((size) => size < 280 ? 320 : size < 380 ? 420 : 240)

  const localVideoAvailable = Boolean(!isCameraOff && !isOnHold && localStream?.getVideoTracks().some((track) => track.readyState === 'live'))
  const remoteVideoAvailable = Boolean(remoteStream?.getVideoTracks().some((track) => track.readyState === 'live'))

  // Detach the preview stream immediately when camera is disabled/held. This
  // prevents the last captured frame from remaining visible in either view.
  useLayoutEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localVideoAvailable ? localStream : null
      if (localVideoAvailable) void localVideoRef.current.play().catch(() => {})
    }
  }, [localStream, localVideoAvailable])

  useLayoutEffect(() => {
    if (type === 'video' && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteVideoAvailable ? remoteStream : null
      if (remoteVideoAvailable) void remoteVideoRef.current.play().catch(() => {})
    }
  }, [remoteStream, remoteVideoAvailable, type])

  useEffect(() => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream
      remoteAudioRef.current.volume = 1
      remoteAudioRef.current.muted = false
    }

    // "play-and-record" asks supported mobile browsers to use a phone-call
    // audio route (often the earpiece). Speaker mode switches to playback.
    // This API is not available in every browser, so keep a safe fallback.
    const audioSession = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
    const applyAudioRoute = () => {
      if (!audioSession) return
      try { audioSession.type = isSpeakerOn ? 'playback' : 'play-and-record' } catch {}
    }
    applyAudioRoute()

    let disposed = false
    let source: MediaStreamAudioSourceNode | null = null
    let context: AudioContext | null = null
    const connectAudio = async () => {
      if (!remoteStream?.getAudioTracks().length) return
      try {
        const AudioContextClass = window.AudioContext
        if (!AudioContextClass) return
        context = new AudioContextClass()
        source = context.createMediaStreamSource(remoteStream)
        const gain = context.createGain()
        gain.gain.value = isSpeakerOn ? 2.2 : 0.55
        source.connect(gain)
        gain.connect(context.destination)
        audioContextRef.current = context
        audioGainRef.current = gain
        await context.resume()
        if (disposed) return
        if (context.state === 'running' && remoteAudioRef.current) {
          remoteAudioRef.current.muted = true
        } else {
          try { source.disconnect() } catch {}
          audioContextRef.current = null
          audioGainRef.current = null
          if (remoteAudioRef.current) {
            remoteAudioRef.current.muted = false
            remoteAudioRef.current.volume = isSpeakerOn ? 1 : 0.55
          }
          await context.close().catch(() => {})
          context = null
        }
      } catch (audioError) {
        console.warn('[Call] Web Audio routing unavailable; using native audio playback', audioError)
        if (remoteAudioRef.current) {
          remoteAudioRef.current.muted = false
          remoteAudioRef.current.volume = isSpeakerOn ? 1 : 0.55
        }
      }
    }
    void connectAudio()
    return () => {
      disposed = true
      try { source?.disconnect() } catch {}
      if (audioContextRef.current === context) audioContextRef.current = null
      audioGainRef.current = null
      if (context && context.state !== 'closed') void context.close().catch(() => {})
      if (remoteAudioRef.current) remoteAudioRef.current.muted = false
    }
  }, [remoteStream, type, isSpeakerOn])

  useEffect(() => {
    if (audioGainRef.current) audioGainRef.current.gain.setTargetAtTime(isSpeakerOn ? 2.2 : 0.55, audioContextRef.current?.currentTime ?? 0, 0.08)
    if (!audioGainRef.current && remoteAudioRef.current) remoteAudioRef.current.volume = isSpeakerOn ? 1 : 0.55
    const audioSession = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
    if (audioSession) {
      try { audioSession.type = isSpeakerOn ? 'playback' : 'play-and-record' } catch {}
    }
  }, [isSpeakerOn, remoteStream])

  useLayoutEffect(() => {
    if (type !== 'video' || !pipVideoRef.current) return
    const pipShowsRemote = localVideoIsMain
    const pipStream = pipShowsRemote
      ? (remoteVideoAvailable ? remoteStream : null)
      : (localVideoAvailable ? localStream : null)
    pipVideoRef.current.srcObject = pipStream
    if (pipStream) void pipVideoRef.current.play().catch(() => {})
  }, [localStream, remoteStream, localVideoIsMain, localVideoAvailable, remoteVideoAvailable, type])

  // Ringback tone while we're the caller waiting for pickup.
  useEffect(() => {
    if (phase === 'outgoing-ringing') {
      startRingtone(ringtoneId, ringtoneVolume)
      return () => stopRingtone()
    }
  }, [phase, ringtoneId, ringtoneVolume])

  const statusText =
    error ? error :
    phase === 'outgoing-ringing' ? 'Ringing...' :
    phase === 'connecting' ? 'Connecting...' :
    phase === 'in-call' ? (isOnHold ? `On hold · ${formatDuration(callDurationSec)}` : formatDuration(callDurationSec)) : ''

  const isVideoCall = type === 'video'
  const showRemoteVideo = isVideoCall && remoteVideoAvailable && phase === 'in-call'

  return (
    <div
      className={isMini ? "fixed z-[250] flex flex-col text-white overflow-hidden rounded-2xl border border-white/20 bg-neutral-950 shadow-2xl select-none" : "fixed inset-0 bg-neutral-950 z-[200] flex flex-col text-white overflow-hidden"}
      style={isMini ? { width: miniSize, height: Math.round(miniSize * 1.33), left: miniPosition?.x, top: miniPosition?.y, right: miniPosition ? undefined : 12, bottom: miniPosition ? undefined : 80, touchAction: 'none' } : undefined}
      onPointerDown={(event) => { if (isMini) startMiniGesture(event, 'drag') }}
      onPointerMove={moveMiniGesture}
      onPointerUp={endMiniGesture}
      onPointerCancel={endMiniGesture}
    >
      {/* Portrait video stage: full-screen on phones, phone-shaped and centered on laptops. */}
      {isVideoCall && (
        <div className={`absolute overflow-hidden bg-black ${isMini
          ? 'inset-0'
          : 'inset-0 md:inset-auto md:top-[44%] md:left-1/2 md:right-auto md:bottom-auto md:w-[min(34vw,420px,39.375vh)] md:aspect-[9/16] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:ring-1 md:ring-white/20 md:shadow-2xl'}`}>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            muted
            style={{ objectFit: "cover", objectPosition: "center center", backgroundColor: "#000" }}
            className={`absolute inset-0 block h-full w-full object-cover object-center bg-black ${showRemoteVideo && !localVideoIsMain ? 'opacity-100' : 'opacity-0'}`}
          />
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={{ objectFit: "cover", objectPosition: "center center", backgroundColor: "#000" }}
            className={`absolute inset-0 block h-full w-full object-cover object-center bg-black transition-opacity duration-150 ${localVideoIsMain && localVideoAvailable ? 'opacity-100 scale-x-[-1]' : 'opacity-0 pointer-events-none'}`}
          />
          <div className={`absolute z-20 overflow-hidden rounded-xl bg-neutral-900 shadow-lg ring-2 ring-white/25 ${isMini ? "bottom-16 right-2 h-20 w-16" : "bottom-44 left-3 h-32 w-24 sm:h-36 sm:w-28 md:bottom-5 md:left-4"}`}>
            {canSwitchCamera && (
              <button
                type="button"
                onClick={onSwitchCamera}
                disabled={isCameraOff || isOnHold}
                aria-label="Switch front or back camera"
                title="Switch front or back camera"
                className="absolute top-1.5 left-1.5 z-30 flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white hover:bg-black/85 disabled:opacity-40"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setLocalVideoIsMain((current) => !current)}
              aria-label="Swap video positions"
              title="Swap video positions"
              className="absolute top-1.5 right-1.5 z-30 flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white hover:bg-black/85"
            >
              <ArrowLeftRight className="h-4 w-4" />
            </button>
            <video
              ref={pipVideoRef}
              autoPlay
              playsInline
              muted
              style={{ objectFit: "cover", objectPosition: "center center", backgroundColor: "#000" }}
              className={`block h-full w-full bg-black object-cover object-center ${localVideoIsMain ? '' : 'scale-x-[-1]'}`}
            />
          </div>
          {!isMini && !showRemoteVideo && (
            <div className="absolute inset-x-3 top-5 z-10 hidden flex-col items-center gap-3 text-center md:flex">
              <Avatar className="h-28 w-28 ring-4 ring-pink-500/30 shadow-2xl shadow-pink-500/20">
                <AvatarImage src={peerAvatar || undefined} alt={groupCallId ? "Group call participant" : peerName} />
                <AvatarFallback className="bg-gradient-to-br from-pink-500 to-purple-600 text-4xl">{peerName[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <h2 className="text-xl font-bold drop-shadow-lg">{peerName}</h2>
              <p className={`text-sm drop-shadow-lg ${error ? 'text-red-400' : 'text-white/65'}`}>{statusText}</p>
            </div>
          )}
        </div>
      )}
      {lottieReaction && (
        <div key={lottieReaction.id} className="pointer-events-none fixed inset-0 z-[183] flex items-center justify-center overflow-hidden" aria-label={`${lottieReaction.reaction} call reaction`} role="img">
          <CallReactionLottie
            reaction={lottieReaction.reaction}
            loop
            className="h-[min(72vw,520px)] w-[min(72vw,520px)] drop-shadow-[0_12px_30px_rgba(255,105,180,0.28)]"
          />
        </div>
      )}
      {heartReactionId > 0 && (
        <div key={`flying-${heartReactionId}`} className="pointer-events-none fixed inset-0 z-[180] overflow-hidden" aria-live="off">
          <style>{`
            @keyframes socia-heart-flight {
              0% { left: -12%; top: 72%; transform: translate3d(0,18px,0) rotate(-18deg) scale(.55); opacity: 0; }
              10% { opacity: 1; }
              48% { top: 28%; transform: translate3d(0,0,0) rotate(8deg) scale(1.08); }
              88% { opacity: 1; }
              100% { left: 112%; top: 43%; transform: translate3d(0,-12px,0) rotate(18deg) scale(.72); opacity: 0; }
            }
            @keyframes socia-heart-wing-left { 0%,100% { transform:rotate(-12deg) scaleY(.82); } 50% { transform:rotate(22deg) scaleY(1.12); } }
            @keyframes socia-heart-wing-right { 0%,100% { transform:rotate(12deg) scaleY(.82); } 50% { transform:rotate(-22deg) scaleY(1.12); } }
            .socia-heart-flight { position:absolute; width:76px; height:76px; animation:socia-heart-flight 5.6s linear both; filter:drop-shadow(0 8px 18px rgba(255,70,145,.45)); }
            .socia-heart-wing-left { transform-origin:100% 55%; animation:socia-heart-wing-left .22s ease-in-out infinite; }
            .socia-heart-wing-right { transform-origin:0 55%; animation:socia-heart-wing-right .22s ease-in-out infinite; }
          `}</style>
          <div className="socia-heart-flight" aria-label="Flying heart reaction" role="img" onAnimationEnd={(event) => { if (event.target === event.currentTarget && event.animationName === 'socia-heart-flight') setHeartReactionId(0) }}>
            <svg viewBox="0 0 100 100" className="h-full w-full" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path className="socia-heart-wing-left" d="M43 48 C23 14 2 22 13 42 C19 53 31 57 43 58" fill="#FFE6F1" stroke="#FF8DBB" strokeWidth="2.5"/>
              <path className="socia-heart-wing-right" d="M57 48 C77 14 98 22 87 42 C81 53 69 57 57 58" fill="#FFE6F1" stroke="#FF8DBB" strokeWidth="2.5"/>
              <path d="M50 86 C42 78 18 61 18 42 C18 20 44 15 50 35 C56 15 82 20 82 42 C82 61 58 78 50 86Z" fill="#FF4F91" stroke="#FFD1E3" strokeWidth="3"/>
              <path d="M31 39 C33 29 43 27 47 35" stroke="#FFEAF3" strokeWidth="4" strokeLinecap="round" opacity=".9"/>
              <path d="M24 19 L19 12 M76 18 L82 11 M50 8 V2" stroke="#FFC2DB" strokeWidth="3" strokeLinecap="round"/>
            </svg>
          </div>
        </div>
      )}
      {heartBurstId > 0 && (
        <div key={`burst-${heartBurstId}`} className="pointer-events-none fixed inset-0 z-[181] overflow-hidden" aria-label="Heart burst reaction" role="img">
          <style>{`
            @keyframes socia-burst-heart-flight {
              0% { left:-12%; top:72%; opacity:0; transform:translate3d(0,18px,0) rotate(-18deg) scale(.55); }
              8% { opacity:1; }
              22% { left:22%; top:48%; transform:translate3d(0,0,0) rotate(10deg) scale(.92); }
              39% { left:46%; top:18%; transform:translate3d(0,0,0) rotate(-8deg) scale(1.08); }
              57% { left:72%; top:39%; transform:translate3d(0,0,0) rotate(14deg) scale(.96); }
              73% { left:82%; top:70%; transform:translate3d(0,0,0) rotate(-5deg) scale(1.1); }
              88% { left:50%; top:50%; opacity:1; transform:translate(-50%,-50%) rotate(0deg) scale(1.18); }
              94% { left:50%; top:50%; opacity:1; transform:translate(-50%,-50%) rotate(0deg) scale(1.42); }
              100% { left:50%; top:50%; opacity:0; transform:translate(-50%,-50%) rotate(0deg) scale(.25); }
            }
            @keyframes socia-heart-burst-particle {
              0% { opacity:0; transform:translate(-50%,-50%) scale(.18) rotate(-18deg); }
              9% { opacity:1; }
              76% { opacity:1; }
              100% { opacity:0; transform:translate(calc(-50% + var(--burst-x)),calc(-50% + var(--burst-y))) scale(var(--burst-scale)) rotate(var(--burst-rotate)); }
            }
            @keyframes socia-heart-wing-left { 0%,100% { transform:rotate(-12deg) scaleY(.82); } 50% { transform:rotate(22deg) scaleY(1.12); } }
            @keyframes socia-heart-wing-right { 0%,100% { transform:rotate(12deg) scaleY(.82); } 50% { transform:rotate(-22deg) scaleY(1.12); } }
            .socia-burst-heart-flight { position:absolute; width:clamp(82px,14vw,158px); height:clamp(82px,14vw,158px); animation:socia-burst-heart-flight 4.8s cubic-bezier(.42,0,.58,1) both; filter:drop-shadow(0 8px 22px rgba(255,70,145,.58)); }
            .socia-burst-wing-left { transform-origin:100% 55%; animation:socia-heart-wing-left .22s ease-in-out infinite; }
            .socia-burst-wing-right { transform-origin:0 55%; animation:socia-heart-wing-right .22s ease-in-out infinite; }
            .socia-heart-particle { position:absolute; left:50%; top:50%; display:block; width:clamp(25px,3.6vw,42px); height:clamp(25px,3.6vw,42px); animation:socia-heart-burst-particle 3.8s cubic-bezier(.16,.72,.24,1) both; animation-delay:4.8s; will-change:transform,opacity; filter:drop-shadow(0 3px 8px rgba(255,70,145,.42)); }
            .socia-particle-wing-left { transform-origin:100% 55%; animation:socia-heart-wing-left .22s ease-in-out infinite; }
            .socia-particle-wing-right { transform-origin:0 55%; animation:socia-heart-wing-right .22s ease-in-out infinite; }
          `}</style>
          <div className="socia-burst-heart-flight" aria-label="Flying heart burst" role="img">
            <svg viewBox="0 0 100 100" className="h-full w-full" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path className="socia-burst-wing-left" d="M43 48 C23 14 2 22 13 42 C19 53 31 57 43 58" fill="#FFE6F1" stroke="#FF8DBB" strokeWidth="2.5"/>
              <path className="socia-burst-wing-right" d="M57 48 C77 14 98 22 87 42 C81 53 69 57 57 58" fill="#FFE6F1" stroke="#FF8DBB" strokeWidth="2.5"/>
              <path d="M50 86 C42 78 18 61 18 42 C18 20 44 15 50 35 C56 15 82 20 82 42 C82 61 58 78 50 86Z" fill="#FF4F91" stroke="#FFD1E3" strokeWidth="3"/>
              <path d="M31 39 C33 29 43 27 47 35" stroke="#FFEAF3" strokeWidth="4" strokeLinecap="round" opacity=".9"/>
              <path d="M24 19 L19 12 M76 18 L82 11 M50 8 V2" stroke="#FFC2DB" strokeWidth="3" strokeLinecap="round"/>
            </svg>
          </div>
          {[
            [-58,-42,.9,-25],[-43,-58,1.05,18],[-24,-64,.82,-12],[-4,-68,1.1,24],[18,-64,.92,-18],[40,-55,1.08,16],[59,-38,.88,-22],
            [66,-16,1.12,12],[68,8,.94,-20],[61,34,1.08,18],[45,54,.86,-14],[24,66,1.12,22],[0,70,.94,-10],[-25,65,1.08,18],
            [-47,53,.9,-20],[-63,34,1.12,12],[-69,10,.86,28],[-68,-15,1.04,-26],[-51,-2,.92,16],[-38,20,1.1,-16],
            [-34,-28,.86,24],[-14,-42,1.05,-18],[12,-43,.9,14],[35,-28,1.12,-24],[43,0,.84,18],[34,28,1.06,-12],
            [12,43,.92,22],[-13,42,1.1,-20],[-39,31,.86,14],[-48,-22,1.08,-18],[-18,8,.94,20],[20,10,1.1,-14],
            [-5,25,.88,16],[54,18,1.04,-22],[-56,0,.92,12],[5,-22,1.12,-18],[-28,54,.9,22],[29,56,1.06,-16],
            [70,-48,.86,18],[-72,48,1.1,-20]
          ].map(([x,y,scale,rotate], index) => (
            <span key={index} className="socia-heart-particle" style={{
              ['--burst-x' as string]: `${x * 1.25}vw`,
              ['--burst-y' as string]: `${y * 1.05}vh`,
              ['--burst-scale' as string]: scale,
              ['--burst-rotate' as string]: `${rotate}deg`,
            } as React.CSSProperties} onAnimationEnd={() => { if (index === 39) setHeartBurstId(0) }}>
              <svg viewBox="0 0 100 100" className="h-full w-full" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path className="socia-particle-wing-left" d="M43 48 C23 14 2 22 13 42 C19 53 31 57 43 58" fill="#FFE6F1" stroke="#FF8DBB" strokeWidth="2.5"/>
                <path className="socia-particle-wing-right" d="M57 48 C77 14 98 22 87 42 C81 53 69 57 57 58" fill="#FFE6F1" stroke="#FF8DBB" strokeWidth="2.5"/>
                <path d="M50 86 C42 78 18 61 18 42 C18 20 44 15 50 35 C56 15 82 20 82 42 C82 61 58 78 50 86Z" fill="#FF4F91" stroke="#FFD1E3" strokeWidth="3"/>
                <path d="M31 39 C33 29 43 27 47 35" stroke="#FFEAF3" strokeWidth="4" strokeLinecap="round" opacity=".9"/>
                <path d="M24 19 L19 12 M76 18 L82 11 M50 8 V2" stroke="#FFC2DB" strokeWidth="3" strokeLinecap="round"/>
              </svg>
            </span>
          ))}
        </div>
      )}

      <audio ref={remoteAudioRef} autoPlay className="hidden" />

      {/* Keep remote camera image unfiltered; controls have their own contrast. */}

      {/* Top bar - SociaLens branded, mirrors a normal call app's header */}
      <div className={isMini ? "relative z-30 flex items-center justify-start px-2 pt-2 pointer-events-none" : "relative z-30 flex items-center justify-center px-5 pt-5"}>
        <div className="flex items-center gap-1.5 text-xs text-white/70">
          {isMini ? <Move className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          <span>{isMini ? peerName : "SociaLens secure call"}</span>
          {!isMini && groupCallId && phase === 'in-call' && <span className="ml-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">Group Call</span>}
          {!isMini && phase === 'in-call' && (
            <span className={`ml-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
              networkQuality === 'excellent' ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-300' :
              networkQuality === 'good' ? 'border-yellow-400/30 bg-yellow-500/15 text-yellow-200' :
              networkQuality === 'weak' ? 'border-red-400/30 bg-red-500/15 text-red-300' :
              'border-white/20 bg-white/10 text-white/65'
            }`} aria-live="polite">
              <span className={`h-1.5 w-1.5 rounded-full ${networkQuality === 'excellent' ? 'bg-emerald-400' : networkQuality === 'good' ? 'bg-yellow-300' : networkQuality === 'weak' ? 'bg-red-400' : 'bg-white/50'}`} />
              {networkQuality === 'excellent' ? 'Excellent' : networkQuality === 'good' ? 'Good' : networkQuality === 'weak' ? 'Weak' : 'Checking connection'}
            </span>
          )}
          {isMini && <span className="text-white/50">{statusText}</span>}
        </div>
      </div>
      <button type="button" onClick={() => { setIsMini((v) => !v); setMiniPosition(null) }} className="absolute top-3 right-3 z-[80] h-9 w-9 rounded-full bg-black/55 hover:bg-black/75 border border-white/20 flex items-center justify-center" aria-label={isMini ? "Expand call screen" : "Minimize call screen"} title={isMini ? "Expand call screen" : "Minimize call screen"}>
        {isMini ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
      </button>
      {isMini && <>
        <div data-mini-resize className="absolute z-[70] top-0 right-0 h-8 w-8 cursor-nesw-resize touch-none" onPointerDown={(event) => { event.stopPropagation(); startMiniGesture(event, 'resize') }} onDoubleClick={cycleMiniSize} onContextMenu={(event) => { event.preventDefault(); cycleMiniSize() }} />
        <div data-mini-resize className="absolute z-[70] right-0 bottom-0 h-10 w-10 cursor-nwse-resize touch-none" onPointerDown={(event) => { event.stopPropagation(); startMiniGesture(event, 'resize') }} onDoubleClick={cycleMiniSize} onContextMenu={(event) => { event.preventDefault(); cycleMiniSize() }} />
        <div data-mini-resize className="absolute z-[70] right-0 top-8 bottom-10 w-2 cursor-ew-resize touch-none" onPointerDown={(event) => { event.stopPropagation(); startMiniGesture(event, 'resize') }} />
        <div data-mini-resize className="absolute z-[70] left-0 right-10 bottom-0 h-2 cursor-ns-resize touch-none" onPointerDown={(event) => { event.stopPropagation(); startMiniGesture(event, 'resize') }} />
      </>}

      {/* Audio calls keep the centered profile layout. On phones the existing
          full-screen video-call profile placement is retained; desktop video
          calls render the profile inside the portrait video stage above. */}
      {(!isVideoCall || showRemoteVideo || isMini || (isVideoCall && !showRemoteVideo)) && (!groupCallId || phase === 'in-call') && (
        <div className={`relative z-10 flex flex-col items-center gap-3 transition-all duration-300 ${
          showRemoteVideo ? (isMini ? 'pt-1' : 'pt-6') : 'flex-1 justify-center'
        } ${isVideoCall && !showRemoteVideo ? 'md:hidden' : ''}`}>
          {!showRemoteVideo && (
            <Avatar className={`${isMini ? "h-16 w-16" : "h-32 w-32"} ring-4 ring-pink-500/30 shadow-2xl shadow-pink-500/10 ${isVideoCall && !isMini ? 'md:hidden' : ''}`}>
              <AvatarImage src={peerAvatar || undefined} alt={peerName} />
              <AvatarFallback className="text-4xl bg-gradient-to-br from-pink-500 to-purple-600">{peerName?.[0]?.toUpperCase() || 'S'}</AvatarFallback>
            </Avatar>
          )}
          <h2 className={`font-bold ${isMini ? 'text-sm' : showRemoteVideo ? 'text-lg drop-shadow-lg' : 'text-2xl'}`}>{groupCallId ? 'Group Call' : peerName}</h2>
          {groupCallId && <div className="flex max-w-[min(90vw,420px)] items-center justify-center -space-x-2">
            {groupParticipants.filter((person) => person.status === 'joined').slice(0,10).map((person) => (
              <Avatar key={person.id} className="h-8 w-8 border-2 border-neutral-950">
                <AvatarImage src={person.avatarUrl || undefined} />
                <AvatarFallback className="bg-gradient-to-br from-pink-500 to-purple-600 text-[10px]">{(person.fullName || person.username).slice(0,1).toUpperCase()}</AvatarFallback>
              </Avatar>
            ))}
          </div>}
          <p className={`text-sm ${error ? 'text-red-400' : 'text-white/60'}`}>{statusText}</p>
        </div>
      )}

      {!showRemoteVideo && (!isVideoCall || isMini) && <div className="flex-1" />}



      {/* Video and PiP are rendered together inside the responsive portrait stage above. */}

      {/* Controls */}
      <div className={`relative z-10 ${isMini ? "flex flex-wrap items-center justify-center gap-1 px-1 pb-2 pt-1" : "mx-auto mt-auto grid w-full max-w-[320px] grid-cols-4 justify-items-center gap-x-2 gap-y-3 px-2 pb-12 pt-6 sm:gap-x-3 md:mx-0 md:flex md:w-auto md:max-w-none md:flex-nowrap md:items-center md:justify-center md:gap-4 md:px-4"} bg-gradient-to-t from-black/50 to-transparent`}>
        <div className="relative">
          <button type="button" onClick={() => { setMoreMenuOpen((open) => !open); setEffectsMenuOpen(false) }} aria-label="More call controls" aria-expanded={moreMenuOpen} title="More options" className={`h-11 w-11 sm:h-14 sm:w-14 rounded-full flex items-center justify-center border transition-all ${moreMenuOpen ? 'border-pink-200/30 bg-pink-300/[0.12] text-pink-50 shadow-[0_0_18px_rgba(255,105,180,0.08)]' : 'border-white/10 bg-white/10 hover:bg-white/15'}`}>
            <MoreHorizontal className="h-6 w-6" />
          </button>
          {moreMenuOpen && (
            <div className="absolute bottom-[calc(100%+14rem)] left-0 z-[110] w-[min(250px,calc(100vw-28px))] rounded-2xl border border-pink-100/[0.18] bg-white/[0.035] p-2 text-pink-50/95 shadow-[0_18px_55px_rgba(255,105,180,0.055)] backdrop-blur-[32px] supports-[backdrop-filter]:bg-white/[0.035] md:bottom-16">
              <p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-pink-100/55">Call controls</p>
              <button type="button" onClick={onToggleMute} className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-3 text-left text-sm transition-colors hover:border-pink-100/[0.12] hover:bg-pink-300/[0.07]">
                {isMuted ? <MicOff className="h-4 w-4 text-pink-200" /> : <Mic className="h-4 w-4" />}
                <span className="flex-1">{isMuted ? 'Turn microphone on' : 'Turn microphone off'}</span>
                <span className={`h-2 w-2 rounded-full ${isMuted ? 'bg-pink-300' : 'bg-white/25'}`} />
              </button>
              {isVideoCall && (
                <button type="button" onClick={onToggleCamera} className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-3 text-left text-sm transition-colors hover:border-pink-100/[0.12] hover:bg-pink-300/[0.07]">
                  {isCameraOff ? <VideoOff className="h-4 w-4 text-pink-200" /> : <Video className="h-4 w-4" />}
                  <span className="flex-1">{isCameraOff ? 'Turn camera on' : 'Turn camera off'}</span>
                  <span className={`h-2 w-2 rounded-full ${isCameraOff ? 'bg-pink-300' : 'bg-white/25'}`} />
                </button>
              )}
              <button type="button" onClick={() => { setIsScreenLocked(true); setMoreMenuOpen(false) }} className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-3 text-left text-sm transition-colors hover:border-pink-100/[0.12] hover:bg-pink-300/[0.07]">
                <Lock className="h-4 w-4" /><span className="flex-1">Lock screen</span>
              </button>
              {phase === 'in-call' && type === 'audio' && (
                <button type="button" onClick={async () => {
                  setMoreMenuOpen(false)
                  setInviteError(null)
                  setSelectedInvitees([])
                  setLoadingContacts(true)
                  try {
                    const response = await fetch('/api/group-calls/contacts', { cache: 'no-store' })
                    const data = await response.json()
                    if (!response.ok) throw new Error(data.error || 'Could not load message contacts')
                    setMessageContacts((data.contacts || []).filter((person: {id:string}) =>
                      person.id !== userId &&
                      person.id !== peerId &&
                      !groupParticipants.some((member) => member.id === person.id && ['joined','invited','ringing'].includes(member.status))
                    ))
                    setAddPeopleOpen(true)
                  } catch (error) {
                    setInviteError(error instanceof Error ? error.message : 'Could not load message contacts')
                    setAddPeopleOpen(true)
                  } finally {
                    setLoadingContacts(false)
                  }
                }} disabled={loadingContacts} className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-3 text-left text-sm transition-colors hover:border-pink-100/[0.12] hover:bg-pink-300/[0.07] disabled:opacity-50">
                  <Users className="h-4 w-4" /><span className="flex-1">{groupCallId ? 'Add more people' : 'Add people to group call'}</span><span className="text-pink-100/45">›</span>
                </button>
              )}
              <button type="button" onClick={() => { setReactionPickerOpen(true); setMoreMenuOpen(false) }} disabled={phase !== 'in-call' || isOnHold} className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-3 text-left text-sm transition-colors hover:border-pink-100/[0.12] hover:bg-pink-300/[0.07] disabled:opacity-40">
                <SmilePlus className="h-4 w-4" aria-hidden="true" /><span className="flex-1">Call reaction</span><span className="text-pink-100/45">›</span>
              </button>
              {isVideoCall && (
                <button type="button" onClick={() => { setEffectsMenuOpen(true); setMoreMenuOpen(false) }} disabled={isCameraOff || isOnHold || phase !== 'in-call'} className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-3 text-left text-sm transition-colors hover:border-pink-100/[0.12] hover:bg-pink-300/[0.07] disabled:opacity-40">
                  <Sparkles className="h-4 w-4" /><span className="flex-1">Effects</span><span className="text-pink-100/45">›</span>
                </button>
              )}
            </div>
          )}
          {isVideoCall && effectsMenuOpen && (
            <div className="absolute bottom-[calc(100%+14rem)] left-0 z-[110] w-[min(250px,calc(100vw-28px))] rounded-2xl border border-pink-100/[0.18] bg-white/[0.035] p-2 text-pink-50/95 shadow-[0_18px_55px_rgba(255,105,180,0.055)] backdrop-blur-[32px] supports-[backdrop-filter]:bg-white/[0.035] md:bottom-16">
              <div className="flex items-center justify-between px-3 pb-2 pt-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-pink-100/55">Effects</p>
                <button type="button" onClick={() => setEffectsMenuOpen(false)} className="rounded-full px-2 py-1 text-xs text-pink-50/65 hover:bg-pink-300/[0.08]" aria-label="Close effects menu">✕</button>
              </div>
              <button type="button" onClick={() => { setBlurDraft(backgroundBlurIntensity); setBlurError(null); setBlurPopupOpen(true); setEffectsMenuOpen(false) }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-pink-300/[0.07]">
                <Sparkles className="h-4 w-4" /><span className="flex-1">Background Blur</span><span className={`h-2 w-2 rounded-full ${backgroundBlurEnabled ? 'bg-pink-300' : 'bg-white/25'}`} />
              </button>
              <button type="button" onClick={() => { setDraftEffectId(selectedCallEffectId); setEffectDraftIntensity(callEffectIntensity); setEffectError(null); setFiltersOpen(true); setEffectsMenuOpen(false) }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-pink-300/[0.07]">
                <Sparkles className="h-4 w-4" /><span className="flex-1">Filters</span><span className="text-pink-100/45">›</span>
              </button>
            </div>
          )}
        </div>


        {groupCallId && type === 'audio' && <button type="button" onClick={onToggleMute} aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'} title={isMuted ? 'Unmute microphone' : 'Mute microphone'} className={`h-10 w-10 sm:h-14 sm:w-14 rounded-full flex items-center justify-center transition-colors ${isMuted ? 'bg-white text-neutral-900' : 'bg-white/15 hover:bg-white/25'}`}>
          {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
        </button>}

        <button type="button" onClick={() => onToggleSpeakerMode ? onToggleSpeakerMode() : setIsSpeakerOn((current) => !current)} aria-label={(speakerMode ?? isSpeakerOn) ? 'Speaker on' : 'Speaker off'} aria-pressed={speakerMode ?? isSpeakerOn} title={(speakerMode ?? isSpeakerOn) ? 'Speaker on · louder audio' : 'Speaker off · normal audio'} className={`h-10 w-10 sm:h-14 sm:w-14 rounded-full flex items-center justify-center transition-colors ${(speakerMode ?? isSpeakerOn) ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-lg shadow-pink-500/30' : 'bg-white/15 hover:bg-white/25'}`}>
          {(speakerMode ?? isSpeakerOn) ? <Volume2 className="h-6 w-6" /> : <Volume1 className="h-6 w-6" />}
        </button>



        <button onClick={onToggleHold} disabled={phase !== "in-call"} aria-label={isOnHold ? 'Resume call' : 'Hold call'} title={isOnHold ? 'Resume call' : 'Hold call'} className="h-11 w-11 sm:h-14 sm:w-14 rounded-full flex items-center justify-center transition-colors bg-white/15 hover:bg-white/25 disabled:opacity-40 disabled:cursor-not-allowed">
          {isOnHold ? <PlayCircle className="h-5 w-5 sm:h-6 sm:w-6" /> : <PauseCircle className="h-5 w-5 sm:h-6 sm:w-6" />}
        </button>

        <button onClick={onEnd} aria-label="End call" title="End call" className="h-11 w-11 sm:h-16 sm:w-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors shadow-lg shadow-red-500/30">
          <PhoneOff className="h-5 w-5 sm:h-7 sm:w-7" />
        </button>
      </div>


      {reactionPickerOpen && (
        <div
          className="absolute inset-0 z-[120] flex items-center justify-center bg-black/[0.16] p-4 backdrop-blur-[3px]"
          role="dialog"
          aria-modal="true"
          aria-label="Call reactions"
          onClick={(event) => { if (event.target === event.currentTarget) { setReactionPickerOpen(false); setReactionSearch('') } }}
        >
          <div
            className="flex max-h-[min(82vh,680px)] w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-pink-100/[0.18] bg-white/[0.035] p-5 text-pink-50/95 shadow-[0_18px_55px_rgba(255,105,180,0.055)] backdrop-blur-[32px] supports-[backdrop-filter]:bg-white/[0.035]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex shrink-0 items-center justify-between">
              <div>
                <h3 className="text-base font-semibold tracking-wide text-pink-50/95">Call reactions</h3>
                <p className="mt-1 text-xs text-pink-100/70">Choose an animated reaction to send</p>
              </div>
              <button type="button" onClick={() => { setReactionPickerOpen(false); setReactionSearch('') }} className="rounded-full border border-pink-100/[0.12] bg-pink-300/[0.05] p-2 text-pink-50/80 transition-colors hover:bg-pink-300/[0.09]" aria-label="Close call reactions">✕</button>
            </div>
            <div className="mb-3 shrink-0">
              <input
                type="search"
                value={reactionSearch}
                onChange={(event) => setReactionSearch(event.target.value)}
                placeholder="Search reactions"
                aria-label="Search call reactions"
                className="w-full rounded-xl border border-pink-100/[0.14] bg-white/[0.035] px-3 py-2.5 text-sm text-pink-50 outline-none placeholder:text-pink-100/40 focus:border-pink-200/35 focus:bg-pink-300/[0.06]"
              />
            </div>
            <div className="mb-3 shrink-0 overflow-x-auto overflow-y-hidden pb-1 [scrollbar-width:thin]">
              <div className="flex w-max min-w-full flex-nowrap gap-1.5">
                {CALL_REACTION_CATEGORIES.map((category) => (
                  <button key={category.id} type="button" onClick={() => setReactionCategory(category.id)} aria-pressed={reactionCategory === category.id} className={`flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-xl border px-3 text-[10px] font-medium leading-none transition-colors sm:text-[11px] ${reactionCategory === category.id ? "border-pink-200/35 bg-pink-300/[0.14] text-pink-50" : "border-pink-100/[0.13] bg-white/[0.025] text-pink-100/65 hover:bg-pink-200/[0.07]"}`}>
                    {category.label}
                  </button>
                ))}
              </div>
            </div>
            <div ref={reactionScrollRef} data-call-reaction-scroll className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]">
              {(() => {
                const query = reactionSearch.trim().toLowerCase()
                const candidates = reactionCategory === "recent" && !query ? recentReactionIds : CALL_REACTION_ALL_IDS.filter((id) => (query || reactionCategory === "all" || getCallReactionCategory(id) === reactionCategory) && getCallReactionLabel(id).toLowerCase().includes(query))
                const visibleIds = candidates.filter((id, index) => candidates.indexOf(id) === index)
                return visibleIds.length ? (
                  <div className="grid grid-cols-4 auto-rows-[92px] items-stretch gap-2 sm:grid-cols-5">
                    {visibleIds.map((id) => {
                      const custom = CALL_REACTION_CUSTOM_OPTIONS.find((item) => item.id === id)
                      return (
                        <button key={id} type="button" onClick={() => triggerCallReaction(id)} title={getCallReactionLabel(id)} aria-label={getCallReactionLabel(id)} className="flex h-[92px] min-h-[92px] min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-pink-100/[0.10] bg-pink-300/[0.045] px-1.5 py-2 text-center transition-colors hover:border-pink-200/25 hover:bg-pink-300/[0.10] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-200/50">
                          {custom ? <span className="flex h-10 w-10 shrink-0 items-center justify-center text-[30px] leading-none" aria-hidden="true">{custom.emoji}</span> : <CallReactionLottie reaction={id as CallReactionAssetId} loop className="h-10 w-10 shrink-0" />}
                          <span className="line-clamp-2 h-6 w-full overflow-hidden text-[10px] leading-3 text-pink-50/90">{getCallReactionLabel(id)}</span>
                        </button>
                      )
                    })}
                  </div>
                ) : <p className="px-3 py-10 text-center text-sm text-pink-100/55">{reactionCategory === "recent" && !query ? "Your recently sent reactions will appear here." : "No reactions found in this category."}</p>
              })()}
            </div>
            <p className="mt-3 shrink-0 border-t border-pink-100/[0.10] pt-3 text-center text-[10px] text-pink-100/45">287 animated reactions</p>
          </div>
        </div>
      )}

      {filtersOpen && isVideoCall && (
        <div className="absolute inset-0 z-[125] flex items-center justify-center bg-black/[0.16] p-4 backdrop-blur-[3px]" role="dialog" aria-modal="true" aria-label="Choose call filters">
          <div className="w-full max-w-lg max-h-[min(82vh,680px)] overflow-hidden rounded-3xl border border-pink-100/[0.18] bg-white/[0.035] p-4 sm:p-5 text-pink-50/95 shadow-[0_18px_55px_rgba(255,105,180,0.055)] backdrop-blur-[32px] supports-[backdrop-filter]:bg-white/[0.035]">
            <div className="mb-4 flex items-center justify-between">
              <div><h3 className="text-base font-semibold tracking-wide text-pink-50/95">Filters</h3><p className="mt-1 text-xs text-pink-100/65">Choose a look, then press Done to apply</p></div>
              <button type="button" onClick={() => setFiltersOpen(false)} className="rounded-full border border-pink-100/[0.12] bg-pink-300/[0.05] p-2 text-pink-50/80 transition-colors hover:bg-pink-300/[0.09]" aria-label="Close filters">✕</button>
            </div>
            <div className="mb-3 flex gap-1.5 overflow-x-auto pb-2">
              {availableEffectCategories.map((category) => (
                <button key={category.id} type="button" onClick={() => setEffectsCategory(category.id)} className={`shrink-0 rounded-full border px-3 py-2 text-[11px] font-medium backdrop-blur-xl transition-colors ${effectsCategory === category.id ? 'border-pink-200/35 bg-pink-300/[0.12] text-pink-50' : 'border-pink-100/[0.13] bg-white/[0.025] text-pink-100/65 hover:bg-pink-200/[0.07]'}`}>{category.label}</button>
              ))}
            </div>
            <div className="max-h-[min(46vh,390px)] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setDraftEffectId(null)} className={`rounded-xl border px-3 py-3 text-left backdrop-blur-xl transition-colors ${draftEffectId === null ? 'border-pink-200/35 bg-pink-300/[0.12]' : 'border-pink-100/[0.13] bg-white/[0.025] hover:bg-pink-200/[0.07]'}`}>
                  <span className="block text-xs font-semibold">No filter</span><span className="mt-1 block text-[10px] text-pink-100/55">Use original camera</span>
                </button>
                {visibleCallEffects.map((effect) => (
                  <button key={effect.id} type="button" onClick={() => { setDraftEffectId(effect.id); setEffectDraftIntensity(effect.defaultIntensity) }} className={`rounded-xl border px-3 py-3 text-left backdrop-blur-xl transition-colors ${draftEffectId === effect.id ? 'border-pink-200/35 bg-pink-300/[0.12]' : 'border-pink-100/[0.13] bg-white/[0.025] hover:bg-pink-200/[0.07]'}`}>
                    <span className="block text-xs font-semibold">{effect.name}</span><span className="mt-1 block text-[10px] leading-snug text-pink-100/55">{effect.description}</span>
                  </button>
                ))}
              </div>
            </div>
            {activeCallEffect && (
              <div className="mt-3 rounded-2xl border border-pink-300/[0.18] bg-pink-400/[0.08] p-3 backdrop-blur-xl">
                <div className="mb-2 flex items-center justify-between text-xs"><span className="font-medium">{activeCallEffect.name} intensity</span><span className="tabular-nums text-pink-100/75">{effectDraftIntensity}%</span></div>
                <input type="range" min="0" max="100" value={effectDraftIntensity} onChange={(event) => setEffectDraftIntensity(Number(event.target.value))} className="w-full cursor-pointer accent-pink-300" aria-label="Filter intensity" />
              </div>
            )}
            {effectError && <p className="mt-3 rounded-xl border border-red-300/20 bg-red-400/[0.08] px-3 py-2 text-xs text-red-200">{effectError}</p>}
            <div className="mt-4 flex gap-2 border-t border-pink-100/[0.10] pt-3">
              <button type="button" disabled={effectSaving} onClick={() => setFiltersOpen(false)} className="flex-1 rounded-xl border border-pink-100/[0.18] bg-white/[0.025] px-4 py-3 text-sm font-medium text-pink-50/90 backdrop-blur-xl transition-colors hover:bg-pink-200/[0.07] disabled:opacity-50">Cancel</button>
              <button type="button" disabled={effectSaving} onClick={async () => { setEffectSaving(true); setEffectError(null); try { await onSetCallEffect(draftEffectId, effectDraftIntensity); setFiltersOpen(false) } catch (error) { setEffectError(error instanceof Error ? error.message : 'Could not apply this filter.') } finally { setEffectSaving(false) } }} className="flex-1 rounded-xl border border-pink-200/[0.22] bg-pink-300/[0.10] px-4 py-3 text-sm font-semibold text-pink-50 shadow-[0_4px_18px_rgba(255,105,180,0.08)] backdrop-blur-xl transition-colors hover:bg-pink-300/[0.14] disabled:opacity-50">{effectSaving ? 'Applying…' : 'Done'}</button>
            </div>
          </div>
        </div>
      )}

      {blurPopupOpen && isVideoCall && (
        <div className="absolute inset-0 z-[120] flex items-center justify-center bg-black/[0.16] p-4 backdrop-blur-[3px]" role="dialog" aria-modal="true" aria-label="Background Blur settings">
          <div className="w-full max-w-sm rounded-3xl border border-pink-100/[0.18] bg-white/[0.035] p-5 text-pink-50/95 shadow-[0_18px_55px_rgba(255,105,180,0.055)] backdrop-blur-[32px] supports-[backdrop-filter]:bg-white/[0.035]">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold tracking-wide text-pink-50/95">Background Blur</h3>
                <p className="mt-1 text-xs text-pink-100/70">Adjust how strongly your background is blurred</p>
              </div>
              <button type="button" onClick={() => setBlurPopupOpen(false)} className="rounded-full border border-pink-100/[0.12] bg-pink-300/[0.05] p-2 text-pink-50/80 transition-colors hover:bg-pink-300/[0.09]" aria-label="Close settings">✕</button>
            </div>
            <div className="mb-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setBlurDraft(32)} aria-pressed={blurDraft <= 50} className={`rounded-xl border px-3 py-2.5 text-xs font-semibold text-pink-50/90 backdrop-blur-xl transition-all ${blurDraft <= 50 ? 'border-pink-200/35 bg-pink-300/[0.10] shadow-[0_0_18px_rgba(255,105,180,0.07)]' : 'border-pink-100/[0.13] bg-white/[0.025] hover:bg-pink-200/[0.07]'}`}>Natural Portrait</button>
              <button type="button" onClick={() => setBlurDraft(85)} aria-pressed={blurDraft > 50} className={`rounded-xl border px-3 py-2.5 text-xs font-semibold text-pink-50/90 backdrop-blur-xl transition-all ${blurDraft > 50 ? 'border-pink-200/35 bg-pink-300/[0.10] shadow-[0_0_18px_rgba(255,105,180,0.07)]' : 'border-pink-100/[0.13] bg-white/[0.025] hover:bg-pink-200/[0.07]'}`}>Strong Blur</button>
            </div>
            <div className="rounded-2xl border border-pink-300/[0.18] bg-pink-400/[0.10] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="font-medium text-pink-50/95">Blur intensity</span>
                <span className="rounded-lg border border-pink-100/[0.18] bg-pink-200/[0.08] px-2 py-1 font-semibold tabular-nums text-pink-50">{blurDraft}%</span>
              </div>
              <input type="range" min="0" max="100" step="1" value={blurDraft} onChange={(event) => setBlurDraft(Number(event.target.value))} className="w-full cursor-pointer accent-pink-300/70" aria-label="Blur intensity" />
              <div className="mt-1 flex justify-between text-[11px] text-pink-100/65"><span>Natural</span><span>Maximum</span></div>
            </div>
            {blurError && <p className="mt-3 rounded-xl border border-red-300/20 bg-red-400/[0.08] px-3 py-2 text-xs text-red-200">{blurError}</p>}
            <div className="mt-6 flex gap-2">
              {backgroundBlurEnabled && <button type="button" disabled={blurSaving} onClick={async () => { setBlurSaving(true); setBlurError(null); try { await onSetBackgroundBlur(false, blurDraft); setBlurPopupOpen(false) } catch (error) { setBlurError(error instanceof Error ? error.message : 'Could not turn off Background Blur.') } finally { setBlurSaving(false) } }} className="rounded-xl border border-pink-100/[0.18] bg-white/[0.025] px-4 py-3 text-sm font-medium text-pink-50/90 backdrop-blur-xl transition-colors hover:bg-pink-200/[0.07] disabled:opacity-50">Turn off</button>}
              <button type="button" disabled={blurSaving} onClick={async () => { setBlurSaving(true); setBlurError(null); try { await onSetBackgroundBlur(true, blurDraft); setBlurPopupOpen(false) } catch (error) { setBlurError(error instanceof Error ? error.message : 'Could not apply Background Blur.') } finally { setBlurSaving(false) } }} className="flex-1 rounded-xl border border-pink-200/[0.22] bg-pink-300/[0.10] px-4 py-3 text-sm font-semibold text-pink-50 shadow-[0_4px_18px_rgba(255,105,180,0.08)] backdrop-blur-xl transition-colors hover:bg-pink-300/[0.14] disabled:opacity-50">{blurSaving ? 'Applying…' : 'Done'}</button>
            </div>
          </div>
        </div>
      )}

      {recipientPickerOpen && groupCallId && pendingGroupReaction && (
        <div className="absolute inset-0 z-[125] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Choose group reaction recipients">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#19191f] text-white shadow-2xl">
            <div className="border-b border-white/10 p-4"><div className="flex items-center justify-between"><div><h3 className="font-semibold">Who should receive this reaction?</h3><p className="mt-1 text-xs text-white/55">Only selected participants will receive it.</p></div><button type="button" onClick={() => { setRecipientPickerOpen(false); setPendingGroupReaction(null); setSelectedGroupReactionRecipients([]) }} aria-label="Cancel reaction" className="rounded-full p-2 hover:bg-white/10">✕</button></div><p className="mt-3 rounded-xl bg-white/5 px-3 py-2 text-sm text-pink-200">{CALL_REACTION_CUSTOM_OPTIONS.find((option) => option.id === pendingGroupReaction)?.emoji || '✨'} {getCallReactionLabel(pendingGroupReaction)}</p></div>
            <div className="max-h-[52dvh] overflow-y-auto p-2">{joinedGroupReactionRecipients.map((person) => <button key={person.id} type="button" onClick={() => setSelectedGroupReactionRecipients((current) => current.includes(person.id) ? current.filter((id) => id !== person.id) : current.length < 9 ? [...current, person.id] : current)} className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-white/5"><Avatar className="h-10 w-10"><AvatarImage src={person.avatarUrl || undefined} /><AvatarFallback>{(person.fullName || person.username).slice(0,1).toUpperCase()}</AvatarFallback></Avatar><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{person.fullName || person.username}</span><span className="block truncate text-xs text-white/45">@{person.username}</span></span><span className={`flex h-5 w-5 items-center justify-center rounded-full border ${selectedGroupReactionRecipients.includes(person.id) ? 'border-pink-500 bg-pink-600 text-white' : 'border-white/30'}`}>{selectedGroupReactionRecipients.includes(person.id) && <Check className="h-3 w-3" />}</span></button>)}</div>
            <div className="flex items-center justify-between border-t border-white/10 p-4"><span className="text-xs text-white/55">{selectedGroupReactionRecipients.length} selected · defaults to everyone</span><button type="button" disabled={!selectedGroupReactionRecipients.length || sendingGroupReaction} onClick={() => void sendGroupReaction()} className="rounded-full bg-pink-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{sendingGroupReaction ? 'Sending…' : 'Done'}</button></div>
          </div>
        </div>
      )}

      {addPeopleOpen && (
        <div className="absolute inset-0 z-[150] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Add people to group call">
          <div className="flex max-h-[min(82dvh,680px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#17171b] text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 p-4">
              <div><h3 className="font-semibold">{groupCallId ? 'Add people to group call' : 'Turn this into a group call'}</h3><p className="mt-1 text-xs text-white/55">Choose people from your Messages contacts</p></div>
              <button type="button" onClick={() => setAddPeopleOpen(false)} aria-label="Close" className="rounded-full p-2 hover:bg-white/10">✕</button>
            </div>
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <Search className="h-4 w-4 text-white/45" />
              <span className="text-xs text-white/55">Your message contacts</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {messageContacts.map((person) => (
                <button key={person.id} type="button" onClick={() => setSelectedInvitees((current) => current.includes(person.id) ? current.filter((id) => id !== person.id) : current.length < (groupCallId ? 9 : 8) ? [...current, person.id] : current)} className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-white/5">
                  <Avatar className="h-10 w-10"><AvatarImage src={person.avatarUrl || undefined} /><AvatarFallback>{(person.fullName || person.username).slice(0,1).toUpperCase()}</AvatarFallback></Avatar>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{person.fullName || person.username}</span><span className="block truncate text-xs text-white/45">@{person.username}</span></span>
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${selectedInvitees.includes(person.id) ? 'border-pink-500 bg-pink-600 text-white' : 'border-white/30'}`}>{selectedInvitees.includes(person.id) && <Check className="h-3 w-3" />}</span>
                </button>
              ))}
              {!messageContacts.length && !loadingContacts && <p className="p-8 text-center text-sm text-white/50">No available message contacts found.</p>}
              {inviteError && <p className="mx-2 mt-2 rounded-xl bg-red-500/10 p-3 text-xs text-red-200">{inviteError}</p>}
            </div>
            <div className="flex items-center justify-between border-t border-white/10 p-4">
              <span className="text-xs text-white/55">{selectedInvitees.length} selected · {groupCallId ? 'up to 9 more' : 'up to 8 more'}</span>
              <button type="button" disabled={!selectedInvitees.length || sendingInvites || !onAddPeopleToGroup} onClick={async () => {
                if (!onAddPeopleToGroup) return
                setSendingInvites(true); setInviteError(null)
                try { await onAddPeopleToGroup(selectedInvitees); setAddPeopleOpen(false); setSelectedInvitees([]) }
                catch (error) { setInviteError(error instanceof Error ? error.message : 'Could not add people') }
                finally { setSendingInvites(false) }
              }} className="rounded-full bg-pink-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{sendingInvites ? 'Adding…' : 'Done'}</button>
            </div>
          </div>
        </div>
      )}

      {isScreenLocked && (
        <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-black/75 backdrop-blur-sm text-white" role="dialog" aria-modal="true" aria-label="Call screen locked">
          <Lock className="h-9 w-9 text-white/90" />
          <p className="text-sm font-medium">Screen locked</p>
          <p className="text-xs text-white/65">Your call continues normally</p>
          <button
            type="button"
            onClick={() => setIsScreenLocked(false)}
            className="mt-2 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-neutral-900 shadow-lg active:scale-95"
            aria-label="Unlock call screen"
          >
            <Unlock className="h-4 w-4" />
            Unlock
          </button>
        </div>
      )}
    </div>
  )
}
