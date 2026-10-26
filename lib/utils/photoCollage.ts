import type { StoryCollageOverlay } from '@/lib/types/database.types'

export type PhotoCollageLayout = StoryCollageOverlay['layout']
export type PhotoCollagePosition = Pick<StoryCollageOverlay['photos'][number], 'x' | 'y' | 'width' | 'height'>

export function isValidPhotoCollageCount(count: number): boolean {
  return Number.isInteger(count) && count >= 2
}

function gridPosition(index: number, count: number, columns: number, bounds = { x: 2, y: 2, width: 96, height: 96 }): PhotoCollagePosition {
  const rows = Math.ceil(count / columns)
  const cellWidth = bounds.width / columns
  const cellHeight = bounds.height / rows
  const col = index % columns
  const row = Math.floor(index / columns)
  const gap = Math.min(2, cellWidth * 0.04, cellHeight * 0.04)
  return {
    x: bounds.x + col * cellWidth + gap / 2,
    y: bounds.y + row * cellHeight + gap / 2,
    width: Math.max(1, cellWidth - gap),
    height: Math.max(1, cellHeight - gap),
  }
}

export function getPhotoCollagePositions(count: number, layout: PhotoCollageLayout): PhotoCollagePosition[] {
  if (!Number.isInteger(count) || count < 1) return []

  return Array.from({ length: count }, (_, i): PhotoCollagePosition => {
    if (layout === 'vertical') return gridPosition(i, count, 1)
    if (layout === 'horizontal') return gridPosition(i, count, count)
    if (layout === 'editorial' || layout === 'vintage') {
      if (count === 1) return { x: 2, y: 2, width: 96, height: 96 }
      if (i === 0) return { x: 2, y: 2, width: 60, height: 96 }
      return gridPosition(i - 1, count - 1, 1, { x: 64, y: 2, width: 34, height: 96 })
    }
    if (layout === 'birthday') {
      if (count === 1) return { x: 2, y: 2, width: 96, height: 96 }
      if (i === 0) return { x: 2, y: 2, width: 96, height: 56 }
      return gridPosition(i - 1, count - 1, Math.min(3, count - 1), { x: 2, y: 60, width: 96, height: 38 })
    }
    if (layout === 'memory-wall') {
      const cols = count === 2 ? 2 : 2
      const rows = Math.ceil(count / cols)
      const col = i % cols
      const row = Math.floor(i / cols)
      const cellWidth = 48
      const cellHeight = 96 / rows
      const offset = col === 0 ? 2 : 50
      return { x: offset, y: 2 + row * cellHeight, width: cellWidth - 2, height: Math.max(1, cellHeight - 2) }
    }
    if (layout === 'film-strip') {
      const columns = Math.min(3, count)
      const rows = Math.ceil(count / columns)
      const cell = gridPosition(i, count, columns, { x: 5, y: 5, width: 90, height: 90 })
      return { ...cell, y: cell.y + 1, height: Math.max(1, cell.height - 2) }
    }
    if (layout === 'torn-paper') {
      const cols = count === 2 ? 2 : count === 3 ? 2 : 3
      const pos = gridPosition(i, count, cols, { x: 3, y: 4, width: 94, height: 92 })
      return { ...pos, x: pos.x + (i % 2 ? 1 : 0), y: pos.y + (i % 2 ? 1 : 0), width: Math.max(1, pos.width - 1), height: Math.max(1, pos.height - 1) }
    }
    if (layout === 'polaroid-wall') {
      const cols = count <= 2 ? count : count <= 4 ? 2 : 3
      const base = gridPosition(i, count, cols, { x: 3, y: 3, width: 94, height: 92 })
      return { ...base, y: base.y + 1, height: Math.max(1, base.height - 2) }
    }
    if (layout === 'mosaic') {
      if (count === 1) return { x: 2, y: 2, width: 96, height: 96 }
      if (i === 0) return { x: 2, y: 2, width: 57, height: 58 }
      if (i === 1) return { x: 61, y: 2, width: 37, height: 28 }
      if (i === 2) return { x: 61, y: 32, width: 37, height: 28 }
      const remaining = count - 3
      const position = gridPosition(i - 3, remaining, Math.max(1, Math.min(4, remaining)), { x: 2, y: 62, width: 96, height: 36 })
      return position
    }
    if (layout === 'scrapbook') {
      // Preserve the layered scrapbook look for small sets, while ensuring every
      // selected image remains visible when users add larger collections.
      if (count <= 6) return { x: 4 + (i % 3) * 29, y: 5 + (i % 2) * 38, width: 36, height: 55 }
      return gridPosition(i, count, Math.min(3, count))
    }
    const cols = count === 2 ? 2 : count === 3 ? 2 : count <= 4 ? 2 : Math.min(4, Math.ceil(Math.sqrt(count)))
    return gridPosition(i, count, cols)
  })
}
