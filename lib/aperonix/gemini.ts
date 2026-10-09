// Shared helper for calling the Gemini API. Used by both the Aperonix
// chatbot and the "Generate" buttons in Create Post.
//
// Uses separate API keys per feature so load is spread out and one feature
// running hot doesn't affect the others:
//   GEMINI_API_KEY_CHAT     - the Aperonix chatbot conversation
//   GEMINI_API_KEY_GENERATE - title/description/hashtag generation in Create Post
//   GEMINI_API_KEY_BACKUP   - automatically used if the primary key above fails
//   GEMINI_API_KEY_SEARCH   - no longer tied to a Feature (search was removed),
//                             but if it's set it's automatically used as an
//                             extra backup key too, so nothing goes to waste.
//
// Any failure that reaches the caller is a plain "Try again later." message -
// no internal details (status codes, which key, etc.) are ever exposed to the
// person using the app.
//
// IMPORTANT - model pinning: this used to point at 'gemini-flash-latest'.
// That's an alias Google's own docs describe as getting "hot-swapped" and
// sometimes routed to an experimental/unstable build behind the scenes -
// exactly why replies were unreliable ("Try again later" a lot, an
// occasional lucky success). Gemini's model lineup also gets deprecated
// on a matter of months (2.5 Flash itself is scheduled to shut down
// October 16, 2026), so instead of pinning to one name and having this
// break again down the line, every request tries a short list of current
// models in order and moves to the next one on any failure - the first
// one that actually answers wins. Update GEMINI_MODEL_CANDIDATES here if
// Google deprecates one of these down the road.
const GEMINI_MODEL_CANDIDATES = ['gemini-3.5-flash', 'gemini-2.5-flash']
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

export interface GeminiTextPart {
  text: string
}

export interface GeminiInlineDataPart {
  inlineData: {
    mimeType: string
    data: string // base64, no data: prefix
  }
}

export interface GeminiFunctionCallPart {
  functionCall: {
    name: string
    args: Record<string, any>
  }
}

export interface GeminiFunctionResponsePart {
  functionResponse: {
    name: string
    response: Record<string, any>
  }
}

export type GeminiPart = GeminiTextPart | GeminiInlineDataPart | GeminiFunctionCallPart | GeminiFunctionResponsePart

export interface GeminiMessage {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

export interface GeminiFunctionDeclaration {
  name: string
  description: string
  parameters: {
    type: 'OBJECT'
    properties: Record<string, { type: string; description?: string }>
    required?: string[]
  }
}

export interface GeminiTool {
  functionDeclarations: GeminiFunctionDeclaration[]
}

export type GeminiRole = 'chat' | 'generate'

export function getPrimaryKey(role: GeminiRole): string | undefined {
  if (role === 'chat') return process.env.GEMINI_API_KEY_CHAT
  return process.env.GEMINI_API_KEY_GENERATE
}

// The dedicated "search" key isn't tied to a live feature anymore, so it's
// folded into the backup pool instead of going unused - one extra safety net.
export function getBackupKeys(): string[] {
  return [process.env.GEMINI_API_KEY_BACKUP, process.env.GEMINI_API_KEY_SEARCH].filter(Boolean) as string[]
}

/** All keys to try, in order, for a given role - primary first, then backups. */
export function getKeysForRole(role: GeminiRole): string[] {
  return [getPrimaryKey(role), ...getBackupKeys()].filter(Boolean) as string[]
}

async function requestGemini(apiKey: string, model: string, systemPrompt: string, contents: GeminiMessage[], tools?: GeminiTool[]) {
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    ...(tools ? { tools } : {}),
    generationConfig: {
      // Gemini's own docs recommend leaving temperature/top_p/top_k at
      // their defaults on the current model generation - its reasoning
      // is tuned around those defaults, and overriding them tends to hurt
      // more than it helps. maxOutputTokens is just a length cap, safe to
      // keep custom.
      maxOutputTokens: 1024,
    },
  })

  // Retry the same key+model a couple of times for transient 503
  // (overloaded) / 429 (rate limited) errors before giving up and trying
  // the next one. A 404 (wrong/deprecated model name) is NOT retried here -
  // that's on the caller to try the next model candidate instead, since
  // retrying the identical request would just 404 again.
  const maxAttempts = 2
  let lastStatus = 0

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(`${GEMINI_BASE_URL}/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })

    if (response.ok) return response.json()

    lastStatus = response.status
    if (response.status === 404) break // wrong/deprecated model - no point retrying this same call
    const isRetryable = response.status === 503 || response.status === 429
    if (!isRetryable || attempt === maxAttempts) break
    await new Promise(resolve => setTimeout(resolve, attempt * 700))
  }

  const err: any = new Error(`Gemini request failed (status ${lastStatus})`)
  err.status = lastStatus
  throw err
}

/**
 * Calls Gemini using the key assigned to `role`, automatically falling back
 * through the backup keys (in order), and within each key through the
 * candidate model list, if a request fails. Returns the raw `content`
 * object of the first candidate. Throws a generic "Try again later." error on
 * total failure - never leaks internal details to the caller.
 */
export async function callGemini(
  role: GeminiRole,
  systemPrompt: string,
  contents: GeminiMessage[],
  tools?: GeminiTool[]
) {
  const keysToTry = getKeysForRole(role)

  if (keysToTry.length === 0) {
    console.error(`Aperonix: no Gemini API key configured for role "${role}" and no backup keys either.`)
    throw new Error('Try again later.')
  }

  let data: any = null

  outer:
  for (const key of keysToTry) {
    for (const model of GEMINI_MODEL_CANDIDATES) {
      try {
        data = await requestGemini(key, model, systemPrompt, contents, tools)
        break outer
      } catch (err) {
        console.error(`Aperonix: Gemini call failed on a "${role}"-role key with model "${model}", trying the next option if available.`, err)
      }
    }
  }

  if (!data) {
    throw new Error('Try again later.')
  }

  return data.candidates?.[0]?.content ?? null
}

export function extractText(content: any): string {
  if (!content?.parts) return ''
  return content.parts.map((p: any) => p.text || '').join('').trim()
}

export function extractFunctionCall(content: any): { name: string; args: Record<string, any> } | null {
  const part = content?.parts?.find((p: any) => p.functionCall)
  return part?.functionCall ?? null
}
