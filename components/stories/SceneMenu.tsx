'use client'

import { useEffect, useRef } from 'react'

export interface SceneMenuItem {
  icon: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
}

interface SceneMenuProps {
  anchorX: number
  anchorY: number
  items: SceneMenuItem[]
  onClose: () => void
}

export function SceneMenu({ anchorX, anchorY, items, onClose }: SceneMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Fixed to the viewport (not a descendant of the timeline's scrolling
  // track), and opens upward from the 3-dot button's exact position - this
  // Is what actually escapes that track's overflow clipping.
  return (
    <div
      ref={ref}
      style={{ left: `${Math.max(8, anchorX - 180)}px`, bottom: `${window.innerHeight - anchorY + 6}px` }}
      className="fixed z-[130] bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden w-48"
    >
      {items.map((it, i) => (
        <button
          key={i}
          onClick={() => { it.onClick(); onClose() }}
          className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-white/10 transition-colors ${it.danger ? 'text-red-400' : 'text-white'}`}
        >
          {it.icon}
          {it.label}
        </button>
      ))}
    </div>
  )
}
