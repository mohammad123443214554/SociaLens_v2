import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { detectObjectEraserImageType, OBJECT_ERASER_MAX_IMAGE_BYTES } from '@/lib/studio/object-eraser'
import { getStabilityImageApiBaseUrl, mapStabilityBackgroundError, STABILITY_REMOVE_BACKGROUND_PATH } from '@/lib/studio/stability-inpaint'

export const runtime = 'nodejs'
export const maxDuration = 60
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' }
const fail = (message: string, status: number, code: string, retryable = false) =>
  NextResponse.json({ ok: false, error: message, code, retryable }, { status, headers: NO_STORE })

async function getUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return error || !user ? null : user
}

function safeProviderMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') return fallback
  const record = payload as Record<string, unknown>
  const errors = Array.isArray(record.errors) ? record.errors.filter(item => typeof item === 'string').join('; ') : ''
  const detail = errors || (typeof record.message === 'string' ? record.message : typeof record.detail === 'string' ? record.detail : '')
  return (detail || fallback)
    .replace(/https?:[^\s]+/g, '[provider URL]')
    .replace(/(?:api[_-]?key|authorization)[=: ]+[^&\s,]+/gi, '[redacted]')
    .slice(0, 400)
}

export async function POST(request: NextRequest) {
  const user = await getUser()
  if (!user) return fail('Please sign in to use Background Eraser.', 401, 'unauthorized')

  const apiKey = process.env.STABILITY_API_KEY?.trim()
  if (!apiKey) return fail('Stability AI is not configured. Add STABILITY_API_KEY to Vercel Environment Variables.', 503, 'not_configured')

  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > OBJECT_ERASER_MAX_IMAGE_BYTES + 256 * 1024) {
    return fail('The original photo must be 4 MB or smaller for background removal.', 413, 'image_too_large')
  }

  let form: FormData
  try { form = await request.formData() } catch { return fail('Could not read the photo upload. Please try again.', 400, 'invalid_upload') }
  const image = form.get('image')
  if (!(image instanceof File)) return fail('Please attach the original photo.', 400, 'missing_image')
  if (image.size <= 0) return fail('The selected photo is empty.', 400, 'invalid_image')
  if (image.size > OBJECT_ERASER_MAX_IMAGE_BYTES) return fail('The original photo must be 4 MB or smaller for background removal.', 413, 'image_too_large')

  const imageBytes = new Uint8Array(await image.arrayBuffer())
  const mimeType = detectObjectEraserImageType(imageBytes)
  if (!mimeType || (image.type && image.type !== mimeType)) {
    return fail('The selected file is not a valid JPEG, PNG or WebP photo.', 415, 'invalid_image')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 52_000)
  try {
    const stabilityForm = new FormData()
    stabilityForm.set(
      'image',
      new Blob([imageBytes.buffer.slice(imageBytes.byteOffset, imageBytes.byteOffset + imageBytes.byteLength) as ArrayBuffer], { type: mimeType }),
      image.name || 'original-photo'
    )
    // Stability's dedicated Remove Background endpoint accepts the complete
    // original image and output format. It has no prompt, mask, or object list:
    // do not add generation instructions or pre-segment/crop the source image.
    stabilityForm.set('output_format', 'png')

    let upstream: Response
    try {
      upstream = await fetch(getStabilityImageApiBaseUrl() + STABILITY_REMOVE_BACKGROUND_PATH, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + apiKey, Accept: 'image/*' },
        body: stabilityForm,
        cache: 'no-store',
        signal: controller.signal,
      })
    } catch (error) {
      if (error instanceof Error && error.message.includes('STABILITY_API_BASE_URL')) {
        return fail(error.message, 500, 'invalid_provider_configuration')
      }
      if (error instanceof Error && error.name === 'AbortError') {
        return fail('Stability AI took too long to remove the background. Your original photo is unchanged; please try again.', 504, 'request_timeout', true)
      }
      return fail('Could not connect to Stability AI. Please try again later.', 503, 'provider_unavailable', true)
    }

    if (!upstream.ok) {
      let payload: unknown = null
      try { payload = await upstream.json() } catch { /* provider returned no JSON body */ }
      const mapped = mapStabilityBackgroundError(upstream.status)
      return fail(safeProviderMessage(payload, mapped.message), mapped.httpStatus, mapped.code, mapped.retryable)
    }

    const outputBytes = new Uint8Array(await upstream.arrayBuffer())
    const outputMime = (upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (!outputBytes.length || outputBytes.length > 20 * 1024 * 1024 || outputMime !== 'image/png' || detectObjectEraserImageType(outputBytes) !== 'image/png') {
      return fail('Stability AI returned an invalid background-removal PNG. Your original photo is unchanged.', 502, 'invalid_provider_response')
    }

    const outputBuffer = outputBytes.buffer.slice(outputBytes.byteOffset, outputBytes.byteOffset + outputBytes.byteLength) as ArrayBuffer
    return new NextResponse(outputBuffer, {
      status: 200,
      headers: {
        ...NO_STORE,
        'Content-Type': 'image/png',
        'Content-Length': String(outputBytes.length),
        'X-Background-Eraser-Provider': 'stability-ai',
      },
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return fail('Preparing the original photo timed out. Your original image is unchanged; please try again.', 504, 'request_timeout', true)
    }
    return fail('Could not prepare the original photo for Stability AI. Your original image is unchanged.', 500, 'image_preparation_failed')
  } finally {
    clearTimeout(timeout)
  }
}
