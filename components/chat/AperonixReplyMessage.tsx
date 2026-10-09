'use client'

import { useState } from 'react'
import Image from 'next/image'
import { X } from 'lucide-react'

interface AperonixReplyMessageProps {
  content: string
  isOwn: boolean
}

// Renders a shared Aperonix reply as its own kind of chat bubble - Aperonix
// Branding up top, only 3 lines of the reply shown, and a "See more" button
// That pops up the full text for longer replies.
export function AperonixReplyMessage({ content, isOwn }: AperonixReplyMessageProps) {
  const [showFull, setShowFull] = useState(false)

  return (
    <div className={`max-w-[80%] rounded-2xl overflow-hidden border ${isOwn ? 'border-white/20' : 'border-border'} ${isOwn ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white' : 'bg-muted'}`}>
      <div className={`flex items-center gap-1.5 px-3 pt-2.5 ${isOwn ? 'text-white/80' : 'text-muted-foreground'}`}>
        <Image src="/images/aperonix-logo.png" alt="Aperonix" width={16} height={16} className="rounded-full" />
        <span className="text-[11px] font-semibold">Aperonix reply</span>
      </div>
      <div className="px-3 pb-2.5 pt-1">
        <p className="text-sm whitespace-pre-wrap line-clamp-3">{content}</p>
        {content.length > 120 && (
          <button
            onClick={() => setShowFull(true)}
            className={`text-xs font-semibold mt-1 ${isOwn ? 'text-white/90 underline' : 'text-pink-500'}`}
          >
            See more
          </button>
        )}
      </div>

      {showFull && (
        <div className="fixed inset-0 bg-black/70 z-[130] flex items-center justify-center p-4" onClick={() => setShowFull(false)}>
          <div className="bg-card rounded-2xl w-full max-w-sm max-h-[75vh] flex flex-col overflow-hidden text-foreground" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Image src="/images/aperonix-logo.png" alt="Aperonix" width={20} height={20} className="rounded-full" />
                <h3 className="font-bold text-sm">Aperonix reply</h3>
              </div>
              <button onClick={() => setShowFull(false)} className="p-1 rounded-full hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-4">
              <p className="text-sm whitespace-pre-wrap">{content}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
