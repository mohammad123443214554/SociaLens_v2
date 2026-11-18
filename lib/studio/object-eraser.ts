export const OBJECT_ERASER_MAX_IMAGE_BYTES = 10 * 1024 * 1024

export type ObjectEraserImageType = 'image/jpeg' | 'image/png' | 'image/webp'

export type PreparedObjectEraserImage = {
  mimeType: ObjectEraserImageType
  size: number
  sha256: string
  base64: string
}

const SIGNATURES: Array<{ mimeType: ObjectEraserImageType; matches: (bytes: Uint8Array) => boolean }> = [
  { mimeType: 'image/jpeg', matches: bytes => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  { mimeType: 'image/png', matches: bytes => bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a },
  { mimeType: 'image/webp', matches: bytes => bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP' },
]

export function detectObjectEraserImageType(bytes: Uint8Array): ObjectEraserImageType | null {
  return SIGNATURES.find(signature => signature.matches(bytes))?.mimeType ?? null
}

export async function prepareObjectEraserImage(file: File): Promise<PreparedObjectEraserImage> {
  if (!file || file.size <= 0) throw new Error('Please choose a non-empty image.')
  if (file.size > OBJECT_ERASER_MAX_IMAGE_BYTES) throw new Error('Image is too large. Please use an image up to 10 MB.')

  const bytes = new Uint8Array(await file.arrayBuffer())
  const mimeType = detectObjectEraserImageType(bytes)
  if (!mimeType) throw new Error('Unsupported or invalid image. Use a JPEG, PNG, or WebP image.')
  if (file.type && file.type !== mimeType) throw new Error('The image file type does not match its contents.')

  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }

  return { mimeType, size: bytes.byteLength, sha256, base64: btoa(binary) }
}

export function getRoboflowConfiguration() {
  const apiKey = process.env.ROBOFLOW_API_KEY?.trim()
  return {
    configured: Boolean(apiKey),
    provider: 'roboflow' as const,
    // The key is deliberately never returned to the browser.
  }
}
