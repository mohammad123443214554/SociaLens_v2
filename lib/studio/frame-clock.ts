/**
 * Shared 30fps project clock used by Studio preview and canvas export.
 * Animation sampling always lands on the same frame boundary in both paths.
 */
export const STUDIO_FRAME_RATE = 30
export const STUDIO_FRAME_DURATION_MS = 1000 / STUDIO_FRAME_RATE
export const STUDIO_FRAME_DURATION_SECONDS = 1 / STUDIO_FRAME_RATE

export function studioFrameTime(frameIndex: number, frameRate = STUDIO_FRAME_RATE): number {
  const safeRate = Number.isFinite(frameRate) && frameRate > 0 ? frameRate : STUDIO_FRAME_RATE
  const safeFrame = Number.isFinite(frameIndex) ? Math.max(0, Math.floor(frameIndex)) : 0
  return safeFrame / safeRate
}

export function studioFrameIndexAtTime(seconds: number, frameRate = STUDIO_FRAME_RATE): number {
  const safeRate = Number.isFinite(frameRate) && frameRate > 0 ? frameRate : STUDIO_FRAME_RATE
  const safeTime = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  return Math.floor(safeTime * safeRate + 1e-7)
}

export function quantizeStudioTime(seconds: number, frameRate = STUDIO_FRAME_RATE): number {
  return studioFrameTime(studioFrameIndexAtTime(seconds, frameRate), frameRate)
}

/** Return the final renderable frame strictly before the project's exclusive end time. */
export function lastStudioFrameBeforeEnd(projectEndSeconds: number, frameRate = STUDIO_FRAME_RATE): number {
  const safeRate = Number.isFinite(frameRate) && frameRate > 0 ? frameRate : STUDIO_FRAME_RATE
  const safeEnd = Number.isFinite(projectEndSeconds) ? Math.max(0, projectEndSeconds) : 0
  return quantizeStudioTime(Math.max(0, safeEnd - 1 / safeRate), safeRate)
}

export function studioFrameTimeFromElapsedMs(elapsedMs: number, frameRate = STUDIO_FRAME_RATE): number {
  const safeElapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0
  return studioFrameTime(Math.floor((safeElapsed * frameRate) / 1000 + 1e-7), frameRate)
}

/** Audio may advance over still images/gaps, but must wait for an active video decoder. */
export function canAdvanceStudioAudio(activeVideo: boolean, videoReady: boolean): boolean {
  return !activeVideo || videoReady
}

/**
 * Playback time must never move backwards when the decoder clock and RAF clock
 * are sampled on adjacent frame boundaries.
 */
export function keepStudioTimeMonotonic(candidateSeconds: number, previousSeconds: number): number {
  const candidate = Number.isFinite(candidateSeconds) ? Math.max(0, candidateSeconds) : 0
  const previous = Number.isFinite(previousSeconds) ? Math.max(0, previousSeconds) : 0
  return Math.max(candidate, previous)
}

/**
 * Convert elapsed wall-clock time into the Studio timeline, anchored at the
 * requested start position exactly once. The caller's monotonic clock must be
 * initialized with performance.now(), not performance.now() - startAt.
 */
export function studioPlaybackTimeFromElapsedMs(startAtSeconds: number, elapsedMs: number, frameRate = STUDIO_FRAME_RATE): number {
  const safeStart = Number.isFinite(startAtSeconds) ? Math.max(0, startAtSeconds) : 0
  const safeElapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0
  return quantizeStudioTime(safeStart + safeElapsed / 1000, frameRate)
}

/**
 * Restart from zero when playback is already on the final visible frame.
 * projectEnd is exclusive, so the final frame itself is still below it.
 */
export function studioPlaybackStartTime(playheadSeconds: number, projectEndSeconds: number, frameRate = STUDIO_FRAME_RATE): number {
  const playhead = Number.isFinite(playheadSeconds) ? Math.max(0, playheadSeconds) : 0
  const projectEnd = Number.isFinite(projectEndSeconds) ? Math.max(0, projectEndSeconds) : 0
  if (projectEnd <= 0) return 0
  return playhead >= lastStudioFrameBeforeEnd(projectEnd, frameRate) ? 0 : playhead
}
