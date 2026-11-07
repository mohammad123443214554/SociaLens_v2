'use client'

import { useCallback, useRef, useState } from 'react'

interface ArchivePatternLockProps {
  onComplete: (pattern: string) => void
  disabled?: boolean
  resetKey?: string | number
  size?: 'normal' | 'compact'
  showIdleHint?: boolean
  gridSize?: 3 | 4
}

type Point = { x: number; y: number }

function addPatternPoint(current: number[], next: number, gridSize: number) {
  if (current.includes(next)) return current
  if (current.length === 0) return [next]
  const previous = current[current.length - 1]
  const rowA = Math.floor(previous / gridSize)
  const colA = previous % gridSize
  const rowB = Math.floor(next / gridSize)
  const colB = next % gridSize
  const rowDiff = rowB - rowA
  const colDiff = colB - colA
  const divisor = (a: number, b: number): number => b === 0 ? Math.abs(a) : divisor(b, a % b)
  const steps = divisor(Math.abs(rowDiff), Math.abs(colDiff))
  const additions: number[] = []
  if (steps > 1) {
    for (let step = 1; step < steps; step++) {
      const middle = (rowA + (rowDiff / steps) * step) * gridSize + colA + (colDiff / steps) * step
      if (!current.includes(middle)) additions.push(middle)
    }
  }
  return [...current, ...additions, next]
}

