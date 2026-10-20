'use client'

import { useRef, useState } from 'react'
import { Plus, Music as MusicIcon, MoreVertical, Minus, ZoomIn } from 'lucide-react'
import type { GlobalMusic } from '@/lib/types/database.types'
import { SceneMenu, SceneMenuItem } from './SceneMenu'

interface BaseScene {
  id: string
  duration: number
}

interface StoryTimelineProps<T extends BaseScene> {
  scenes: T[]
  activeSceneId: string
  onSelectScene: (id: string) => void
  onAddScene: () => void
  onResizeScene: (id: string, duration: number) => void
  onReorderScenes?: (fromId: string, toId: string) => void
  renderBlock: (scene: T, index: number) => React.ReactNode
  getMenuItems: (scene: T) => SceneMenuItem[]
  globalMusic: GlobalMusic | null
  onOpenGlobalMusic: () => void
  trackIcon: React.ReactNode
  resizable?: boolean
  canvasZoom?: number
  onCanvasZoomChange?: (zoom: number) => void
}

const BASE_PX_PER_SECOND = 20
const MIN_SCENE_DURATION = 1
const MAX_SCENE_DURATION = 60
// Touch drags report much smaller pixel deltas than mouse drags for the
// same physical finger movement on most phones, so the resize handle felt
// almost unresponsive - this multiplier makes a small finger drag move the
// duration a lot more, on touch specifically.
const TOUCH_SENSITIVITY = 4

