/**
 * Timeline helpers shared by Studio editing and playback.
 *
 * Small gaps are usually pointer-placement residue rather than intentional edits.
 * At 16px/second, 350ms is about 5.6px: enough to catch a visually tiny gap while
 * leaving deliberate pauses intact.
 */
export type StudioTimelineClip = {
  timelineStart: number
  trimStart: number
  trimEnd: number
  lane?: number
}

export const STUDIO_CLIP_GAP_SNAP_SECONDS = 0.35

export function normalizeStudioClipGaps<T extends StudioTimelineClip>(
  clips: readonly T[],
  snapThresholdSeconds = STUDIO_CLIP_GAP_SNAP_SECONDS,
): T[] {
  if (clips.length === 0) return []

  const threshold = Number.isFinite(snapThresholdSeconds)
    ? Math.max(0, snapThresholdSeconds)
    : STUDIO_CLIP_GAP_SNAP_SECONDS
  const normalized = clips.map(clip => ({ ...clip }))
  const laneIndexes = new Map<number, number[]>()

  normalized.forEach((clip, index) => {
    const lane = Number.isFinite(clip.lane) ? Math.max(0, Math.floor(clip.lane as number)) : 0
    const indexes = laneIndexes.get(lane) || []
    indexes.push(index)
    laneIndexes.set(lane, indexes)
  })

  for (const indexes of laneIndexes.values()) {
    indexes.sort((left, right) => {
      const difference = normalized[left].timelineStart - normalized[right].timelineStart
      return difference || left - right
    })

    let occupiedEnd: number | null = null
    for (const index of indexes) {
      const clip = normalized[index]
      const duration = Math.max(0, clip.trimEnd - clip.trimStart)
      const start = Number.isFinite(clip.timelineStart) ? Math.max(0, clip.timelineStart) : 0
      const gap = occupiedEnd === null ? 0 : start - occupiedEnd

      if (occupiedEnd !== null && gap > 0.0001 && gap <= threshold) {
        clip.timelineStart = occupiedEnd
      } else {
        clip.timelineStart = start
      }

      occupiedEnd = Math.max(occupiedEnd ?? 0, clip.timelineStart + duration)
    }
  }

  return normalized
}
