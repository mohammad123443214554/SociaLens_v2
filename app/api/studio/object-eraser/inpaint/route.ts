import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { detectObjectEraserImageType, OBJECT_ERASER_MAX_IMAGE_BYTES } from '@/lib/studio/object-eraser'
import { getStabilityImageApiBaseUrl, mapStabilityApiError, STABILITY_INPAINT_PATH } from '@/lib/studio/stability-inpaint'

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
  return (detail || fallback).replace(/https?:\/\/\S+/g, '[provider URL]').replace(/(?:api[_-]?key|authorization)[=: ]+[^&\s,]+/gi, '[redacted]').slice(0, 400)
}

export async function POST(request: NextRequest) {
  const user = await getUser()
  if (!user) return fail('Please sign in to use AI object removal.', 401, 'unauthorized')

  const apiKey = process.env.STABILITY_API_KEY?.trim()
  if (!apiKey) return fail('Stability AI is not configured. Add STABILITY_API_KEY to Vercel Environment Variables.', 503, 'not_configured')

  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > 3 * 1024 * 1024) return fail('The object mask is too large. Please run detection again.', 413, 'mask_too_large')

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return fail('Invalid AI removal request.', 400, 'invalid_request') }

  const storagePath = typeof body.storagePath === 'string' ? body.storagePath : ''
  const projectId = typeof body.projectId === 'string' ? body.projectId : ''
  const maskDataUrl = typeof body.maskDataUrl === 'string' ? body.maskDataUrl : ''

  if (!projectId || projectId.length > 100 || !storagePath.startsWith(user.id + '/' + projectId + '/')) {
    return fail('The selected Studio image does not belong to this project.', 403, 'invalid_asset')
  }
  if (!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(maskDataUrl) || maskDataUrl.length > 2_500_000) {
    return fail('The object mask is invalid or too large. Please detect the object again.', 400, 'invalid_mask')
  }

  const maskBytes = Buffer.from(maskDataUrl.slice('data:image/png;base64,'.length), 'base64')
  if (maskBytes.length < 8 || detectObjectEraserImageType(new Uint8Array(maskBytes)) !== 'image/png') {
    return fail('The object mask is not a valid PNG image. Please detect the object again.', 400, 'invalid_mask')
  }

  const supabase = await createClient()
  const { data: signed, error: signedError } = await supabase.storage.from('studio-projects').createSignedUrl(storagePath, 60 * 5)
  if (signedError || !signed?.signedUrl) return fail('Could not securely prepare the selected image for AI editing.', 400, 'asset_unavailable')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 52_000)
  try {
    const imageResponse = await fetch(signed.signedUrl, { cache: 'no-store', signal: controller.signal })
    if (!imageResponse.ok) return fail('Could not load the original Studio image for AI editing.', 400, 'asset_unavailable')
    const imageBytes = new Uint8Array(await imageResponse.arrayBuffer())
    if (imageBytes.length <= 0 || imageBytes.length > OBJECT_ERASER_MAX_IMAGE_BYTES) {
      return fail('The original image must be 4 MB or smaller for Object Eraser.', 413, 'image_too_large')
    }
    const mimeType = detectObjectEraserImageType(imageBytes)
    if (!mimeType) return fail('The original Studio asset is not a supported JPEG, PNG or WebP image.', 415, 'invalid_image')

    const form = new FormData()
    form.set('image', new Blob([imageBytes.buffer.slice(imageBytes.byteOffset, imageBytes.byteOffset + imageBytes.byteLength) as ArrayBuffer], { type: mimeType }), 'source-image')
    form.set('mask', new Blob([maskBytes.buffer.slice(maskBytes.byteOffset, maskBytes.byteOffset + maskBytes.byteLength) as ArrayBuffer], { type: 'image/png' }), 'object-mask.png')
    form.set('prompt', 'Photorealistic seamless continuation of the existing background. Reconstruct only the masked region by extending the immediately surrounding scene, textures, patterns, edges, lighting, shadows, perspective and depth. The masked region must contain background only; do not place or recreate any foreground object in it. Keep every unmasked pixel and all other objects unchanged.')
    form.set('negative_prompt', 'cup, mug, plate, bowl, tableware, foreground object, extra object, duplicate object, replacement object, new subject, text, watermark, logo, distorted texture, visible patch, hard edge, blur, artifacts')
    form.set('output_format', 'png')

    let upstream: Response
    try {
      const baseUrl = getStabilityImageApiBaseUrl()
      upstream = await fetch(baseUrl + STABILITY_INPAINT_PATH, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + apiKey, Accept: 'image/*' },
        body: form,
        cache: 'no-store',
        signal: controller.signal,
      })
    } catch (error) {
      if (error instanceof Error && error.message.includes('STABILITY_API_BASE_URL')) {
        return fail(error.message, 500, 'invalid_provider_configuration')
      }
      if (error instanceof Error && error.name === 'AbortError') {
        return fail('Stability AI took too long to finish. Your original image is unchanged; please try again.', 504, 'request_timeout', true)
      }
      return fail('Could not connect to Stability AI. Please try again later.', 503, 'provider_unavailable', true)
    }

    if (!upstream.ok) {
      let payload: unknown = null
      try { payload = await upstream.json() } catch { /* provider returned no JSON body */ }
      const mapped = mapStabilityApiError(upstream.status)
      return fail(safeProviderMessage(payload, mapped.message), mapped.httpStatus, mapped.code, mapped.retryable)
    }

    const outputBytes = new Uint8Array(await upstream.arrayBuffer())
    const outputMime = (upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (!outputBytes.length || outputBytes.length > 20 * 1024 * 1024 || !outputMime.startsWith('image/')) {
      return fail('Stability AI returned an invalid or oversized image result.', 502, 'invalid_provider_response')
    }
    const outputType = detectObjectEraserImageType(outputBytes)
    if (!outputType) return fail('Stability AI returned an unsupported image format.', 502, 'invalid_provider_response')

    const outputBuffer = outputBytes.buffer.slice(outputBytes.byteOffset, outputBytes.byteOffset + outputBytes.byteLength) as ArrayBuffer
    return new NextResponse(outputBuffer, {
      status: 200,
      headers: {
        ...NO_STORE,
        'Content-Type': outputType,
        'Content-Length': String(outputBytes.length),
        'X-Object-Eraser-Provider': 'stability-ai',
      },
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return fail('Loading the original image timed out. Your original image is unchanged; please try again.', 504, 'request_timeout', true)
    }
    return fail('Could not prepare the image for Stability AI. Your original image is unchanged.', 500, 'image_preparation_failed')
  } finally {
    clearTimeout(timeout)
  }
}
