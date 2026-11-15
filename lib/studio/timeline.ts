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

/**
 * Arrange clips on the single Media lane without allowing visual overlap.
 * Existing gaps are preserved; clips that collide are pushed to the right.
 */
export function arrangeStudioClips<T extends StudioTimelineClip & { id: string }>(clips: readonly T[]): T[] {
  const ordered = clips.map(clip => ({ ...clip, lane: 0 })).sort((a, b) => {
    const difference = a.timelineStart - b.timelineStart
    return difference || 0
  })
  let occupiedEnd = 0
  return ordered.map(clip => {
    const duration = Math.max(0.1, clip.trimEnd - clip.trimStart)
    const preferredStart = Number.isFinite(clip.timelineStart) ? Math.max(0, clip.timelineStart) : 0
    const timelineStart = Math.max(preferredStart, occupiedEnd)
    occupiedEnd = timelineStart + duration
    return { ...clip, timelineStart, lane: 0 }
  })
}

/**
 * Move a clip to a requested time and reflow the single Media lane.
 * Dropping inside another clip's occupied area reorders the clips instead
 * of stacking them on top of each other.
 */
export function moveStudioClipWithoutOverlap<T extends StudioTimelineClip & { id: string }>(
  clips: readonly T[],
  movingId: string,
  requestedStart: number,
): T[] {
  const moving = clips.find(clip => clip.id === movingId)
  if (!moving) return arrangeStudioClips(clips)
  const peers = clips.filter(clip => clip.id !== movingId).map(clip => ({ ...clip })).sort((a, b) => a.timelineStart - b.timelineStart)
  const safeStart = Number.isFinite(requestedStart) ? Math.max(0, requestedStart) : 0
  const insertionIndex = peers.findIndex(peer => {
    const peerDuration = Math.max(0.1, peer.trimEnd - peer.trimStart)
    return safeStart < peer.timelineStart + peerDuration / 2
  })
  const ordered = [...peers]
  ordered.splice(insertionIndex < 0 ? ordered.length : insertionIndex, 0, { ...moving, timelineStart: safeStart })
  let occupiedEnd = 0
  return ordered.map(clip => {
    const duration = Math.max(0.1, clip.trimEnd - clip.trimStart)
    const preferredStart = clip.id === movingId ? safeStart : (Number.isFinite(clip.timelineStart) ? Math.max(0, clip.timelineStart) : 0)
    const timelineStart = Math.max(preferredStart, occupiedEnd)
    occupiedEnd = timelineStart + duration
    return { ...clip, timelineStart, lane: 0 }
  })
}

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
