import { GoogleGenAI } from '@google/genai'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { OBJECT_ERASER_MAX_IMAGE_BYTES, prepareObjectEraserImage } from '@/lib/studio/object-eraser'
import {
  normalizeSmartCutoutSegmentations,
  parseSmartCutoutObjectResponse,
  type SmartCutoutObject,
} from '@/lib/studio/smart-cutout'

export const runtime = 'nodejs'
export const maxDuration = 60

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' }
const fail = (message: string, status: number, code: string, retryable = false) =>
  NextResponse.json({ ok: false, error: message, code, retryable }, { status, headers: NO_STORE })

const OBJECT_INVENTORY_PROMPT = `
You are identifying the main independently movable foreground objects in a photo for a professional photo editor.

Return ONLY valid JSON in this exact shape:
{"objects":[{"label":"short object name","importance":"high","reason":"brief visual reason"}]}

Rules:
- List only distinct, real, physical foreground objects that a user would reasonably want to separate and move independently.
- Prioritize the obvious main subjects, not every visible thing.
- Return at most 8 objects, ordered from most visually prominent to least prominent.
- Use concise English noun phrases suitable for a visual segmentation model, such as "red apple", "ceramic coffee mug", "person", "golden retriever".
- If several separate objects belong to the same category, include that category once; the segmentation model will find its separate instances.
- Treat a whole person as one object. Do not split body parts, clothing, accessories attached to a person, or parts of one assembled object.
- Exclude background scenery, floors, walls, sky, tables used only as a surface, shadows, reflections, textures, lighting, patterns, text, watermarks, logos, and tiny incidental details.
- Do not invent hidden objects or infer objects outside the visible image.
- Do not list an object merely because it is detectable; it must be a meaningful main subject.
- Mark the most prominent subjects as "high" and any other clearly meaningful foreground object as "medium".
- If there are no clear independently movable foreground objects, return {"objects":[]}.
`.trim()

async function getUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return error || !user ? null : user
}

function safeProviderMessage(value: unknown, fallback: string) {
  if (!value || typeof value !== 'object') return fallback
  const record = value as Record<string, unknown>
  const detail = typeof record.message === 'string'
    ? record.message
    : typeof record.detail === 'string'
      ? record.detail
      : ''
  return (detail || fallback)
    .replace(/https?:\/\/[^\s]+/g, '[provider URL]')
    .replace(/(?:api[_-]?key|authorization)[=: ]+[^&\s,]+/gi, '[redacted]')
    .slice(0, 300)
}

export async function POST(request: NextRequest) {
  const user = await getUser()
  if (!user) return fail('Please sign in to use Smart Cutout.', 401, 'unauthorized')

  const geminiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GEMINI_API_KEY_GENERATE?.trim()
  const roboflowKey = process.env.ROBOFLOW_API_KEY?.trim()
  if (!geminiKey) return fail('Gemini image analysis is not configured. Add GEMINI_API_KEY to Vercel Environment Variables.', 503, 'gemini_not_configured')
  if (!roboflowKey) return fail('Roboflow SAM 3 segmentation is not configured. Add ROBOFLOW_API_KEY to Vercel Environment Variables.', 503, 'roboflow_not_configured')

  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > OBJECT_ERASER_MAX_IMAGE_BYTES + 512 * 1024) {
    return fail('The selected photo must be 4 MB or smaller for Smart Cutout.', 413, 'image_too_large')
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return fail('Could not read the selected photo. Please try again.', 400, 'invalid_upload')
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

  let prepared
  try {
    prepared = await prepareObjectEraserImage(image)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The selected photo is invalid.'
    return fail(message, /too large/i.test(message) ? 413 : 415, 'invalid_image')
  }


  let objects: SmartCutoutObject[] = []
  let inventoryError: unknown = null
  const gemini = new GoogleGenAI({ apiKey: geminiKey })
  // Try the current Flash model first, then the supported Flash-Lite model
  // if the first model is unavailable to this API project.
  for (const model of ['gemini-3.8-flash', 'gemini-3.5-flash-lite']) {
    try {
      const inventory = await gemini.models.generateContent({
        model,
        contents: [{
          role: 'user',
          parts: [
            { text: OBJECT_INVENTORY_PROMPT },
            { inlineData: { mimeType: prepared.mimeType, data: prepared.base64 } },
          ],
        }],
        config: { responseMimeType: 'application/json', maxOutputTokens: 1200 },
      })
      const responseText = inventory.text || ''
      if (!responseText.trim()) throw new Error('Gemini returned an empty object inventory.')
      objects = parseSmartCutoutObjectResponse(responseText)
      if (!objects.length) {
        return fail('Gemini analysed the photo but did not return any clear main foreground objects. Try a photo with a more distinct subject.', 422, 'no_main_objects')
      }
      inventoryError = null
      break
    } catch (error) {
      inventoryError = error
      const providerStatus = Number((error as { status?: number; code?: number })?.status ?? (error as { code?: number })?.code)
      if (providerStatus === 401 || providerStatus === 403 || providerStatus === 429) break
    }
  }
  if (inventoryError) {
    const providerStatus = Number((inventoryError as { status?: number; code?: number })?.status ?? (inventoryError as { code?: number })?.code)
    const status = providerStatus === 429 ? 429 : providerStatus === 401 || providerStatus === 403 ? 503 : 502
    const detail = safeProviderMessage(inventoryError, 'Gemini image analysis could not complete the request.')
    console.error('[Smart Cutout] Gemini inventory request failed', { status: providerStatus || 'unknown', detail })
    return fail('Gemini image analysis failed: ' + detail, status, 'gemini_request_failed', status === 429 || status >= 500)
  }

  return NextResponse.json({
    ok: true,
    provider: 'gemini',
    model: 'Gemini 3.8 Flash',
    image: { mimeType: prepared.mimeType, size: prepared.size, sha256: prepared.sha256, width: imageWidth, height: imageHeight },
    objects,
    message: objects.length ? undefined : 'No clear independently movable main objects were found in this photo.',
  }, { headers: NO_STORE })
}
