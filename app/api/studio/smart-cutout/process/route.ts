import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { detectObjectEraserImageType, OBJECT_ERASER_MAX_IMAGE_BYTES, prepareObjectEraserImage } from '@/lib/studio/object-eraser'
import {
  isSmartCutoutMaskValid,
  readSmartCutoutPngDimensions,
  SMART_CUTOUT_BACKGROUND_GROW_MASK,
  SMART_CUTOUT_MAX_MASK_BYTES,
  SMART_CUTOUT_MAX_OUTPUT_BYTES,
} from '@/lib/studio/smart-cutout-processing'
import { getStabilityImageApiBaseUrl, mapStabilityApiError, STABILITY_ERASE_PATH } from '@/lib/studio/stability-inpaint'

export const runtime = 'nodejs'
export const maxDuration = 60

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' }
const fail = (message: string, status: number, code: string, retryable = false) =>
  NextResponse.json({ ok: false, error: message, code, retryable }, { status, headers: NO_STORE })

async function requireUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return error || !user ? null : user
}

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
  const deadline = Date.now() + 55_000
  const user = await requireUser()
  if (!user) return fail('Please sign in to use Smart Cutout.', 401, 'unauthorized')

  const stabilityKey = process.env.STABILITY_API_KEY?.trim()
  if (!stabilityKey) return fail('Stability AI is not configured. Add STABILITY_API_KEY to Vercel Environment Variables.', 503, 'not_configured')

  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > SMART_CUTOUT_MAX_MASK_BYTES + 256 * 1024) {
    return fail('The combined object mask is too large. Please run Smart Cutout again.', 413, 'mask_too_large')
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return fail('Could not read the Smart Cutout mask. Please try again.', 400, 'invalid_upload')
  }

  const mask = form.get('mask')
  const projectId = String(form.get('projectId') || '')
  const storagePath = String(form.get('storagePath') || '')
  if (!(mask instanceof File)) return fail('Attach the combined white-on-black object mask.', 400, 'missing_mask')
  if (mask.size <= 0 || mask.size > SMART_CUTOUT_MAX_MASK_BYTES) {
    return fail('The combined object mask is too large. Please reopen Smart Cutout and try again.', 413, 'mask_too_large')
  }

  const imageWidth = Number(form.get('imageWidth'))
  const imageHeight = Number(form.get('imageHeight'))
  if (!projectId || projectId.length > 100 || !storagePath.startsWith(user.id + '/' + projectId + '/')) {
    return fail('The selected Studio photo does not belong to this project.', 403, 'invalid_asset')
  }
  if (!Number.isSafeInteger(imageWidth) || !Number.isSafeInteger(imageHeight)
    || imageWidth < 64 || imageHeight < 64 || imageWidth * imageHeight > 9_437_184) {
    return fail('The original photo dimensions are invalid. Reopen Smart Cutout and try again.', 400, 'invalid_dimensions')
  }
  if (mask.type && mask.type !== 'image/png') {
    return fail('The combined object mask must be a PNG image.', 415, 'invalid_mask_type')
  }

  const maskBytes = new Uint8Array(await mask.arrayBuffer())
  if (!isSmartCutoutMaskValid(maskBytes, imageWidth, imageHeight)) {
    return fail('The object mask is invalid or its dimensions do not match the original photo. Reopen Smart Cutout and try again.', 400, 'invalid_mask')
  }

  const supabase = await createClient()
  const { data: signed, error: signedError } = await supabase.storage
    .from('studio-projects')
    .createSignedUrl(storagePath, 60 * 5)
  if (signedError || !signed?.signedUrl) {
    return fail('Could not securely prepare the selected Studio photo for background reconstruction.', 400, 'asset_unavailable')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(1_000, deadline - Date.now()))
  try {
    const imageResponse = await fetch(signed.signedUrl, { cache: 'no-store', signal: controller.signal })
    if (!imageResponse.ok) return fail('Could not load the original Studio photo for background reconstruction.', 400, 'asset_unavailable')
    const imageBytes = new Uint8Array(await imageResponse.arrayBuffer())
    if (!imageBytes.length || imageBytes.length > OBJECT_ERASER_MAX_IMAGE_BYTES) {
      return fail('The original photo must be 4 MB or smaller for Smart Cutout.', 413, 'image_too_large')
    }

    const mimeType = detectObjectEraserImageType(imageBytes)
    if (!mimeType) return fail('The original Studio asset is not a supported JPEG, PNG or WebP image.', 415, 'invalid_image')
    const sourceBuffer = imageBytes.buffer.slice(
      imageBytes.byteOffset,
      imageBytes.byteOffset + imageBytes.byteLength,
    ) as ArrayBuffer
    const sourceFile = new File([sourceBuffer], 'smart-cutout-source', { type: mimeType })
    const prepared = await prepareObjectEraserImage(sourceFile)

    const upstreamForm = new FormData()
    const maskBuffer = maskBytes.buffer.slice(maskBytes.byteOffset, maskBytes.byteOffset + maskBytes.byteLength) as ArrayBuffer
    upstreamForm.set('image', new Blob([sourceBuffer], { type: prepared.mimeType }), 'source-image')
    upstreamForm.set('mask', new Blob([maskBuffer], { type: 'image/png' }), 'smart-cutout-mask.png')
    // The client mask is a full-resolution union of all selected object masks.
    // A small provider growth closes antialiased edge gaps before background fill.
    upstreamForm.set('grow_mask', String(SMART_CUTOUT_BACKGROUND_GROW_MASK))
    upstreamForm.set('output_format', 'png')

    let upstream: Response
    try {
      upstream = await fetch(getStabilityImageApiBaseUrl() + STABILITY_ERASE_PATH, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + stabilityKey, Accept: 'image/*' },
        body: upstreamForm,
        cache: 'no-store',
        signal: controller.signal,
      })
    } catch (error) {
      if (error instanceof Error && error.message.includes('STABILITY_API_BASE_URL')) {
        return fail(error.message, 500, 'invalid_provider_configuration')
      }
      if (error instanceof Error && error.name === 'AbortError') {
        return fail('Stability AI took too long to rebuild the background. Your original photo is unchanged; please try again.', 504, 'request_timeout', true)
      }
      return fail('Could not connect to Stability AI. Please try again later.', 503, 'provider_unavailable', true)
    }

    if (!upstream.ok) {
      let payload: unknown = null
      try { payload = await upstream.json() } catch { /* provider returned no JSON body */ }
      const mapped = mapStabilityApiError(upstream.status)
      const detail = safeProviderMessage(payload, mapped.message)
      return fail('Smart Cutout background reconstruction failed: ' + detail, mapped.httpStatus, mapped.code, mapped.retryable)
    }

    const outputBytes = new Uint8Array(await upstream.arrayBuffer())
    const outputType = detectObjectEraserImageType(outputBytes)
    const outputDimensions = readSmartCutoutPngDimensions(outputBytes)
    if (!outputBytes.length || outputBytes.length > SMART_CUTOUT_MAX_OUTPUT_BYTES
      || outputType !== 'image/png' || !outputDimensions) {
      return fail('Stability AI returned an invalid or oversized background image.', 502, 'invalid_provider_response')
    }
    if (outputDimensions.width !== imageWidth || outputDimensions.height !== imageHeight) {
      return fail('Stability AI changed the background image dimensions. The result was not applied so all cutouts can stay perfectly aligned.', 502, 'dimension_mismatch')
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
        'X-Smart-Cutout-Provider': 'stability-ai-erase',
        'X-Smart-Cutout-Stage': 'clean-background-plate',
        'X-Smart-Cutout-Width': String(imageWidth),
        'X-Smart-Cutout-Height': String(imageHeight),
      },
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return fail('Loading the original photo timed out. Your original photo is unchanged; please try again.', 504, 'request_timeout', true)
    }
    return fail('Could not prepare the clean background plate. Your original photo is unchanged.', 500, 'processing_failed')
  } finally {
    clearTimeout(timeout)
  }
}
