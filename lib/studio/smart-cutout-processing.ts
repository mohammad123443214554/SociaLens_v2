export const SMART_CUTOUT_MAX_MASK_BYTES = 3 * 1024 * 1024
export const SMART_CUTOUT_MAX_OUTPUT_BYTES = 20 * 1024 * 1024
export const SMART_CUTOUT_BACKGROUND_GROW_MASK = 3
export const SMART_CUTOUT_MAX_PIXELS = 9_437_184

export type SmartCutoutPngDimensions = { width: number; height: number }

/**
 * Reads the PNG IHDR dimensions without decoding the image. The PNG signature
 * and IHDR are part of the fixed PNG file header, so this is safe for upload
 * validation before the image is sent to the provider.
 */
export function readSmartCutoutPngDimensions(bytes: Uint8Array): SmartCutoutPngDimensions | null {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (bytes.length < 24 || !signature.every((value, index) => bytes[index] === value)) return null
  if (String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') return null

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  if (!width || !height || width < 64 || height < 64 || width * height > SMART_CUTOUT_MAX_PIXELS) return null
  return { width, height }
}

export function isSmartCutoutMaskValid(
  bytes: Uint8Array,
  expectedWidth: number,
  expectedHeight: number,
): boolean {
  if (!Number.isSafeInteger(expectedWidth) || !Number.isSafeInteger(expectedHeight)
    || expectedWidth < 64 || expectedHeight < 64
    || expectedWidth * expectedHeight > SMART_CUTOUT_MAX_PIXELS
    || bytes.length < 24 || bytes.length > SMART_CUTOUT_MAX_MASK_BYTES) return false

  const dimensions = readSmartCutoutPngDimensions(bytes)
  return Boolean(dimensions && dimensions.width === expectedWidth && dimensions.height === expectedHeight)
}

export function normalizeSmartCutoutPolygons(
  value: unknown,
  width: number,
  height: number,
): number[][][] {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < 64 || height < 64 || width * height > SMART_CUTOUT_MAX_PIXELS
    || !Array.isArray(value)) return []

  const polygons: number[][][] = []
  let totalPoints = 0
  for (const candidate of value.slice(0, 128)) {
    if (!Array.isArray(candidate) || candidate.length < 3) continue
    const points: number[][] = []
    for (const point of candidate.slice(0, 12_000)) {
      if (!Array.isArray(point) || point.length < 2) continue
      const x = Number(point[0])
      const y = Number(point[1])
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      const next: [number, number] = [
        Math.max(0, Math.min(width, x)),
        Math.max(0, Math.min(height, y)),
      ]
      const previous = points[points.length - 1]
      if (!previous || previous[0] !== next[0] || previous[1] !== next[1]) points.push(next)
      totalPoints++
      if (totalPoints >= 50_000) break
    }
    if (points.length >= 3) polygons.push(points)
    if (totalPoints >= 50_000) break
  }
  return polygons
}
