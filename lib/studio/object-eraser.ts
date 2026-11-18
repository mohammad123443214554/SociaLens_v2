export const OBJECT_ERASER_MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const ROBOFLOW_REQUEST_TIMEOUT_MS = 45_000

export type ObjectEraserImageType = 'image/jpeg' | 'image/png' | 'image/webp'
export type PreparedObjectEraserImage = {
  mimeType: ObjectEraserImageType
  size: number
  sha256: string
  base64: string
}

export type RoboflowFailureCode =
  | 'not_configured'
  | 'unauthorized'
  | 'quota_exceeded'
  | 'image_too_large'
  | 'model_not_found'
  | 'provider_unavailable'
  | 'request_timeout'
  | 'provider_error'

export class RoboflowRequestError extends Error {
  constructor(
    message: string,
    public readonly code: RoboflowFailureCode,
    public readonly status: number,
    public readonly retryable = false,
  ) {
    super(message)
    this.name = 'RoboflowRequestError'
  }
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
  return {
    configured: Boolean(process.env.ROBOFLOW_API_KEY?.trim()),
    provider: 'roboflow' as const,
  }
}

export function getRoboflowRequestError(status: number): RoboflowRequestError {
  if (status === 401 || status === 403) {
    return new RoboflowRequestError('Roboflow rejected the API key. Check the Vercel environment variable.', 'unauthorized', status)
  }
  if (status === 402 || status === 429) {
    return new RoboflowRequestError('Roboflow usage limit or quota has been reached. Check your workspace usage before retrying.', 'quota_exceeded', status)
  }
  if (status === 413) {
    return new RoboflowRequestError('Roboflow rejected the image because it is too large.', 'image_too_large', status)
  }
  if (status === 404) {
    return new RoboflowRequestError('The configured Roboflow model or endpoint was not found.', 'model_not_found', status)
  }
  if (status >= 500) {
    return new RoboflowRequestError('Roboflow is temporarily unavailable. Please try again later.', 'provider_unavailable', status, true)
  }
  return new RoboflowRequestError('Roboflow could not process this request.', 'provider_error', status, status === 408)
}

export async function requestRoboflow(path: string, body: BodyInit, contentType: string) {
  const apiKey = process.env.ROBOFLOW_API_KEY?.trim()
  if (!apiKey) {
    throw new RoboflowRequestError('Roboflow is not configured yet.', 'not_configured', 503)
  }
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('..') || path.includes('?') || path.includes('#')) {
    throw new RoboflowRequestError('Invalid Roboflow endpoint configuration.', 'provider_error', 500)
  }

  const url = new URL(path, 'https://serverless.roboflow.com')
  url.searchParams.set('api_key', apiKey)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ROBOFLOW_REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body,
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!response.ok) throw getRoboflowRequestError(response.status)
    return response
  } catch (error) {
    if (error instanceof RoboflowRequestError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new RoboflowRequestError('Roboflow took too long to respond. Please try again.', 'request_timeout', 504, true)
    }
    throw new RoboflowRequestError('Could not connect to Roboflow. Please try again later.', 'provider_unavailable', 503, true)
  } finally {
    clearTimeout(timeout)
  }
}
