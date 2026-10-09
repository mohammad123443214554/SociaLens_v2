'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { COMMENT_REACTION_EMOJIS } from '@/lib/hooks/useComments'

interface CommentReactionPickerProps {
  /** The "React" button this picker opens next to. */
  anchorRef: React.RefObject<HTMLElement | null>
  onSelect: (emoji: string) => void
  onClose: () => void
}

const PICKER_WIDTH = 216
const PICKER_MAX_HEIGHT = 176 // ~4 rows visible; the rest scrolls
const PICKER_HEIGHT = PICKER_MAX_HEIGHT + 16 // + the panel's own padding, for the above/below flip check

// A quick-pick emoji grid for reacting to a comment. Positioned with
// `fixed` + coordinates read straight off the React button (not `absolute`
// inside the comment), so it's never clipped by a comment list's own
// scroll container - it flips to open downward instead of upward
// whenever there isn't room above, and stays clear of both screen edges
// horizontally.
//
// Rendered through a portal straight into `document.body` rather than in
// place - a plain `position: fixed` child stops being positioned relative
// to the viewport the moment any ancestor has a `transform`, `filter`, or
// `backdrop-filter` on it (that ancestor becomes its new containing block
// instead), which is exactly what was happening inside the Reels comments
// panel (it's `backdrop-blur-md`): the popup was still opening, just
// positioned/clipped against the wrong box, so tapping "React" there
// looked like it did nothing. Portaling escapes that entirely, so this
// now works the same everywhere it's used.
export function CommentReactionPicker({ anchorRef, onSelect, onClose }: CommentReactionPickerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    const openBelow = rect.top < PICKER_HEIGHT + 12
    const top = openBelow ? rect.bottom + 6 : rect.top - PICKER_HEIGHT - 6
    const maxLeft = window.innerWidth - PICKER_WIDTH - 8
    const left = Math.min(Math.max(rect.left, 8), Math.max(maxLeft, 8))
    setPos({ top, left })
  }, [anchorRef])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (ref.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      onClose()
    }
    // Close on scroll too, since a fixed-position popover would
    // otherwise visually detach from its button as the list scrolls.
    const handleScroll = () => onClose()
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('scroll', handleScroll, true)
    }
  }, [onClose, anchorRef])

  if (!pos || typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={ref}
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: PICKER_WIDTH, maxHeight: PICKER_MAX_HEIGHT }}
      className="z-[200] grid grid-cols-6 gap-0.5 bg-card border rounded-2xl shadow-lg p-1.5 overflow-y-auto scrollbar-hide"
    >
      {COMMENT_REACTION_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onSelect(emoji)}
          className="text-lg leading-none p-1.5 rounded-full hover:bg-accent hover:scale-125 transition-transform"
        >
          {emoji}
        </button>
      ))}
    </div>,
    document.body
  )
}
