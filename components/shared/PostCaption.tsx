'use client'

import { useState, type ReactNode } from 'react'

// Post content is stored as "**title**\n\ndescription\n\n#hashtags" (title is optional).
// This pulls the title out separately from the rest (description + hashtags).
function parseCaption(content: string) {
  const match = content.match(/^\*\*(.+?)\*\*\n\n([\s\S]*)$/)
  if (match) return { title: match[1].trim(), rest: match[2].trim() }
  return { title: null as string | null, rest: content.trim() }
}

interface PostCaptionProps {
  content: string
  /**
   * 'full' (default): shows the title and a "See more" toggle that reveals the
   * description + hashtags underneath.
   * 'titleOnly': just shows the title (or a short preview if there's no title) with
   * no toggle - use this inside thumbnails/cards that already open a full view on click.
   */
  variant?: 'full' | 'titleOnly'
  /**
   * When true, always shows the full title + description + hashtags with no
   * "See more" toggle at all - used for text-only posts (no photo/video), so
   * the text itself is the whole post and shouldn't be collapsed.
   */
  forceExpanded?: boolean
  className?: string
  titleClassName?: string
  captionClassName?: string
  buttonClassName?: string
  /** Rendered inline right before the title, e.g. a bolded username */
  prefix?: ReactNode
}

export function PostCaption({
  content,
  variant = 'full',
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
  const truncatedRest = rest.length > 60 ? rest.slice(0, 60).trimEnd() + '\u2026' : rest
  const hasMore = !forceExpanded && (title ? rest.length > 0 : rest.length > truncatedRest.length)

  if (variant === 'titleOnly') {
    return (
      <p className={`${titleClassName} ${className}`}>
        {prefix}
        {title || truncatedRest}
      </p>
    )
  }

  return (
    <div className={className}>
      {title ? (
        <>
          <p className={titleClassName}>{prefix}<span className="font-semibold">{title}</span></p>
          {expanded && rest && (
            <p className={`${captionClassName} whitespace-pre-wrap mt-0.5`}>{rest}</p>
          )}
        </>
      ) : (
        <p className={`${titleClassName} ${expanded ? 'whitespace-pre-wrap' : ''}`}>
          {prefix}{expanded ? rest : truncatedRest}
        </p>
      )}
      {hasMore && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); e.preventDefault(); setExpanded(v => !v) }}
          className={buttonClassName}
        >
          {expanded ? 'See less' : 'See more'}
        </button>
      )}
    </div>
  )
}
