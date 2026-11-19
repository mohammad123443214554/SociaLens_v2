export const DEFAULT_GEMINI_OBJECT_ERASER_MODEL = 'gemini-3.8-flash'

export type GeminiObjectRemovalPrompt = {
  objectDescription: string
  sceneDescription: string
  prompt: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Extracts only the final text output from the Gemini Interactions response. */
export function parseGeminiObjectRemovalPrompt(payload: unknown): GeminiObjectRemovalPrompt {
  if (!isRecord(payload)) throw new Error('Gemini returned an invalid response.')
  let outputText = typeof payload.output_text === 'string' ? payload.output_text : ''
  if (!outputText && Array.isArray(payload.steps)) {
    for (const step of payload.steps) {
      if (!isRecord(step) || step.type !== 'model_output' || !Array.isArray(step.content)) continue
      const textPart = step.content.find(part => isRecord(part) && part.type === 'text' && typeof part.text === 'string')
      if (isRecord(textPart) && typeof textPart.text === 'string') outputText = textPart.text
    }
  }
  if (!outputText.trim()) throw new Error('Gemini did not return an object-removal prompt.')
  let parsed: unknown
  try { parsed = JSON.parse(outputText) } catch { throw new Error('Gemini returned an unreadable object-removal prompt.') }
  if (!isRecord(parsed)) throw new Error('Gemini returned an invalid object-removal prompt.')
  const objectDescription = typeof parsed.object_description === 'string' ? parsed.object_description.trim() : ''
  const sceneDescription = typeof parsed.scene_description === 'string' ? parsed.scene_description.trim() : ''
  const prompt = typeof parsed.prompt === 'string' ? parsed.prompt.trim() : ''
  if (!objectDescription || objectDescription.length > 240 || !sceneDescription || sceneDescription.length > 500 || prompt.length < 30 || prompt.length > 1200) {
    throw new Error('Gemini could not create a sufficiently detailed removal prompt. Please try highlighting the object again.')
  }
  return { objectDescription, sceneDescription, prompt }
}

export async function generateGeminiObjectRemovalPrompt(args: {
  apiKey: string
  model?: string
  imageBytes: Uint8Array
  imageMimeType: string
  maskBytes: Uint8Array
  objectLabel: string
  imageWidth: number
  imageHeight: number
  signal?: AbortSignal
}): Promise<GeminiObjectRemovalPrompt> {
  const model = args.model?.trim() || DEFAULT_GEMINI_OBJECT_ERASER_MODEL
  const label = args.objectLabel.replace(/[\r\n\t]/g, ' ').trim().slice(0, 100) || 'selected object'
  const instruction = [
    'You are a professional photo-retouching scene analyst. Your only task is to write an image-inpainting prompt for removing the object selected by the white region in the second image.',
    'IMAGE 1 is the untouched original photograph. IMAGE 2 is a binary selection mask aligned pixel-for-pixel with IMAGE 1: white pixels are the exact area to replace; black pixels must remain untouched.',
    'The selection hint from the object detector is: ' + label + '. Treat it only as a hint; use the photograph and white mask to identify the actual selected object(s).',
    'Image dimensions: ' + args.imageWidth + ' by ' + args.imageHeight + ' pixels.',
    'Inspect the object position, nearby surfaces, perspective, depth, texture, lighting direction, shadows, reflections, and background continuity.',
    'Return a concise, specific prompt describing ONLY the believable scene content that should fill the white masked area, continuing the surrounding photograph naturally. Explicitly preserve perspective, camera viewpoint, lighting, color, texture, depth of field, and fine details. The selected object must not be recreated. Do not invent unrelated objects or change any unmasked content.',
    'Do not edit or generate an image. Do not return analysis, markdown, alternatives, or extra keys. Return only JSON matching the schema.',
  ].join('\n')

  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': args.apiKey,
    },
    body: JSON.stringify({
      model,
      input: [
        { type: 'text', text: instruction },
        { type: 'image', data: Buffer.from(args.imageBytes).toString('base64'), mime_type: args.imageMimeType },
        { type: 'image', data: Buffer.from(args.maskBytes).toString('base64'), mime_type: 'image/png' },
      ],
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: {
          type: 'object',
          properties: {
            object_description: { type: 'string', description: 'Short identification of the selected object or selected objects.' },
            scene_description: { type: 'string', description: 'Short description of the visible surrounding scene that must continue naturally.' },
            prompt: { type: 'string', description: 'A detailed but concise photorealistic inpainting prompt for the masked region only.' },
          },
          required: ['object_description', 'scene_description', 'prompt'],
        },
      },
    }),
    cache: 'no-store',
    signal: args.signal,
  })

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('Gemini rejected the API key. Check GEMINI_API_KEY in Vercel Environment Variables.')
    if (response.status === 429) throw new Error('Gemini is rate limiting requests. Please wait a moment and try again.')
    if (response.status >= 500) throw new Error('Gemini is temporarily unavailable. Your original photo has not been changed.')
    throw new Error('Gemini could not analyze the selected object. Please try highlighting it again.')
  }

  let payload: unknown
  try { payload = await response.json() } catch { throw new Error('Gemini returned an unreadable analysis response.') }
  return parseGeminiObjectRemovalPrompt(payload)
}
