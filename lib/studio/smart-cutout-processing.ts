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


/** Returns true only for PNG encodings that can retain a real alpha channel. */
export function hasSmartCutoutPngAlpha(bytes: Uint8Array): boolean {
  return bytes.length >= 26 && (bytes[25] === 4 || bytes[25] === 6)
}


/** Strengthens semi-transparent foreground alpha while preserving feathered edges. */
export function strengthenSmartCutoutAlpha(alpha: number): number {
  if (!Number.isFinite(alpha)) return 0
  const normalized = Math.max(0, Math.min(255, alpha)) / 255
  return Math.round((1 - (1 - normalized) * (1 - normalized)) * 255)
}

/**
 * Use SAM3's instance mask as the authoritative opaque object interior.
 * Stability's alpha is retained only in a narrow dilation band around that
 * mask, where it can contribute antialiased fine edges without washing out
 * the object's body or allowing distant background pixels through.
 */
export function combineSmartCutoutAlpha(
  refinedAlpha: Uint8ClampedArray | Uint8Array,
  instanceMask: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  edgeRadius = 4,
): Uint8Array {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < 1 || height < 1 || width * height > SMART_CUTOUT_MAX_PIXELS
    || refinedAlpha.length !== width * height || instanceMask.length !== width * height
    || !Number.isSafeInteger(edgeRadius) || edgeRadius < 0 || edgeRadius > 12) {
    throw new Error('Smart Cutout alpha masks have invalid dimensions.')
  }
  const output = new Uint8Array(width * height)
  const radiusSquared = edgeRadius * edgeRadius
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x
      if (instanceMask[index] >= 128) {
        output[index] = 255
        continue
      }
      let nearInstance = false
      for (let dy = -edgeRadius; dy <= edgeRadius && !nearInstance; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= height) continue
        for (let dx = -edgeRadius; dx <= edgeRadius; dx++) {
          if (dx * dx + dy * dy > radiusSquared) continue
          const nx = x + dx
          if (nx < 0 || nx >= width) continue
          if (instanceMask[ny * width + nx] >= 128) {
            nearInstance = true
            break
          }
        }
      }
      output[index] = nearInstance ? refinedAlpha[index] : 0
    }
  }
  return output
}
