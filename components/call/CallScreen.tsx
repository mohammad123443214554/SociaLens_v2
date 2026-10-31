'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Video, VideoOff, PhoneOff, ShieldCheck, ArrowLeftRight, PauseCircle, PlayCircle, Volume1, Volume2 } from 'lucide-react'
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
  callDurationSec: number
  error: string | null
  ringtoneId?: string
  ringtoneVolume?: number
  onEnd: () => void
  onToggleMute: () => void
  onToggleCamera: () => void
  onToggleHold: () => void
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = Math.floor(sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function CallScreen({
  phase, type, peerName, peerAvatar, localStream, remoteStream,
  isMuted, isCameraOff, isOnHold, callDurationSec, error, ringtoneId, ringtoneVolume,
  onEnd, onToggleMute, onToggleCamera, onToggleHold,
}: CallScreenProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const remoteAudioRef = useRef<HTMLAudioElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioGainRef = useRef<GainNode | null>(null)
  const pipVideoRef = useRef<HTMLVideoElement>(null)
  const [localVideoIsMain, setLocalVideoIsMain] = useState(false)
  const [isSpeakerOn, setIsSpeakerOn] = useState(false)

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream
  }, [localStream])

  useEffect(() => {
    if (type === 'video' && remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream
      remoteAudioRef.current.volume = 1
      remoteAudioRef.current.muted = false
    }

    // Route the remote stream through Web Audio so Speaker ON can boost
    // above the browser's 100% element-volume ceiling. If Web Audio is
    // unavailable or blocked, keep normal playback working as a fallback.
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
        gain.gain.value = 1
        source.connect(gain)
        gain.connect(context.destination)
        audioContextRef.current = context
        audioGainRef.current = gain
        await context.resume()
        if (disposed) return
        if (context.state === 'running' && remoteAudioRef.current) {
          remoteAudioRef.current.muted = true
        } else {
          // Do not leave a dormant duplicate audio route behind.
          try { source.disconnect() } catch {}
          audioContextRef.current = null
          audioGainRef.current = null
          if (remoteAudioRef.current) {
            remoteAudioRef.current.muted = false
            remoteAudioRef.current.volume = 1
          }
          await context.close().catch(() => {})
          context = null
        }
      } catch (audioError) {
        console.warn('[Call] speaker boost unavailable; using normal playback', audioError)
        if (remoteAudioRef.current) {
          remoteAudioRef.current.muted = false
          remoteAudioRef.current.volume = 1
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
  }, [remoteStream, type])

  useEffect(() => {
    if (audioGainRef.current) audioGainRef.current.gain.setTargetAtTime(isSpeakerOn ? 2.2 : 1, audioContextRef.current?.currentTime ?? 0, 0.08)
    // Browsers without Web Audio support retain their normal 100% playback.
    if (!audioGainRef.current && remoteAudioRef.current) remoteAudioRef.current.volume = 1
  }, [isSpeakerOn, remoteStream])

  useEffect(() => {
    if (type === 'video' && pipVideoRef.current) {
      pipVideoRef.current.srcObject = localVideoIsMain ? remoteStream : localStream
    }
  }, [localStream, remoteStream, localVideoIsMain, type])

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
  const showRemoteVideo = isVideoCall && remoteStream && phase === 'in-call'

  return (
    <div className="fixed inset-0 bg-neutral-950 z-[200] flex flex-col text-white overflow-hidden">
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
      <div className="relative z-10 flex items-center justify-center px-5 pt-5">
        <div className="flex items-center gap-1.5 text-xs text-white/50">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>SociaLens secure call</span>
        </div>
      </div>

      {/* Peer info - Centered when no remote video yet, top-aligned once video is live */}
      <div
        className={`relative z-10 flex flex-col items-center gap-3 transition-all duration-300 ${
          showRemoteVideo ? 'pt-6' : 'flex-1 justify-center'
        }`}
      >
        {!showRemoteVideo && (
          <Avatar className="h-32 w-32 ring-4 ring-pink-500/30 shadow-2xl shadow-pink-500/10">
            <AvatarImage src={peerAvatar} alt={peerName} />
            <AvatarFallback className="text-4xl bg-gradient-to-br from-pink-500 to-purple-600">{peerName[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
        )}
        <h2 className={`font-bold ${showRemoteVideo ? 'text-lg drop-shadow-lg' : 'text-2xl'}`}>{peerName}</h2>
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
            className={`absolute inset-0 block w-full h-full object-cover object-center bg-black transition-opacity duration-150 ${localVideoIsMain && !isCameraOff ? 'opacity-100 scale-x-[-1]' : 'opacity-0 pointer-events-none'}`}
          />
          <div className="absolute bottom-28 left-4 w-24 h-32 sm:w-28 sm:h-36 rounded-xl overflow-hidden ring-2 ring-white/25 bg-neutral-900 z-20 shadow-lg">
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
      <div className="relative z-10 flex items-center justify-center gap-4 px-4 pb-12 pt-6 bg-gradient-to-t from-black/50 to-transparent">
        <button
          type="button"
          onClick={() => setIsSpeakerOn((current) => !current)}
          aria-label={isSpeakerOn ? 'Speaker on' : 'Speaker off'}
          aria-pressed={isSpeakerOn}
          title={isSpeakerOn ? 'Speaker on · louder audio' : 'Speaker off · normal audio'}
          className={`h-14 w-14 rounded-full flex items-center justify-center transition-colors ${isSpeakerOn ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-lg shadow-pink-500/30' : 'bg-white/15 hover:bg-white/25'}`}
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
          className="h-16 w-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors shadow-lg shadow-red-500/30"
        >
          <PhoneOff className="h-7 w-7" />
        </button>
      </div>
    </div>
  )
}