export function StoryTimeline<T extends BaseScene>({
  scenes, activeSceneId, onSelectScene, onAddScene, onResizeScene, onReorderScenes, renderBlock, getMenuItems,
  globalMusic, onOpenGlobalMusic, trackIcon, resizable = true, canvasZoom = 80, onCanvasZoomChange,
}: StoryTimelineProps<T>) {
  const [menuFor, setMenuFor] = useState<{ id: string; x: number; y: number } | null>(null)
  const [draggingSceneId, setDraggingSceneId] = useState<string | null>(null)
  // Timeline zoom changes the actual time scale (ruler and clip widths), not just the displayed percentage.
  const PX_PER_SECOND = BASE_PX_PER_SECOND * (canvasZoom / 80)
  const resizing = useRef<{ id: string; startX: number; startDuration: number; isTouch: boolean } | null>(null)

  const totalSeconds = scenes.reduce((sum, s) => sum + s.duration, 0)
  const rulerSeconds = Math.max(30, Math.ceil(totalSeconds / 10) * 10 + 10)
  const rulerStep = 5

  const handleResizeStart = (e: React.PointerEvent, scene: T) => {
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    resizing.current = { id: scene.id, startX: e.clientX, startDuration: scene.duration, isTouch: e.pointerType === 'touch' }
  }
  const handleResizeMove = (e: React.PointerEvent) => {
    if (!resizing.current) return
    const sensitivity = resizing.current.isTouch ? TOUCH_SENSITIVITY : 1
    const deltaSeconds = ((e.clientX - resizing.current.startX) * sensitivity) / PX_PER_SECOND
    const next = Math.round(Math.min(MAX_SCENE_DURATION, Math.max(MIN_SCENE_DURATION, resizing.current.startDuration + deltaSeconds)))
    onResizeScene(resizing.current.id, next)
  }
  const handleResizeEnd = () => { resizing.current = null }

  const menuScene = menuFor ? scenes.find((s) => s.id === menuFor.id) : null

  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden bg-transparent px-3 pt-2 pb-3 space-y-1.5 text-white">
      {/* Ruler */}
      <div className="relative h-4 overflow-x-auto scrollbar-hide">
        <div className="relative h-full" style={{ width: `${rulerSeconds * PX_PER_SECOND}px` }}>
          {Array.from({ length: Math.floor(rulerSeconds / rulerStep) + 1 }).map((_, i) => (
            <span key={i} className="absolute top-0 text-[10px] text-neutral-500 dark:text-white/45" style={{ left: `${i * rulerStep * PX_PER_SECOND}px` }}>
              {i * rulerStep}s
            </span>
          ))}
        </div>
      </div>

      {/* Scenes track */}
      <div className="flex items-center gap-2">
        <span className="shrink-0">{trackIcon}</span>
        <div
          className="flex-1 flex items-center gap-[3px] overflow-x-auto scrollbar-hide"
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
        >
          {scenes.map((scene, i) => (
            <div
              key={scene.id}
              onClick={() => onSelectScene(scene.id)}
              draggable={!!onReorderScenes}
              onDragStart={(e) => { if (!onReorderScenes) return; setDraggingSceneId(scene.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', scene.id) }}
              onDragOver={(e) => { if (onReorderScenes && draggingSceneId && draggingSceneId !== scene.id) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } }}
              onDrop={(e) => { if (!onReorderScenes) return; e.preventDefault(); const fromId = e.dataTransfer.getData('text/plain') || draggingSceneId; if (fromId && fromId !== scene.id) onReorderScenes(fromId, scene.id); setDraggingSceneId(null) }}
              onDragEnd={() => setDraggingSceneId(null)}
              style={{ width: `${Math.max(scene.duration * PX_PER_SECOND, 50)}px` }}
              className={`relative h-10 shrink-0 rounded-md flex items-center px-2 cursor-pointer transition-colors overflow-hidden ${scene.id === activeSceneId ? 'ring-2 ring-white bg-pink-500' : 'bg-white/15 hover:bg-white/25'} ${draggingSceneId === scene.id ? 'opacity-40' : ''}`}
            >
              {renderBlock(scene, i)}

              {scene.id === activeSceneId && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                      setMenuFor(menuFor?.id === scene.id ? null : { id: scene.id, x: rect.left, y: rect.top })
                    }}
                    className="relative z-10 h-5 w-5 shrink-0 rounded-full bg-black/40 flex items-center justify-center ml-1"
                  >
                    <MoreVertical className="h-3 w-3 text-white" />
                  </button>
                  {/* Drag handle to resize this scene's duration - a bigger
                      invisible touch target than it looks, so it's easy to
                      grab on a phone. Hidden when duration is fixed by the
                      media itself (e.g. a video clip's own length). */}
                  {resizable && (
                    <div
                      onPointerDown={(e) => handleResizeStart(e, scene)}
                      className="absolute -right-2 top-0 h-full w-6 cursor-ew-resize flex items-center justify-center touch-none z-10"
                    >
                      <div className="h-6 w-1.5 rounded-full bg-white" />
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
          <button
            onClick={onAddScene}
            className="h-10 w-10 shrink-0 rounded-md bg-white/10 border border-dashed border-white/40 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
            title="Add another scene"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Music track - one song shared across the whole story. Scenes with
          their own separate song override this for just their own duration. */}
      <div className="flex items-center gap-2">
        <span className="w-3.5 shrink-0" aria-hidden="true" />
        {globalMusic ? (
          <button
            onClick={onOpenGlobalMusic}
            className="flex-1 flex items-center gap-2 h-9 rounded-md bg-white/15 px-2 hover:bg-white/25 transition-colors"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={globalMusic.artworkUrl} alt={globalMusic.title} className="h-6 w-6 rounded object-cover shrink-0" />
            <span className="text-[11px] text-white truncate flex-1 text-left">
              {globalMusic.title} &middot; {globalMusic.artist}
            </span>
            <span className="text-[10px] text-white/50 shrink-0">Trim</span>
          </button>
        ) : (
          <div className="flex-1 h-2" aria-hidden="true" />
        )}
      </div>

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-neutral-200 dark:border-white/10">
        <span className="text-[11px] text-neutral-500 dark:text-white/45">Page zoom</span>
        <button type="button" onClick={() => onCanvasZoomChange?.(Math.max(40, canvasZoom - 5))} disabled={canvasZoom <= 40} className="h-7 w-7 rounded-md flex items-center justify-center text-neutral-600 dark:text-white/70 hover:bg-neutral-200 dark:hover:bg-white/10 disabled:opacity-30" aria-label="Zoom out"><Minus className="h-4 w-4" /></button>
        <input aria-label="Timeline zoom" type="range" min="40" max="160" step="5" value={canvasZoom} onChange={(e) => onCanvasZoomChange?.(Number(e.target.value))} className="w-28 accent-pink-500 cursor-pointer" />
        <button type="button" onClick={() => onCanvasZoomChange?.(Math.min(160, canvasZoom + 5))} disabled={canvasZoom >= 160} className="h-7 w-7 rounded-md flex items-center justify-center text-neutral-600 dark:text-white/70 hover:bg-neutral-200 dark:hover:bg-white/10 disabled:opacity-30" aria-label="Zoom in"><ZoomIn className="h-4 w-4" /></button>
        <span className="w-8 text-right text-[11px] tabular-nums text-neutral-500 dark:text-white/45">{canvasZoom}%</span>
      </div>

      {/* Rendered fixed to the viewport (not inside the horizontally-
          scrolling track above) so it never gets clipped by that track's
          overflow. */}
      {menuFor && menuScene && (
        <SceneMenu
          anchorX={menuFor.x}
          anchorY={menuFor.y}
          items={getMenuItems(menuScene)}
          onClose={() => setMenuFor(null)}
        />
      )}
    </div>
  )
}
