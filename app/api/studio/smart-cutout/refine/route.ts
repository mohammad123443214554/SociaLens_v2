import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasSmartCutoutPngAlpha, readSmartCutoutPngDimensions, SMART_CUTOUT_MAX_OUTPUT_BYTES } from '@/lib/studio/smart-cutout-processing'
import { detectObjectEraserImageType } from '@/lib/studio/object-eraser'
import { getStabilityImageApiBaseUrl, mapStabilityBackgroundError, STABILITY_REMOVE_BACKGROUND_PATH } from '@/lib/studio/stability-inpaint'

export const runtime = 'nodejs'
export const maxDuration = 60

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' }
const MAX_CROP_BYTES = 4 * 1024 * 1024
const fail = (message: string, status: number, code: string, retryable = false) =>
  NextResponse.json({ ok: false, error: message, code, retryable }, { status, headers: NO_STORE })

function safeProviderMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') return fallback
  const record = payload as Record<string, unknown>
  const errors = Array.isArray(record.errors)
    ? record.errors.filter(item => typeof item === 'string').join('; ')
    : ''
  const detail = errors || (typeof record.message === 'string'
    ? record.message
    : typeof record.detail === 'string' ? record.detail : '')
  return (detail || fallback)
    .replace(/https?:\/\/\S+/g, '[provider URL]')
    .replace(/(?:api[_-]?key|authorization)[=: ]+[^&\s,]+/gi, '[redacted]')
    .slice(0, 400)
}

export async function POST(request: NextRequest) {
  const userClient = await createClient()
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return fail('Please sign in to refine Smart Cutout objects.', 401, 'unauthorized')

  const stabilityKey = process.env.STABILITY_API_KEY?.trim()
  if (!stabilityKey) return fail('Stability AI is not configured. Add STABILITY_API_KEY to Vercel Environment Variables.', 503, 'not_configured')

  let form: FormData
  try { form = await request.formData() } catch {
    return fail('Could not read the object crop. Please try again.', 400, 'invalid_upload')
  }
  const image = form.get('image')
  const width = Number(form.get('imageWidth'))
  const height = Number(form.get('imageHeight'))
  if (!(image instanceof File) || !['image/jpeg', 'image/png', 'image/webp'].includes(image.type)) {
    return fail('Attach a supported JPEG, PNG or WebP crop for this object.', 400, 'missing_object_crop')
  }
  if (image.size < 26 || image.size > MAX_CROP_BYTES) {
    return fail('This object crop is too large to refine. Try a smaller source photo.', 413, 'object_crop_too_large')
  }
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < 64 || height < 64 || width * height > 4_194_304
    || width / height > 2.5 || height / width > 2.5) {
    return fail("The object crop dimensions are outside Stability AI's four-megapixel limits.", 400, 'invalid_crop_dimensions')
  }

  const inputBytes = new Uint8Array(await image.arrayBuffer())
  const detectedMimeType = detectObjectEraserImageType(inputBytes)
  if (!detectedMimeType || detectedMimeType !== image.type) {
    return fail('The object crop image data is invalid or its file type does not match.', 400, 'invalid_object_crop')
  }
  if (detectedMimeType === 'image/png') {
    const inputDimensions = readSmartCutoutPngDimensions(inputBytes)
    if (!inputDimensions || inputDimensions.width !== width || inputDimensions.height !== height) {
      return fail('The object crop PNG dimensions do not match its metadata.', 400, 'invalid_object_crop')
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 52_000)
  try {
    const upstreamForm = new FormData()
    upstreamForm.set('image', new Blob([inputBytes], { type: detectedMimeType }), 'smart-cutout-object')
    upstreamForm.set('output_format', 'png')
    const upstream = await fetch(getStabilityImageApiBaseUrl() + STABILITY_REMOVE_BACKGROUND_PATH, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + stabilityKey, Accept: 'image/*' },
      body: upstreamForm,
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!upstream.ok) {
      let payload: unknown = null
      try { payload = await upstream.json() } catch { /* provider returned a non-JSON error */ }
      const mapped = mapStabilityBackgroundError(upstream.status)
      const detail = safeProviderMessage(payload, mapped.message)
      return fail('Stability AI object refinement failed: ' + detail, mapped.httpStatus, mapped.code, mapped.retryable)
    }

    const outputBytes = new Uint8Array(await upstream.arrayBuffer())
    const outputDimensions = readSmartCutoutPngDimensions(outputBytes)
    if (!outputBytes.length || outputBytes.length > SMART_CUTOUT_MAX_OUTPUT_BYTES
      || !outputDimensions || outputDimensions.width !== width || outputDimensions.height !== height
      || !hasSmartCutoutPngAlpha(outputBytes)) {
      return fail('Stability AI returned an invalid object PNG or changed its dimensions/transparency. The original photo was not changed.', 502, 'invalid_refined_object')
    }
    const outputBuffer = outputBytes.buffer.slice(
      outputBytes.byteOffset,
      outputBytes.byteOffset + outputBytes.byteLength,
    ) as ArrayBuffer
    return new NextResponse(outputBuffer, {
      status: 200,
      headers: {
        ...NO_STORE,
        'Content-Type': 'image/png',
        'Content-Length': String(outputBytes.length),
        'X-Smart-Cutout-Provider': 'stability-ai-remove-background',
        'X-Smart-Cutout-Stage': 'object-edge-refinement',
        'X-Smart-Cutout-Width': String(width),
        'X-Smart-Cutout-Height': String(height),
      },
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return fail('Stability AI object refinement timed out. Your original photo is unchanged; please retry.', 504, 'refinement_timeout', true)
    }
    if (error instanceof Error && error.message.includes('STABILITY_API_BASE_URL')) {
      return fail(error.message, 500, 'invalid_provider_configuration')
    }
    return fail('Could not connect to Stability AI for object refinement. Please try again later.', 503, 'provider_unavailable', true)
  } finally {
    clearTimeout(timeout)
  }
}
