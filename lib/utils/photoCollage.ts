import type { StoryCollageOverlay } from '@/lib/types/database.types'

export type PhotoCollageLayout = StoryCollageOverlay['layout']
export type PhotoCollagePosition = Pick<StoryCollageOverlay['photos'][number], 'x' | 'y' | 'width' | 'height'>

export function isValidPhotoCollageCount(count: number): boolean {
  return Number.isInteger(count) && count >= 2 && count <= 6
}

export function getPhotoCollagePositions(count: number, layout: PhotoCollageLayout): PhotoCollagePosition[] {
  if (!Number.isInteger(count) || count < 1 || count > 6) return []
  return Array.from({ length: count }, (_, i): PhotoCollagePosition => {
    if (layout === 'vertical') {
      return count === 2
        ? (i === 0 ? { x: 2, y: 2, width: 96, height: 48 } : { x: 2, y: 50, width: 96, height: 48 })
        : { x: 2, y: 2 + i * (96 / count), width: 96, height: 96 / count - 2 }
    }
    if (layout === 'horizontal') {
      return count === 2
        ? (i === 0 ? { x: 2, y: 2, width: 48, height: 96 } : { x: 50, y: 2, width: 48, height: 96 })
        : { x: 2 + i * (96 / count), y: 2, width: 96 / count - 2, height: 96 }
    }
    if (layout === 'editorial' && count > 2) {
      return i === 0
        ? { x: 2, y: 2, width: 62, height: 96 }
        : { x: 66, y: 2 + (i - 1) * (94 / (count - 1)), width: 32, height: 94 / (count - 1) - 2 }
    }
    if (layout === 'scrapbook') return { x: 8 + (i % 3) * 25, y: 8 + (i % 2) * 32, width: 48, height: 58 }
    const cols = count === 2 ? 2 : count === 3 ? 2 : count === 5 || count === 6 ? 3 : 2
    const rows = Math.ceil(count / cols)
    const col = i % cols, row = Math.floor(i / cols)
    return { x: col * (96 / cols) + 2, y: row * (96 / rows) + 2, width: 96 / cols - 2, height: 96 / rows - 2 }
  })
}
