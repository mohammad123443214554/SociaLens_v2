'use client'

import { useEffect } from 'react'
import { Phone, PhoneOff, Video } from 'lucide-react'
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
}

export function IncomingCallModal({ callerName, callerAvatar, type, ringtoneId, ringtoneVolume, onAccept, onReject }: IncomingCallModalProps) {
  useEffect(() => {
    startRingtone(ringtoneId, ringtoneVolume)
    if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400])
    return () => stopRingtone()
  }, [ringtoneId, ringtoneVolume])

  return (
    <div className="fixed inset-0 bg-black/95 z-[200] flex flex-col items-center justify-between py-16 px-6 text-white">
      <div />

      <div className="flex flex-col items-center gap-4">
        <p className="text-sm text-white/60">Incoming {type === 'video' ? 'video' : 'voice'} call</p>
        <Avatar className="h-28 w-28 ring-4 ring-pink-500/30 shadow-2xl shadow-pink-500/10 animate-pulse">
          <AvatarImage src={callerAvatar} alt={callerName} />
          <AvatarFallback className="text-3xl">{callerName[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>
        <h2 className="text-2xl font-bold">{callerName}</h2>
        <p className="text-white/50 text-sm">is calling you on SociaLens...</p>
      </div>

      <div className="flex items-center gap-16">
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={onReject}
            className="h-16 w-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors shadow-lg shadow-red-500/30"
          >
            <PhoneOff className="h-7 w-7" />
          </button>
          <span className="text-xs text-white/60">Decline</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={onAccept}
            className="h-16 w-16 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-colors shadow-lg shadow-green-500/30 animate-bounce"
          >
            {type === 'video' ? <Video className="h-7 w-7" /> : <Phone className="h-7 w-7" />}
          </button>
          <span className="text-xs text-white/60">Accept</span>
        </div>
      </div>
    </div>
  )
}
