import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { OBJECT_ERASER_MAX_IMAGE_BYTES, prepareObjectEraserImage } from '@/lib/studio/object-eraser'
import { normalizeSmartCutoutObjects, normalizeSmartCutoutSegmentations, type SmartCutoutObject } from '@/lib/studio/smart-cutout'

export const runtime = 'nodejs'
export const maxDuration = 60

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' }
const fail = (message: string, status: number, code: string, retryable = false) =>
  NextResponse.json({ ok: false, error: message, code, retryable }, { status, headers: NO_STORE })

function safeProviderMessage(value: unknown, fallback: string) {
  if (!value || typeof value !== 'object') return fallback
  const record = value as Record<string, unknown>
  const detail = typeof record.message === 'string' ? record.message
    : typeof record.detail === 'string' ? record.detail : ''
  return (detail || fallback)
    .replace(/https?:\/\/[^\s]+/g, '[provider URL]')
    .replace(/(?:api[_-]?key|authorization)[=: ]+[^&\s,]+/gi, '[redacted]')
    .slice(0, 300)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return fail('Please sign in to segment Smart Cutout objects.', 401, 'unauthorized')

  const roboflowKey = process.env.ROBOFLOW_API_KEY?.trim()
  if (!roboflowKey) return fail('Roboflow SAM 3 segmentation is not configured. Add ROBOFLOW_API_KEY to Vercel Environment Variables.', 503, 'roboflow_not_configured')

  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > OBJECT_ERASER_MAX_IMAGE_BYTES + 768 * 1024) {
    return fail('The selected photo must be 4 MB or smaller for Smart Cutout.', 413, 'image_too_large')
  }

  let form: FormData
  try { form = await request.formData() } catch {
    return fail('Could not read the selected photo for segmentation. Please try again.', 400, 'invalid_upload')
  }
  const image = form.get('image')
  if (!(image instanceof File)) return fail('Please attach the original Element Photo.', 400, 'missing_image')
  if (image.size > OBJECT_ERASER_MAX_IMAGE_BYTES) return fail('The selected photo must be 4 MB or smaller for Smart Cutout.', 413, 'image_too_large')

  const imageWidth = Number(form.get('imageWidth'))
  const imageHeight = Number(form.get('imageHeight'))
  if (!Number.isInteger(imageWidth) || !Number.isInteger(imageHeight)
    || imageWidth < 64 || imageHeight < 64 || imageWidth * imageHeight > 9_437_184) {
    return fail('The original photo dimensions are invalid. Reopen Smart Cutout and try again.', 400, 'invalid_image_dimensions')
  }

  let objects: SmartCutoutObject[] = []
  try {
    const parsed = JSON.parse(String(form.get('objects') || ''))
    objects = normalizeSmartCutoutObjects({ objects: parsed })
  } catch {
    return fail('The detected object list is invalid. Run Smart Cutout again.', 400, 'invalid_objects')
  }
  if (!objects.length || objects.length > 8) return fail('No valid main objects were supplied for segmentation. Run Smart Cutout again.', 400, 'invalid_objects')

  let prepared
  try { prepared = await prepareObjectEraserImage(image) } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'The selected photo is invalid.'
    return fail(message, /too large/i.test(message) ? 413 : 415, 'invalid_image')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 52_000)
  try {
    const upstream = await fetch('https://serverless.roboflow.com/sam3/concept_segment?api_key=' + encodeURIComponent(roboflowKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        image: { type: 'base64', value: prepared.base64 },
        prompts: objects.map(object => ({ text: object.label })),
        format: 'polygon',
      }),
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!upstream.ok) {
      let payload: unknown = null
      try { payload = await upstream.json() } catch { /* provider returned no JSON */ }
      if (upstream.status === 401 || upstream.status === 403) return fail('Roboflow rejected the API key. Check the Vercel environment variable.', 502, 'roboflow_unauthorized')
      if (upstream.status === 402 || upstream.status === 429) return fail('Roboflow usage limit has been reached. Check the workspace usage before retrying.', 429, 'roboflow_quota_exceeded', true)
      if (upstream.status >= 500 || upstream.status === 408) return fail('Roboflow SAM 3 is temporarily unavailable. Please try again.', 503, 'roboflow_unavailable', true)
      return fail(safeProviderMessage(payload, 'Roboflow SAM 3 could not segment this photo.'), 502, 'segmentation_failed')
    }

    let payload: unknown
    try { payload = await upstream.json() } catch {
      return fail('Roboflow SAM 3 returned unreadable mask data. Please try again.', 502, 'invalid_provider_response', true)
    }
    const normalized = normalizeSmartCutoutSegmentations(payload, objects, imageWidth, imageHeight)
    if (!normalized.segmentations.length) {
      return fail('The main objects were identified, but SAM 3 could not produce usable object masks for this photo. Try another photo or retry.', 502, 'no_usable_masks', true)
    }
    return NextResponse.json({
      ok: true,
      provider: 'roboflow',
      model: 'Roboflow SAM 3',
      objects,
      segmentations: normalized.segmentations,
      missingLabels: normalized.missingLabels,
      warning: normalized.missingLabels.length
        ? 'Some identified objects did not receive a usable mask. The available object masks are still returned.'
        : undefined,
    }, { headers: NO_STORE })
  } catch (cause) {
    if (cause instanceof Error && cause.name === 'AbortError') {
      return fail('Roboflow SAM 3 took longer than 52 seconds. Your original image is unchanged; please retry.', 504, 'segmentation_timeout', true)
    }
    console.error('[Smart Cutout] Roboflow segmentation request failed', cause)
    return fail('Could not connect to Roboflow SAM 3. Please try again later.', 503, 'provider_unavailable', true)
  } finally {
    clearTimeout(timeout)
  }
}
