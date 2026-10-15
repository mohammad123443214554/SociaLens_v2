'use client'

import { useState, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'

// Captions may be stored as **title** followed by a bio and/or hashtags.
function parseCaption(content: string) {
  const match = content.match(/^\*\*(.+?)\*\*(?:\s+([\s\S]*))?$/)
  if (match) return { title: match[1].trim(), rest: (match[2] || '').trim() }
  return { title: null as string | null, rest: content.trim() }
}

interface PostCaptionProps {
  content: string
  variant?: 'full' | 'titleOnly'
  expandMode?: 'inline' | 'dialog'
  forceExpanded?: boolean
  className?: string
  titleClassName?: string
  captionClassName?: string
  buttonClassName?: string
  prefix?: ReactNode
}

export function PostCaption({
  content,
  variant = 'full',
  expandMode = 'inline',
  forceExpanded = false,
  className = '',
  titleClassName = 'text-sm leading-relaxed',
  captionClassName = 'text-sm text-muted-foreground leading-relaxed',
  buttonClassName = 'text-xs text-muted-foreground/70 hover:underline font-medium',
  prefix,
}: PostCaptionProps) {
  const [expandedState, setExpanded] = useState(false)
  const expanded = forceExpanded || expandedState
  if (!content?.trim()) return null

  const { title, rest } = parseCaption(content)
  const hashtagMatches = rest.match(/#[\w\u0600-\u06FF]+/g) || []
  const bio = rest.replace(/#[\w\u0600-\u06FF]+/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  const truncatedRest = rest.length > 60 ? rest.slice(0, 60).trimEnd() + '…' : rest
  const hasMore = !forceExpanded && (expandMode === 'dialog'
    ? !!(bio || hashtagMatches.length)
    : (title ? rest.length > 0 : rest.length > truncatedRest.length))

  if (variant === 'titleOnly') {
    return <p className={`${titleClassName} ${className}`}>{prefix}{title || truncatedRest}</p>
  }

  if (expandMode === 'dialog') {
    return (
      <div className={className}>
        {title ? (
          <p className={titleClassName}>{prefix}<span className="font-semibold">{title}</span></p>
        ) : bio ? (
          <p className={titleClassName}>{prefix}{bio.length > 60 ? truncatedRest : bio}</p>
        ) : null}
        {hasMore && (
          <Dialog>
            <DialogTrigger asChild>
              <button type="button" className={buttonClassName} onClick={e => { e.stopPropagation(); e.preventDefault() }}>See more</button>
            </DialogTrigger>
            <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto rounded-2xl border-border/80 bg-background p-0 shadow-2xl sm:rounded-2xl">
              <div className="border-b border-border/70 bg-gradient-to-r from-pink-500/10 via-background to-purple-500/10 px-5 py-5 pr-12 sm:px-6">
                <div className="mb-2 h-1 w-10 rounded-full bg-gradient-to-r from-pink-500 to-purple-500" />
                {title && <h2 className="text-lg font-bold leading-snug tracking-tight text-foreground sm:text-xl">{title}</h2>}
              </div>
              <div className="space-y-4 px-5 py-5 sm:px-6">
                {bio && <p className="whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">{bio}</p>}
                {hashtagMatches.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {hashtagMatches.map((tag, index) => <span key={tag + index} className="rounded-full border border-pink-500/20 bg-pink-500/10 px-3 py-1.5 text-xs font-medium text-pink-400">{tag}</span>)}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    )
  }

  return (
    <div className={className}>
      {title ? (
        <>
          <p className={titleClassName}>{prefix}<span className="font-semibold">{title}</span></p>
          {expanded && rest && <p className={`${captionClassName} whitespace-pre-wrap mt-0.5`}>{rest}</p>}
        </>
      ) : (
        <p className={`${titleClassName} ${expanded ? 'whitespace-pre-wrap' : ''}`}>{prefix}{expanded ? rest : truncatedRest}</p>
      )}
      {hasMore && (
        <button type="button" onClick={e => { e.stopPropagation(); e.preventDefault(); setExpanded(v => !v) }} className={buttonClassName}>
          {expanded ? 'See less' : 'See more'}
        </button>
      )}
    </div>
  )
}
