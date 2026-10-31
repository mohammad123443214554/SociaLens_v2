'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Mic, MicOff, Video, VideoOff, PhoneOff, ShieldCheck, ArrowLeftRight, RefreshCw, PauseCircle, PlayCircle, Volume1, Volume2, Minimize2, Maximize2, Move } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { startRingtone, stopRingtone } from '@/lib/utils/ringtone'
import type { CallPhase, CallType } from '@/lib/hooks/useCall'

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
  ringtoneId?: string
  ringtoneVolume?: number
  onEnd: () => void
  onToggleMute: () => void
  onToggleCamera: () => void
  onSwitchCamera: () => void
  onToggleHold: () => void
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = Math.floor(sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function CallScreen({
  phase, type, peerName, peerAvatar, localStream, remoteStream,
  isMuted, isCameraOff, isOnHold, canSwitchCamera, callDurationSec, error, ringtoneId, ringtoneVolume,
  onEnd, onToggleMute, onToggleCamera, onSwitchCamera, onToggleHold,
}: CallScreenProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const remoteAudioRef = useRef<HTMLAudioElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioGainRef = useRef<GainNode | null>(null)
  const pipVideoRef = useRef<HTMLVideoElement>(null)
  const [localVideoIsMain, setLocalVideoIsMain] = useState(false)
  const [isSpeakerOn, setIsSpeakerOn] = useState(false)

  const [isMini, setIsMini] = useState(false)
  const [miniSize, setMiniSize] = useState(300)
  const [miniPosition, setMiniPosition] = useState<{ x: number; y: number } | null>(null)
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null)

  const handleMiniPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isMini || (event.target as HTMLElement).closest('button')) return
    const rect = event.currentTarget.parentElement?.getBoundingClientRect()
    if (!rect) return
    dragOffsetRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const handleMiniPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isMini || !dragOffsetRef.current) return
    const height = Math.round(miniSize * 1.33)
    setMiniPosition({
      x: Math.max(8, Math.min(window.innerWidth - miniSize - 8, event.clientX - dragOffsetRef.current.x)),
      y: Math.max(8, Math.min(window.innerHeight - height - 8, event.clientY - dragOffsetRef.current.y)),
    })
  }
  const handleMiniPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    dragOffsetRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

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
      className={isMini ? "fixed z-[250] flex flex-col text-white overflow-hidden rounded-2xl border border-white/20 bg-neutral-950 shadow-2xl" : "fixed inset-0 bg-neutral-950 z-[200] flex flex-col text-white overflow-hidden"}
      style={isMini ? { width: miniSize, height: Math.round(miniSize * 1.33), left: miniPosition?.x, top: miniPosition?.y, right: miniPosition ? undefined : 12, bottom: miniPosition ? undefined : 80 } : undefined}
    >
      {/* Remote video fills the background for video calls */}
      {isVideoCall && (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          muted
          style={{ objectFit: "cover", objectPosition: "center center", backgroundColor: "#000" }}
          className={`absolute inset-0 block w-full h-full object-cover object-center bg-black ${showRemoteVideo && !localVideoIsMain ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
      <audio ref={remoteAudioRef} autoPlay className="hidden" />

      {/* Keep remote camera image unfiltered; controls have their own contrast. */}

      {/* Top bar - SociaLens branded, mirrors a normal call app's header */}
      <div className={isMini ? "relative z-30 flex items-center justify-between px-2 pt-2 cursor-move touch-none" : "relative z-10 flex items-center justify-center px-5 pt-5"}
        onPointerDown={handleMiniPointerDown} onPointerMove={handleMiniPointerMove} onPointerUp={handleMiniPointerEnd} onPointerCancel={handleMiniPointerEnd}>
        <div className="flex items-center gap-1.5 text-xs text-white/70">
          {isMini ? <Move className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          <span>{isMini ? peerName : "SociaLens secure call"}</span>
          {isMini && <span className="text-white/50">{statusText}</span>}
        </div>
        <div className="flex items-center gap-1">
          {isMini && <>
            <button type="button" onClick={() => setMiniSize((s) => s === 240 ? 300 : s === 300 ? 360 : 240)} className="h-7 w-7 rounded-full bg-white/15" aria-label="Resize mini call larger">+</button>
            <button type="button" onClick={() => setMiniSize((s) => s === 360 ? 300 : s === 300 ? 240 : 360)} className="h-7 w-7 rounded-full bg-white/15" aria-label="Resize mini call smaller">−</button>
          </>}
          <button type="button" onClick={() => { setIsMini((v) => !v); setMiniPosition(null) }} className="h-7 w-7 rounded-full bg-white/15 flex items-center justify-center" aria-label={isMini ? "Expand call screen" : "Minimize call screen"}>
            {isMini ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Peer info - Centered when no remote video yet, top-aligned once video is live */}
      <div
        className={`relative z-10 flex flex-col items-center gap-3 transition-all duration-300 ${
          showRemoteVideo ? (isMini ? 'pt-1' : 'pt-6') : 'flex-1 justify-center'
        }`}
      >
        {!showRemoteVideo && (
          <Avatar className={`${isMini ? "h-16 w-16" : "h-32 w-32"} ring-4 ring-pink-500/30 shadow-2xl shadow-pink-500/10`}>
            <AvatarImage src={peerAvatar} alt={peerName} />
            <AvatarFallback className="text-4xl bg-gradient-to-br from-pink-500 to-purple-600">{peerName[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
        )}
        <h2 className={`font-bold ${isMini ? 'text-sm' : showRemoteVideo ? 'text-lg drop-shadow-lg' : 'text-2xl'}`}>{peerName}</h2>
        <p className={`text-sm ${error ? 'text-red-400' : 'text-white/60'}`}>{statusText}</p>
      </div>

      {!showRemoteVideo && <div className="flex-1" />}

      {/* Main video and movable picture-in-picture preview. A missing camera
          intentionally stays blank; it must never turn into a call error. */}
      {isVideoCall && (
        <>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={{ objectFit: "cover", objectPosition: "center center", backgroundColor: "#000" }}
            className={`absolute inset-0 block w-full h-full object-cover object-center bg-black transition-opacity duration-150 ${localVideoIsMain && localVideoAvailable ? 'opacity-100 scale-x-[-1]' : 'opacity-0 pointer-events-none'}`}
          />
          <div className={`absolute ${isMini ? "bottom-16 right-2 w-16 h-20" : "bottom-28 left-4 w-24 h-32 sm:w-28 sm:h-36"} rounded-xl overflow-hidden ring-2 ring-white/25 bg-neutral-900 z-20 shadow-lg`}>
            {canSwitchCamera && (
              <button
                type="button"
                onClick={onSwitchCamera}
                disabled={isCameraOff || isOnHold}
                aria-label="Switch front or back camera"
                title="Switch front or back camera"
                className="absolute top-1.5 left-1.5 z-30 h-8 w-8 rounded-full bg-black/65 hover:bg-black/85 text-white flex items-center justify-center disabled:opacity-40"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setLocalVideoIsMain((current) => !current)}
              aria-label="Swap video positions"
              title="Swap video positions"
              className="absolute top-1.5 right-1.5 z-30 h-8 w-8 rounded-full bg-black/65 hover:bg-black/85 text-white flex items-center justify-center"
            >
              <ArrowLeftRight className="h-4 w-4" />
            </button>
            <video
              ref={pipVideoRef}
              autoPlay
              playsInline
              muted
              style={{ objectFit: "cover", objectPosition: "center center", backgroundColor: "#000" }}
              className={`block w-full h-full object-cover object-center bg-black ${localVideoIsMain ? '' : 'scale-x-[-1]'}`}
            />
          </div>
        </>
      )}

      {/* Controls */}
      <div className={`relative z-10 flex items-center justify-center ${isMini ? "gap-1 px-1 pb-2 pt-1" : "gap-4 px-4 pb-12 pt-6"} bg-gradient-to-t from-black/50 to-transparent`}>
        <button
          type="button"
          onClick={() => setIsSpeakerOn((current) => !current)}
          aria-label={isSpeakerOn ? 'Speaker on' : 'Speaker off'}
          aria-pressed={isSpeakerOn}
          title={isSpeakerOn ? 'Speaker on · louder audio' : 'Speaker off · normal audio'}
          className={`h-10 w-10 sm:h-14 sm:w-14 rounded-full flex items-center justify-center transition-colors ${isSpeakerOn ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-lg shadow-pink-500/30' : 'bg-white/15 hover:bg-white/25'}`}
        >
          {isSpeakerOn ? <Volume2 className="h-6 w-6" /> : <Volume1 className="h-6 w-6" />}
        </button>

        <button
          onClick={onToggleMute}
          className={`h-14 w-14 rounded-full flex items-center justify-center transition-colors ${
            isMuted ? 'bg-white text-black' : 'bg-white/15 hover:bg-white/25'
          }`}
        >
          {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
        </button>

        {isVideoCall && (
          <button
            onClick={onToggleCamera}
            className={`h-14 w-14 rounded-full flex items-center justify-center transition-colors ${
              isCameraOff ? 'bg-white text-black' : 'bg-white/15 hover:bg-white/25'
            }`}
          >
            {isCameraOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
          </button>
        )}

        <button
          onClick={onToggleHold}
          disabled={phase !== "in-call"}
          aria-label={isOnHold ? 'Resume call' : 'Hold call'}
          title={isOnHold ? 'Resume call' : 'Hold call'}
          className="h-14 w-14 rounded-full flex items-center justify-center transition-colors bg-white/15 hover:bg-white/25 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isOnHold ? <PlayCircle className="h-6 w-6" /> : <PauseCircle className="h-6 w-6" />}
        </button>

        <button
          onClick={onEnd}
          aria-label="End call"
          title="End call"
          className="h-12 w-12 sm:h-16 sm:w-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors shadow-lg shadow-red-500/30"
        >
          <PhoneOff className="h-7 w-7" />
        </button>
      </div>
    </div>
  )
}
