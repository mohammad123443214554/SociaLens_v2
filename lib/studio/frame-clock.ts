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

export function studioFrameTimeFromElapsedMs(elapsedMs: number, frameRate = STUDIO_FRAME_RATE): number {
  const safeElapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0
  return studioFrameTime(Math.floor((safeElapsed * frameRate) / 1000 + 1e-7), frameRate)
}
