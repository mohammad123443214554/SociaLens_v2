export const DEFAULT_GROQ_OBJECT_ERASER_MODEL = 'qwen/qwen3.8-27b'

export type GroqObjectRemovalPrompt = {
  objectDescription: string
  sceneDescription: string
  prompt: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function extractGroqText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === 'string') return payload.output_text
  if (Array.isArray(payload.choices)) {
    const choice = payload.choices.find(isRecord)
    const message = choice && isRecord(choice.message) ? choice.message : null
    const content = message?.content
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return content
        .filter(isRecord)
        .map(part => typeof part.text === 'string' ? part.text : '')
        .filter(Boolean)
        .join('\n')
    }
  }
  return ''
}

/** Parses the strict JSON response returned by Groq vision. */
export function parseGroqObjectRemovalPrompt(payload: unknown): GroqObjectRemovalPrompt {
  if (!isRecord(payload)) throw new Error('Aperonix AI returned an invalid response.')
  const outputText = extractGroqText(payload)
  if (!outputText.trim()) throw new Error('Aperonix AI did not return an object-removal prompt.')
  let parsed: unknown
  try { parsed = JSON.parse(outputText) } catch { throw new Error('Aperonix AI returned an unreadable object-removal prompt.') }
  if (!isRecord(parsed)) throw new Error('Aperonix AI returned an invalid object-removal prompt.')
  const objectDescription = typeof parsed.object_description === 'string' ? parsed.object_description.trim() : ''
  const sceneDescription = typeof parsed.scene_description === 'string' ? parsed.scene_description.trim() : ''
  const prompt = typeof parsed.prompt === 'string' ? parsed.prompt.trim() : ''
  if (!objectDescription || objectDescription.length > 240 || !sceneDescription || sceneDescription.length > 500 || prompt.length < 30 || prompt.length > 1200) {
    throw new Error('Aperonix AI could not create a sufficiently detailed removal prompt. Please highlight the object again.')
  }
  return { objectDescription, sceneDescription, prompt }
}

export async function generateGroqObjectRemovalPrompt(args: {
  apiKey: string
  model?: string
  imageBytes: Uint8Array
  imageMimeType: string
  maskBytes: Uint8Array
  objectLabel: string
  imageWidth: number
  imageHeight: number
  signal?: AbortSignal
}): Promise<GroqObjectRemovalPrompt> {
  const model = args.model?.trim() || DEFAULT_GROQ_OBJECT_ERASER_MODEL
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

  const timeoutSignal = AbortSignal.timeout(22_000)
  const signal = args.signal ? AbortSignal.any([args.signal, timeoutSignal]) : timeoutSignal
  let response: Response
  try {
    response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + args.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: instruction },
            { type: 'image_url', image_url: { url: 'data:' + args.imageMimeType + ';base64,' + Buffer.from(args.imageBytes).toString('base64') } },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,' + Buffer.from(args.maskBytes).toString('base64') } },
          ],
        }],
        temperature: 0.1,
        max_completion_tokens: 512,
        reasoning_effort: 'none',
        response_format: { type: 'json_object' },
        stream: false,
      }),
      cache: 'no-store',
      signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error('Aperonix AI analysis timed out. Your original photo is unchanged; please try again.')
    }
    throw error
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('Aperonix AI authentication failed. Please check SOCIALENS_OBJECT_ERASER_GROQ_API_KEY in Vercel.')
    if (response.status === 429) throw new Error('Aperonix AI is receiving too many requests. Please wait a moment and try again.')
    if (response.status >= 500) throw new Error('Aperonix AI is temporarily unavailable. Your original photo has not been changed.')
    throw new Error('Aperonix AI could not analyze the selected object. Please try highlighting it again.')
  }

  let payload: unknown
  try { payload = await response.json() } catch { throw new Error('Aperonix AI returned an unreadable analysis response.') }
  return parseGroqObjectRemovalPrompt(payload)
}
