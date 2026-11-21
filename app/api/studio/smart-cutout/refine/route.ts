import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasSmartCutoutPngAlpha, readSmartCutoutPngDimensions, SMART_CUTOUT_MAX_MASK_BYTES, SMART_CUTOUT_MAX_OUTPUT_BYTES } from '@/lib/studio/smart-cutout-processing'
import { detectObjectEraserImageType } from '@/lib/studio/object-eraser'
import { getStabilityImageApiBaseUrl, mapStabilityBackgroundError, STABILITY_INPAINT_PATH, STABILITY_REMOVE_BACKGROUND_PATH } from '@/lib/studio/stability-inpaint'

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

async function readProviderError(response: Response, fallback: string) {
  let payload: unknown = null
  try { payload = await response.json() } catch { /* provider returned a non-JSON error */ }
  const mapped = mapStabilityBackgroundError(response.status)
  return {
    message: safeProviderMessage(payload, mapped.message || fallback),
    status: mapped.httpStatus,
    code: mapped.code,
    retryable: mapped.retryable,
  }
}

export async function POST(request: NextRequest) {
  const userClient = await createClient()
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return fail('Please sign in to refine Smart Cutout objects.', 401, 'unauthorized')

  // Dedicated key keeps Smart Cutout prompt-guided edits isolated from other
  // Stability features and lets the project use a separately managed key.
  const stabilityKey = process.env.STABILITY_SMART_CUTOUT_API_KEY?.trim()
  if (!stabilityKey) return fail('Smart Cutout prompt editing is not configured. Add STABILITY_SMART_CUTOUT_API_KEY to Vercel Environment Variables.', 503, 'smart_cutout_key_not_configured')

  let form: FormData
  try { form = await request.formData() } catch {
    return fail('Could not read the object crop. Please try again.', 400, 'invalid_upload')
  }
  const image = form.get('image')
  const mask = form.get('mask')
  const label = String(form.get('label') || 'foreground object').replace(/[\r\n]/g, ' ').trim().slice(0, 80)
  const width = Number(form.get('imageWidth'))
  const height = Number(form.get('imageHeight'))
  if (!(image instanceof File) || !['image/jpeg', 'image/png', 'image/webp'].includes(image.type)) {
    return fail('Attach a supported JPEG, PNG or WebP crop for this object.', 400, 'missing_object_crop')
  }
  if (!(mask instanceof File) || mask.type !== 'image/png' || mask.size < 26 || mask.size > SMART_CUTOUT_MAX_MASK_BYTES) {
    return fail('Attach the object-preservation PNG mask for Stability AI.', 400, 'missing_object_mask')
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
  const maskBytes = new Uint8Array(await mask.arrayBuffer())
  const detectedMimeType = detectObjectEraserImageType(inputBytes)
  const maskDimensions = readSmartCutoutPngDimensions(maskBytes)
  if (!detectedMimeType || detectedMimeType !== image.type) {
    return fail('The object crop image data is invalid or its file type does not match.', 400, 'invalid_object_crop')
  }
  if (!maskDimensions || maskDimensions.width !== width || maskDimensions.height !== height) {
    return fail('The object-preservation mask dimensions do not match the crop.', 400, 'invalid_object_mask')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 54_000)
  try {
    const apiBase = getStabilityImageApiBaseUrl()
    const sourceBlob = new Blob([inputBytes], { type: detectedMimeType })
    const maskBlob = new Blob([maskBytes], { type: 'image/png' })

    // First ask Stability's prompt-guided Inpaint model to replace only the
    // crop background with a uniform chroma field while preserving the object.
    const isolateForm = new FormData()
    isolateForm.set('image', sourceBlob, 'smart-cutout-source.jpg')
    isolateForm.set('mask', maskBlob, 'smart-cutout-preserve-object.png')
    isolateForm.set('prompt', 'Replace the masked background area only with a perfectly uniform, flat, pure chroma green background (#00FF00). Preserve the ' + label + ' completely unchanged: same exact shape, silhouette, proportions, position, orientation, material, colour, texture, fine details, highlights, reflections and natural lighting. Do not redraw, regenerate, beautify, simplify, crop, move, resize or alter any part of the object. The object must remain untouched.')
    isolateForm.set('output_format', 'png')
    const isolateResponse = await fetch(apiBase + STABILITY_INPAINT_PATH, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + stabilityKey, Accept: 'image/*' },
      body: isolateForm,
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!isolateResponse.ok) {
      const error = await readProviderError(isolateResponse, 'Stability AI could not prepare the object for isolation.')
      return fail('Stability AI prompt-guided object isolation failed: ' + error.message, error.status, error.code, error.retryable)
    }
    const isolatedBytes = new Uint8Array(await isolateResponse.arrayBuffer())
    const isolatedDimensions = readSmartCutoutPngDimensions(isolatedBytes)
    if (!isolatedDimensions || isolatedDimensions.width !== width || isolatedDimensions.height !== height
      || isolatedBytes.length > SMART_CUTOUT_MAX_OUTPUT_BYTES) {
      return fail('Stability AI returned an invalid isolated object image or changed its dimensions.', 502, 'invalid_isolation_response')
    }

    // Then use Stability Remove Background to produce a real transparent PNG.
    const removeForm = new FormData()
    removeForm.set('image', new Blob([isolatedBytes], { type: 'image/png' }), 'smart-cutout-isolated.png')
    removeForm.set('output_format', 'png')
    const removeResponse = await fetch(apiBase + STABILITY_REMOVE_BACKGROUND_PATH, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + stabilityKey, Accept: 'image/*' },
      body: removeForm,
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!removeResponse.ok) {
      const error = await readProviderError(removeResponse, 'Stability AI could not create the transparent object PNG.')
      return fail('Stability AI transparent extraction failed: ' + error.message, error.status, error.code, error.retryable)
    }

    const outputBytes = new Uint8Array(await removeResponse.arrayBuffer())
    const outputDimensions = readSmartCutoutPngDimensions(outputBytes)
    if (!outputBytes.length || outputBytes.length > SMART_CUTOUT_MAX_OUTPUT_BYTES
      || !outputDimensions || outputDimensions.width !== width || outputDimensions.height !== height
      || !hasSmartCutoutPngAlpha(outputBytes)) {
      return fail('Stability AI returned an invalid transparent PNG or changed its dimensions. The original photo was not changed.', 502, 'invalid_refined_object')
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
        'X-Smart-Cutout-Provider': 'stability-ai-inpaint-remove-background',
        'X-Smart-Cutout-Stage': 'prompt-guided-transparent-object',
        'X-Smart-Cutout-Width': String(width),
        'X-Smart-Cutout-Height': String(height),
      },
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return fail('Stability AI prompt-guided object extraction timed out. Your original photo is unchanged; please retry.', 504, 'refinement_timeout', true)
    }
    if (error instanceof Error && error.message.includes('STABILITY_API_BASE_URL')) {
      return fail(error.message, 500, 'invalid_provider_configuration')
    }
    return fail('Could not connect to Stability AI for prompt-guided object extraction. Please try again later.', 503, 'provider_unavailable', true)
  } finally {
    clearTimeout(timeout)
  }
}
