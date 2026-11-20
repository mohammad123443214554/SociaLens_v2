export const STABILITY_ERASE_PATH = '/v2beta/stable-image/edit/erase'
export const STABILITY_INPAINT_PATH = '/v2beta/stable-image/edit/inpaint'
export const STABILITY_REMOVE_BACKGROUND_PATH = '/v2beta/stable-image/edit/remove-background'
export const STABILITY_ERASE_CREDITS = 5
export const STABILITY_OBJECT_ERASER_PROMPT = 'Photorealistic seamless reconstruction of the scene behind the precisely masked object. Remove the masked object completely as though it was never present. Continue the immediately surrounding background naturally across the entire masked area, matching adjacent textures, patterns, material grain, perspective, geometry, camera viewpoint, depth of field, lighting direction, exposure, color temperature, reflections and soft shadows. Blend boundaries invisibly with no seams or halos. Preserve every unmasked pixel and every unmasked object exactly as in the source photograph. Do not add, replace, decorate, duplicate, reinterpret or invent any object, subject, text or detail. The masked area must contain only a believable continuation of the surrounding scene.'
export const STABILITY_OBJECT_ERASER_NEGATIVE_PROMPT = 'the removed object, any object, replacement object, duplicate object, cup, mug, vase, teapot, decoration, new subject, object fragments, object silhouette, ghosting, halos, seams, blur, distorted texture, repeating pattern, text, watermark'

const ALLOWED_API_HOSTS = new Set(['api.stability.ai', 'stability.comfy.org'])

export function getStabilityImageApiBaseUrl(value = process.env.STABILITY_API_BASE_URL): string {
  const raw = value?.trim() || 'https://api.stability.ai'
  let parsed: URL
  try { parsed = new URL(raw) } catch { throw new Error('STABILITY_API_BASE_URL must be a valid HTTPS URL.') }
  if (parsed.protocol !== 'https:' || !ALLOWED_API_HOSTS.has(parsed.hostname) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('STABILITY_API_BASE_URL must be https://api.stability.ai or https://stability.comfy.org and must use an HTTPS URL.')
  }
  return parsed.origin
}

export type StabilityFailureCode = 'not_configured' | 'unauthorized' | 'insufficient_credits' | 'content_filtered' | 'image_too_large' | 'rate_limited' | 'invalid_request' | 'provider_unavailable' | 'provider_error'

export function mapStabilityApiError(status: number): { code: StabilityFailureCode; message: string; retryable: boolean; httpStatus: number } {
  if (status === 401) return { code: 'unauthorized', message: 'Stability AI rejected the API key. Check STABILITY_API_KEY in Vercel.', retryable: false, httpStatus: 401 }
  if (status === 402) return { code: 'insufficient_credits', message: 'The Stability AI account has insufficient credits. Add credits before trying again.', retryable: false, httpStatus: 402 }
  if (status === 403) return { code: 'content_filtered', message: 'The image edit was blocked by the provider safety filter. Your original image is unchanged.', retryable: false, httpStatus: 403 }
  if (status === 413) return { code: 'image_too_large', message: 'The image or mask is too large for the image editing service.', retryable: false, httpStatus: 413 }
  if (status === 422 || status === 400) return { code: 'invalid_request', message: 'Stability AI could not process this image or mask. Check the image dimensions and try again.', retryable: false, httpStatus: status }
  if (status === 429) return { code: 'rate_limited', message: 'Stability AI is rate limiting requests. Wait a moment before trying again.', retryable: true, httpStatus: 429 }
  if (status >= 500) return { code: 'provider_unavailable', message: 'Stability AI is temporarily unavailable. Your original image is unchanged; please try again later.', retryable: true, httpStatus: 503 }
  return { code: 'provider_error', message: 'Stability AI could not complete this image edit.', retryable: false, httpStatus: status >= 400 && status < 600 ? status : 502 }
}

export function mapStabilityBackgroundError(status: number): { code: StabilityFailureCode; message: string; retryable: boolean; httpStatus: number } {
  if (status === 401) return { code: 'unauthorized', message: 'Stability AI rejected the API key. Check STABILITY_API_KEY in Vercel.', retryable: false, httpStatus: 401 }
  if (status === 402) return { code: 'insufficient_credits', message: 'The Stability AI account has insufficient credits. Add credits before trying again.', retryable: false, httpStatus: 402 }
  if (status === 403) return { code: 'content_filtered', message: 'Stability AI could not process this photo. Your original image is unchanged.', retryable: false, httpStatus: 403 }
  if (status === 413) return { code: 'image_too_large', message: 'This photo is too large for Stability AI background removal.', retryable: false, httpStatus: 413 }
  if (status === 422 || status === 400) return { code: 'invalid_request', message: 'Stability AI could not process this photo. Use a clear JPEG, PNG or WebP image and try again.', retryable: false, httpStatus: status }
  if (status === 429) return { code: 'rate_limited', message: 'Stability AI is rate limiting requests. Wait a moment before trying again.', retryable: true, httpStatus: 429 }
  if (status >= 500) return { code: 'provider_unavailable', message: 'Stability AI is temporarily unavailable. Your original image is unchanged; please try again later.', retryable: true, httpStatus: 503 }
  return { code: 'provider_error', message: 'Stability AI could not remove this background.', retryable: false, httpStatus: status >= 400 && status < 600 ? status : 502 }
}

// Redeploy trigger: pick up the Stability AI environment configuration.
