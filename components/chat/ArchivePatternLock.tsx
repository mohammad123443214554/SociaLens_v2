'use client'

import { useRef, useState } from 'react'

interface ArchivePatternLockProps {
  onComplete: (pattern: string) => void
  disabled?: boolean
  resetKey?: string | number
  size?: 'normal' | 'compact'
  showIdleHint?: boolean
}

const GRID_SIZE = 3

function addPatternPoint(current: number[], next: number) {
  if (current.includes(next)) return current
  if (current.length === 0) return [next]
  const previous = current[current.length - 1]
  const rowA = Math.floor(previous / GRID_SIZE)
  const colA = previous % GRID_SIZE
  const rowB = Math.floor(next / GRID_SIZE)
  const colB = next % GRID_SIZE
  const rowDiff = rowB - rowA
  const colDiff = colB - colA
  const divisor = (a: number, b: number): number => b === 0 ? Math.abs(a) : divisor(b, a % b)
  const steps = divisor(Math.abs(rowDiff), Math.abs(colDiff))
  const additions: number[] = []
  if (steps > 1) {
    for (let step = 1; step < steps; step++) {
      const middle = (rowA + (rowDiff / steps) * step) * GRID_SIZE + colA + (colDiff / steps) * step
      if (!current.includes(middle)) additions.push(middle)
    }
  }
  return [...current, ...additions, next]
}

export function ArchivePatternLock({ onComplete, disabled = false, resetKey, size = 'normal', showIdleHint = true }: ArchivePatternLockProps) {
  const [path, setPath] = useState<number[]>([])
  const [drawing, setDrawing] = useState(false)
  const [error, setError] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const compact = size === 'compact'

  const start = (index: number) => {
    if (disabled) return
    setError('')
    setPath([index])
    setDrawing(true)
  }

  const enter = (index: number) => {
    if (!drawing || disabled) return
    setPath(current => addPatternPoint(current, index))
  }

  const finish = () => {
    if (!drawing) return
    setDrawing(false)
    if (path.length < 4) {
      setError('Connect at least 4 dots to create a pattern.')
      setPath([])
      return
    }
    onComplete(path.join('-'))
  }

  return (
    <div className="w-full select-none">
      <div
        ref={containerRef}
        onPointerUp={finish}
        onPointerCancel={finish}
        onContextMenu={event => event.preventDefault()}
        className={`relative mx-auto aspect-square w-full ${compact ? 'max-w-[260px]' : 'max-w-[320px]'} rounded-2xl border border-border/70 bg-muted/35 p-3 sm:p-4`}
        style={{ touchAction: 'none' }}
      >
        <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 h-full w-full p-3 sm:p-4" aria-hidden="true">
          {path.length > 1 && <polyline points={path.map(index => `${16.6667 + (index % 3) * 33.3333},${16.6667 + Math.floor(index / 3) * 33.3333}`).join(' ')} fill="none" stroke="url(#archivePatternGradient)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />}
          <defs><linearGradient id="archivePatternGradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#ec4899" /><stop offset="100%" stopColor="#a855f7" /></linearGradient></defs>
        </svg>
        <div className="relative grid h-full w-full grid-cols-3 grid-rows-3">
          {Array.from({ length: 9 }, (_, index) => {
            const selected = path.includes(index)
            return (
              <div key={index} className="flex items-center justify-center">
                <button
                  type="button"
                  aria-label={`Pattern dot ${index + 1}`}
                  disabled={disabled}
                  onPointerDown={event => { event.preventDefault(); start(index) }}
                  onPointerEnter={() => enter(index)}
                  className={`relative z-10 flex h-11 w-11 items-center justify-center rounded-full outline-none transition-all ${compact ? 'sm:h-10 sm:w-10' : 'sm:h-12 sm:w-12'} `}
                >
                  <span className={`block rounded-full transition-all ${selected ? 'h-5 w-5 bg-gradient-to-br from-pink-500 to-purple-500 shadow-[0_0_0_6px_rgba(217,70,239,0.15)]' : 'h-3 w-3 bg-muted-foreground/55'}`} />
                </button>
              </div>
            )
          })}
        </div>
      </div>
      <p className={`mt-3 min-h-5 text-center text-xs ${error ? 'text-red-500' : 'text-muted-foreground'}`}>{error || (showIdleHint ? 'Draw a pattern by connecting at least 4 dots.' : '')}</p>
    </div>
  )
}
