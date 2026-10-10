'use client'

import { useState } from 'react'
import Image from 'next/image'
import { X } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getAvatarUrl } from '@/lib/utils/helpers'

type SharedMessage = {
  role?: string
  content?: string
  attachments?: { name?: string }[]
}
type SharedPayload = {
  type: 'prompt' | 'chat'
  owner?: { username?: string; avatar_url?: string | null }
  prompt?: string
  title?: string
  messages?: SharedMessage[]
}

export function SharedAperonixContentMessage({ content, isOwn }: { content: string; isOwn: boolean }) {
  const [showFull, setShowFull] = useState(false)
  let payload: SharedPayload
  try {
    const parsed = JSON.parse(content)
    if (parsed?.__sociaLensShare !== 1 || !['prompt', 'chat'].includes(parsed.type)) return null
    payload = parsed as SharedPayload
  } catch {
    return null
  }

  const isPrompt = payload.type === 'prompt'
  const username = payload.owner?.username || 'User'
  const messages = Array.isArray(payload.messages) ? payload.messages : []
  const transcript = isPrompt
    ? payload.prompt || ''
    : messages.map(message => {
        const role = message.role === 'user' ? username : 'Aperonix'
        const attachments = message.attachments?.length ? `\n[Attachments: ${message.attachments.map(a => a.name || 'file').join(', ')}]` : ''
        return `${role}:\n${message.content || ''}${attachments}`
      }).join('\n\n')
  const heading = isPrompt ? `${username} Prompt` : 'Aperonix Chat'

  return (
    <div className={`max-w-[80%] overflow-hidden rounded-2xl border ${isOwn ? 'border-white/20 bg-gradient-to-r from-pink-500 to-purple-500 text-white' : 'border-border bg-muted'}`}>
      <div className={`flex items-center gap-1.5 px-3 pt-2.5 ${isOwn ? 'text-white/80' : 'text-muted-foreground'}`}>
        {isPrompt ? (
          <Avatar className="h-4 w-4 shrink-0">
            <AvatarImage src={getAvatarUrl(payload.owner?.avatar_url ?? null)} />
            <AvatarFallback className="text-[8px]">{username.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
        ) : (
          <Image src="/images/aperonix-logo.png" alt="Aperonix" width={16} height={16} className="rounded-full" />
        )}
        <span className="text-[11px] font-semibold">{heading}</span>
      </div>
      <div className="px-3 pb-2.5 pt-1">
        <p className="whitespace-pre-wrap break-words text-sm leading-5 line-clamp-4">{transcript}</p>
        {transcript.length > 120 && (
          <button onClick={() => setShowFull(true)} className={`mt-1 text-xs font-semibold ${isOwn ? 'text-white/90 underline' : 'text-pink-500'}`}>
            See more
          </button>
        )}
      </div>

      {showFull && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 p-4" onClick={() => setShowFull(false)}>
          <div role="dialog" aria-modal="true" className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex shrink-0 items-center justify-between border-b border-border p-4">
              <div className="flex min-w-0 items-center gap-2">
                {isPrompt ? (
                  <Avatar className="h-6 w-6 shrink-0">
                    <AvatarImage src={getAvatarUrl(payload.owner?.avatar_url ?? null)} />
                    <AvatarFallback>{username.slice(0, 1).toUpperCase()}</AvatarFallback>
                  </Avatar>
                ) : (
                  <Image src="/images/aperonix-logo.png" alt="Aperonix" width={22} height={22} className="rounded-full" />
                )}
                <h3 className="truncate text-sm font-bold">{heading}</h3>
              </div>
              <button onClick={() => setShowFull(false)} aria-label="Close full shared content" className="rounded-full p-1 hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-4">
              {isPrompt ? (
                <p className="whitespace-pre-wrap break-words text-sm leading-6">{transcript}</p>
              ) : (
                <div className="space-y-5">
                  {messages.map((message, index) => {
                    const fromAperonix = message.role !== 'user'
                    return (
                      <article key={`${index}-${message.role || 'message'}`} className="flex items-start gap-2.5">
                        <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full">
                          {fromAperonix ? (
                            <Image src="/images/aperonix-logo.png" alt="Aperonix" width={28} height={28} className="h-full w-full object-contain" />
                          ) : (
                            <Avatar className="h-7 w-7">
                              <AvatarImage src={getAvatarUrl(payload.owner?.avatar_url ?? null)} />
                              <AvatarFallback>{username.slice(0, 1).toUpperCase()}</AvatarFallback>
                            </Avatar>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="mb-1 text-xs font-semibold">{fromAperonix ? 'Aperonix' : username}</p>
                          {message.content && <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p>}
                          {!!message.attachments?.length && <p className="mt-2 text-xs text-muted-foreground">Attachments: {message.attachments.map(a => a.name || 'file').join(', ')}</p>}
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
