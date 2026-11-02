'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Mic, MicOff, Video, VideoOff, PhoneOff, ShieldCheck, Sparkles, ArrowLeftRight, RefreshCw, PauseCircle, PlayCircle, Volume1, Volume2, Minimize2, Maximize2, Move, Lock, Unlock, MoreHorizontal } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { startRingtone, stopRingtone } from '@/lib/utils/ringtone'
import type { CallPhase, CallType } from '@/lib/hooks/useCall'
import { CALL_EFFECT_CATEGORIES, PART_TWO_FACE_PRESETS, PART_FOUR_LIGHTING_PRESETS, PART_FOUR_CREATIVE_PRESETS } from '@/lib/call-effects'

interface CallScreenProps {
  phase: CallPhase
  type: CallType
  peerName: string
  peerAvatar: string
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
  phase, type, peerName, peerAvatar, localStream, remoteStream,
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
                <AvatarImage src={peerAvatar} alt={peerName} />
                <AvatarFallback className="bg-gradient-to-br from-pink-500 to-purple-600 text-4xl">{peerName[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <h2 className="text-xl font-bold drop-shadow-lg">{peerName}</h2>
              <p className={`text-sm drop-shadow-lg ${error ? 'text-red-400' : 'text-white/65'}`}>{statusText}</p>
            </div>
          )}
        </div>
      )}
      <audio ref={remoteAudioRef} autoPlay className="hidden" />

      {/* Keep remote camera image unfiltered; controls have their own contrast. */}

      {/* Top bar - SociaLens branded, mirrors a normal call app's header */}
      <div className={isMini ? "relative z-30 flex items-center justify-start px-2 pt-2 pointer-events-none" : "relative z-30 flex items-center justify-center px-5 pt-5"}>
        <div className="flex items-center gap-1.5 text-xs text-white/70">
          {isMini ? <Move className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          <span>{isMini ? peerName : "SociaLens secure call"}</span>
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
      {(!isVideoCall || showRemoteVideo || isMini || (isVideoCall && !showRemoteVideo)) && (
        <div className={`relative z-10 flex flex-col items-center gap-3 transition-all duration-300 ${
          showRemoteVideo ? (isMini ? 'pt-1' : 'pt-6') : 'flex-1 justify-center'
        } ${isVideoCall && !showRemoteVideo ? 'md:hidden' : ''}`}>
          {!showRemoteVideo && (
            <Avatar className={`${isMini ? "h-16 w-16" : "h-32 w-32"} ring-4 ring-pink-500/30 shadow-2xl shadow-pink-500/10 md:hidden`}>
              <AvatarImage src={peerAvatar} alt={peerName} />
              <AvatarFallback className="text-4xl bg-gradient-to-br from-pink-500 to-purple-600">{peerName[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
          )}
          <h2 className={`font-bold ${isMini ? 'text-sm' : showRemoteVideo ? 'text-lg drop-shadow-lg' : 'text-2xl'}`}>{peerName}</h2>
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
              {isVideoCall && (
                <button type="button" onClick={() => { setEffectsMenuOpen(true); setMoreMenuOpen(false) }} disabled={isCameraOff || isOnHold || phase !== 'in-call'} className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-3 text-left text-sm transition-colors hover:border-pink-100/[0.12] hover:bg-pink-300/[0.07] disabled:opacity-40">
                  <Sparkles className="h-4 w-4" /><span className="flex-1">Effects</span><span className="text-pink-100/45">›</span>
                </button>
              )}
            </div>
          )}
                    {isVideoCall && effectsMenuOpen && (
            <div className="absolute bottom-16 left-0 z-[100] w-[min(250px,calc(100vw-28px))] rounded-2xl border border-pink-100/[0.18] bg-white/[0.035] p-2 text-pink-50/95 shadow-[0_18px_55px_rgba(255,105,180,0.055)] backdrop-blur-[32px] supports-[backdrop-filter]:bg-white/[0.035]">
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

        <button type="button" onClick={() => setIsSpeakerOn((current) => !current)} aria-label={isSpeakerOn ? 'Speaker on' : 'Speaker off'} aria-pressed={isSpeakerOn} title={isSpeakerOn ? 'Speaker on · louder audio' : 'Speaker off · normal audio'} className={`h-10 w-10 sm:h-14 sm:w-14 rounded-full flex items-center justify-center transition-colors ${isSpeakerOn ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-lg shadow-pink-500/30' : 'bg-white/15 hover:bg-white/25'}`}>
          {isSpeakerOn ? <Volume2 className="h-6 w-6" /> : <Volume1 className="h-6 w-6" />}
        </button>



        <button onClick={onToggleHold} disabled={phase !== "in-call"} aria-label={isOnHold ? 'Resume call' : 'Hold call'} title={isOnHold ? 'Resume call' : 'Hold call'} className="h-11 w-11 sm:h-14 sm:w-14 rounded-full flex items-center justify-center transition-colors bg-white/15 hover:bg-white/25 disabled:opacity-40 disabled:cursor-not-allowed">
          {isOnHold ? <PlayCircle className="h-5 w-5 sm:h-6 sm:w-6" /> : <PauseCircle className="h-5 w-5 sm:h-6 sm:w-6" />}
        </button>

        <button onClick={onEnd} aria-label="End call" title="End call" className="h-11 w-11 sm:h-16 sm:w-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors shadow-lg shadow-red-500/30">
          <PhoneOff className="h-5 w-5 sm:h-7 sm:w-7" />
        </button>
      </div>


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
