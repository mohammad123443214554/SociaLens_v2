export const STABILITY_INPAINT_PATH = '/v2beta/stable-image/edit/inpaint'
export const STABILITY_INPAINT_CREDITS = 5

const ALLOWED_API_HOSTS = new Set(['api.stability.ai', 'stability.comfy.org'])

export function getStabilityImageApiBaseUrl(value = process.env.STABILITY_API_BASE_URL): string {
  const raw = value?.trim() || 'https://api.stability.ai'
  let parsed: URL
  try { parsed = new URL(raw) } catch { throw new Error('STABILITY_API_BASE_URL must be a valid HTTPS URL.') }
  if (parsed.protocol !== 'https:' || !ALLOWED_API_HOSTS.has(parsed.hostname) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('STABILITY_API_BASE_URL must be https://api.stability.ai or https://stability.comfy.org.')
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

// Redeploy trigger: pick up the Stability AI environment configuration.
