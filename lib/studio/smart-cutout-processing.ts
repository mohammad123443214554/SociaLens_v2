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