export function ArchivePatternLock({ onComplete, disabled = false, resetKey, size = 'normal', showIdleHint = true, gridSize = 3 }: ArchivePatternLockProps) {
  const [path, setPath] = useState<number[]>([])
  const [drawing, setDrawing] = useState(false)
  const [error, setError] = useState('')
  const [pointer, setPointer] = useState<Point | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const pathRef = useRef<number[]>([])
  const lastPointRef = useRef<Point | null>(null)
  const activePointerRef = useRef<number | null>(null)
  const compact = size === 'compact'

  const commitPath = useCallback((next: number[]) => {
    pathRef.current = next
    setPath(next)
  }, [])

  const getHitCell = useCallback((point: Point) => {
    const grid = gridRef.current
    if (!grid) return -1
    const rect = grid.getBoundingClientRect()
    if (!rect.width || !rect.height) return -1
    const cellWidth = rect.width / gridSize
    const cellHeight = rect.height / gridSize
    const col = Math.round((point.x - rect.left - cellWidth / 2) / cellWidth)
    const row = Math.round((point.y - rect.top - cellHeight / 2) / cellHeight)
    if (col < 0 || col >= gridSize || row < 0 || row >= gridSize) return -1
    const centerX = rect.left + (col + 0.5) * cellWidth
    const centerY = rect.top + (row + 0.5) * cellHeight
    const hitRadius = Math.min(cellWidth, cellHeight) * 0.39
    return Math.hypot(point.x - centerX, point.y - centerY) <= hitRadius ? row * gridSize + col : -1
  }, [gridSize])

  const processPoint = useCallback((point: Point) => {
    const previous = lastPointRef.current
    if (!previous) {
      const hit = getHitCell(point)
      if (hit >= 0) commitPath([hit])
      lastPointRef.current = point
      setPointer(point)
      return
    }

    // Sample the whole movement segment so quick swipes cannot skip a dot.
    const distance = Math.hypot(point.x - previous.x, point.y - previous.y)
    const grid = gridRef.current
    const rect = grid?.getBoundingClientRect()
    const stepSize = rect ? Math.max(3, Math.min(rect.width, rect.height) / (gridSize * 10)) : 5
    const samples = Math.max(1, Math.ceil(distance / stepSize))
    let nextPath = pathRef.current
    for (let sample = 1; sample <= samples; sample++) {
      const ratio = sample / samples
      const samplePoint = {
        x: previous.x + (point.x - previous.x) * ratio,
        y: previous.y + (point.y - previous.y) * ratio,
      }
      const hit = getHitCell(samplePoint)
      if (hit >= 0) nextPath = addPatternPoint(nextPath, hit, gridSize)
    }
    if (nextPath !== pathRef.current) commitPath(nextPath)
    lastPointRef.current = point
    setPointer(point)
  }, [commitPath, getHitCell, gridSize])

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || activePointerRef.current !== null) return
    const point = { x: event.clientX, y: event.clientY }
    const hit = getHitCell(point)
    if (hit < 0) return
    event.preventDefault()
    activePointerRef.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    setError('')
    setDrawing(true)
    lastPointRef.current = point
    setPointer(point)
    commitPath([hit])
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerRef.current !== event.pointerId || !pathRef.current.length) return
    event.preventDefault()
    processPoint({ x: event.clientX, y: event.clientY })
  }

  const finish = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerRef.current !== event.pointerId) return
    activePointerRef.current = null
    lastPointRef.current = null
    setDrawing(false)
    setPointer(null)
    const completedPath = pathRef.current
    if (completedPath.length < 4) {
      setError('Connect at least 4 dots to create a pattern.')
      commitPath([])
      return
    }
    onComplete(completedPath.join('-'))
  }

  const cancel = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerRef.current !== event.pointerId) return
    activePointerRef.current = null
    lastPointRef.current = null
    setDrawing(false)
    setPointer(null)
    commitPath([])
  }

  const gridRect = gridRef.current?.getBoundingClientRect()
  const livePoint = pointer && gridRect
    ? { x: ((pointer.x - gridRect.left) / gridRect.width) * 100, y: ((pointer.y - gridRect.top) / gridRect.height) * 100 }
    : null
  const centers = path.map(index => ({
    x: (100 / (gridSize * 2)) + (index % gridSize) * (100 / gridSize),
    y: (100 / (gridSize * 2)) + Math.floor(index / gridSize) * (100 / gridSize),
  }))
  const linePoints = [...centers, ...(drawing && livePoint && path.length ? [livePoint] : [])]

  return (
    <div className="w-full select-none">
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finish}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
        onContextMenu={event => event.preventDefault()}
        className={`relative mx-auto aspect-square w-full ${compact ? 'max-w-[260px]' : 'max-w-[320px]'} rounded-2xl border border-border/70 bg-muted/35 p-3 sm:p-4`}
        style={{ touchAction: 'none', overscrollBehavior: 'contain', WebkitUserSelect: 'none' }}
      >
        <div ref={gridRef} className="relative grid h-full w-full" style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${gridSize}, minmax(0, 1fr))` }}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            {linePoints.length > 1 && <polyline points={linePoints.map(point => `${point.x},${point.y}`).join(' ')} fill="none" stroke="url(#archivePatternGradient)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.96" />}
            <defs><linearGradient id="archivePatternGradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#ec4899" /><stop offset="100%" stopColor="#a855f7" /></linearGradient></defs>
          </svg>
          {Array.from({ length: gridSize * gridSize }, (_, index) => {
            const selected = path.includes(index)
            return (
              <div key={index} className="pointer-events-none relative z-10 flex items-center justify-center" aria-hidden="true">
                <span className={`block rounded-full transition-[width,height,background-color,box-shadow] duration-100 ease-out ${selected ? 'h-5 w-5 bg-gradient-to-br from-pink-500 to-purple-500 shadow-[0_0_0_6px_rgba(217,70,239,0.16),0_0_18px_rgba(217,70,239,0.35)]' : 'h-3 w-3 bg-muted-foreground/55'}`} />
              </div>
            )
          })}
        </div>
      </div>
      <p className={`mt-3 min-h-5 text-center text-xs ${error ? 'text-red-500' : 'text-muted-foreground'}`}>{error || (showIdleHint ? 'Draw a pattern by connecting at least 4 dots.' : '')}</p>
    </div>
  )
}
