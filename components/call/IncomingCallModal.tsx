'use client'

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Phone, PhoneOff, Video, ChevronUp } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { startRingtone, stopRingtone } from '@/lib/utils/ringtone'
import type { CallType } from '@/lib/hooks/useCall'

interface IncomingCallModalProps {
  callerName: string
  callerAvatar: string
  type: CallType
  ringtoneId?: string
  ringtoneVolume?: number
  onAccept: () => void
  onReject: () => void
  isGroupCall?: boolean
  groupParticipants?: { id: string; username: string; fullName: string | null; avatarUrl: string | null }[]
  busy?: boolean
  acceptLabel?: string
}


function SwipeCallAction({
  kind, type, onAction, disabled = false,
}: {
  kind: 'accept' | 'decline'
  type: CallType
  onAction: () => void
  disabled?: boolean
}) {
  const startY = useRef(0)
  const activePointer = useRef<number | null>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const isAccept = kind === 'accept'
  const isTouchDevice = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!isTouchDevice()) return
    event.preventDefault()
    activePointer.current = event.pointerId
    startY.current = event.clientY
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (activePointer.current !== event.pointerId) return
    setDragOffset(Math.max(-76, Math.min(0, event.clientY - startY.current)))
  }
  const finishPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (activePointer.current !== event.pointerId) return
    const shouldAct = startY.current - event.clientY >= 48
    activePointer.current = null
    setDragging(false)
    setDragOffset(0)
    if (shouldAct) onAction()
  }
  const handleClick = () => {
    if (!isTouchDevice()) onAction()
  }

  return (
    <div className="flex flex-col items-center gap-2 select-none">
      <div className="relative h-[92px] w-[92px] flex items-center justify-center">
        <div className={`absolute inset-1 rounded-full border border-white/15 flex flex-col items-center justify-start pt-1 text-white/45 transition-opacity ${dragging ? 'opacity-100' : 'opacity-60'}`}>
          <ChevronUp className="h-4 w-4" />
          <ChevronUp className="h-4 w-4 -mt-2" />
        </div>
        <button
          type="button"
          disabled={disabled}
          aria-label={isAccept ? 'Swipe up to accept call' : 'Swipe up to decline call'}
          onClick={handleClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishPointer}
          onPointerCancel={(event) => {
            if (activePointer.current === event.pointerId) {
              activePointer.current = null
              setDragging(false)
              setDragOffset(0)
            }
          }}
          style={{
            transform: `translateY(${dragOffset}px) scale(${dragging ? 1.04 : 1})`,
            transition: dragging ? 'none' : 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 220ms ease',
            touchAction: 'none',
          }}
          className={`relative z-10 h-16 w-16 rounded-full flex items-center justify-center text-white shadow-xl active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40 ${isAccept ? 'bg-gradient-to-br from-emerald-400 to-green-600 shadow-green-500/30' : 'bg-gradient-to-br from-rose-400 to-red-600 shadow-red-500/30'}`}
        >
          {isAccept ? (type === 'video' ? <Video className="h-7 w-7" /> : <Phone className="h-7 w-7" />) : <PhoneOff className="h-7 w-7" />}
        </button>
      </div>
      <span className="text-xs font-semibold text-white/80">{isAccept ? (acceptLabel || 'Accept') : 'Decline'}</span>
      <span className="text-[10px] text-white/45 md:hidden">Swipe up</span>
    </div>
  )
}

export function IncomingCallModal({ callerName, callerAvatar, type, ringtoneId, ringtoneVolume, onAccept, onReject, isGroupCall = false, groupParticipants = [], busy = false, acceptLabel }: IncomingCallModalProps) {
  useEffect(() => {
    startRingtone(ringtoneId, ringtoneVolume)
    if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400])
    return () => stopRingtone()
  }, [ringtoneId, ringtoneVolume])

  return (
    <div className="fixed inset-0 bg-black/95 z-[200] flex flex-col items-center justify-between py-16 px-6 text-white">
      <div />

      <div className="flex flex-col items-center gap-4">
        <p className="text-sm font-semibold text-pink-300">{isGroupCall ? 'Incoming Group Call' : `Incoming ${type === 'video' ? 'video' : 'voice'} call`}</p>
        {isGroupCall ? (
          <div className="flex max-w-[min(90vw,520px)] flex-wrap justify-center gap-3">
            {groupParticipants.map((person) => (
              <div key={person.id} className="flex w-20 flex-col items-center gap-2">
                <Avatar className="h-16 w-16 ring-4 ring-pink-500/30 shadow-xl shadow-pink-500/10">
                  <AvatarImage src={person.avatarUrl || undefined} />
                  <AvatarFallback className="text-xl">{(person.fullName || person.username).slice(0,1).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="max-w-full truncate text-xs text-white/75">{person.fullName || person.username}</span>
              </div>
            ))}
          </div>
        ) : (
          <Avatar className="h-28 w-28 ring-4 ring-pink-500/30 shadow-2xl shadow-pink-500/10 animate-pulse">
            <AvatarImage src={callerAvatar} alt={callerName} />
            <AvatarFallback className="text-3xl">{callerName[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
        )}
        <h2 className="text-2xl font-bold">{isGroupCall ? 'Group Call' : callerName}</h2>
        <p className="text-white/50 text-sm">{isGroupCall ? `${groupParticipants.length} people are in this call` : 'is calling you on SociaLens...'}</p>
      </div>

      <div className="flex items-start gap-10 md:gap-16">
        <SwipeCallAction kind="decline" type={type} onAction={onReject} disabled={busy} />
        <SwipeCallAction kind="accept" type={type} onAction={onAccept} disabled={busy} />
      </div>
      <p className="absolute bottom-7 left-0 right-0 text-center text-[11px] text-white/40 md:hidden">
        Swipe a button upward to answer or decline
      </p>
    </div>
  )
}
