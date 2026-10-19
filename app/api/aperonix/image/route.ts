import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

const MAX_PROMPT_LENGTH = 2000
const MODELS = [
  '@cf/black-forest-labs/flux-2-klein-9b',
  '@cf/black-forest-labs/flux-2-klein-4b',
] as const

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const token = process.env.CLOUDFLARE_AI_API_TOKEN
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
    if (!token || !accountId) {
      return NextResponse.json({
        error: 'Image generation is not configured yet. Add CLOUDFLARE_AI_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in Vercel Environment Variables, then redeploy.',
      }, { status: 503 })
    }

    const body = await request.json() as { prompt?: unknown; referenceImages?: unknown }
    let prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    const referenceImages = Array.isArray(body.referenceImages)
      ? body.referenceImages.filter((image): image is string => typeof image === 'string').slice(0, 4)
      : []
    if (referenceImages.some(image => image.length > 2_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image))) {
      return NextResponse.json({ error: 'The reference image could not be prepared. Please try a smaller image.' }, { status: 413 })
    }
    if (!prompt) return NextResponse.json({ error: 'Describe the image you want Aperonix to create.' }, { status: 400 })

    // Give the image model the same brand context as Aperonix's conversation model.
    if (/socialens/i.test(prompt) && /logo|brand|branding|our identity/i.test(prompt)) {
      prompt += '\nBrand context: SociaLens is the social media platform brand. If a supplied reference image is the official SociaLens logo, preserve its exact recognizable mark, proportions, and colors; do not invent a different logo. If the logo reference is alongside a product/photo, apply that exact logo naturally to the requested target.'
    }
    if (prompt.length > MAX_PROMPT_LENGTH) prompt = prompt.slice(0, MAX_PROMPT_LENGTH)

    const makeForm = () => {
      const form = new FormData()
      form.set('prompt', prompt)
      form.set('width', '1024')
      form.set('height', '1024')
      referenceImages.forEach((image, index) => {
        const bytes = Buffer.from(image, 'base64')
        if (!bytes.length || bytes.length > 750_000) throw new Error('Reference image is too large.')
        form.set(`input_image_${index}`, new Blob([bytes], { type: 'image/jpeg' }), `reference-${index}.jpg`)
      })
      return form
    }

    let response: Response | null = null
    let lastDetails = ''
    let dailyQuotaExceeded = false

    // Keep the higher-quality 9B model first. Retry it once only when Cloudflare
    // reports temporary capacity pressure, then fall back to 4B if needed.
    for (const [modelIndex, model] of MODELS.entries()) {
      const attempts = modelIndex === 0 ? 2 : 1
      for (let attempt = 0; attempt < attempts; attempt++) {
        response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: makeForm(),
            signal: AbortSignal.timeout(55000),
            cache: 'no-store',
          },
        )
        if (response.ok) break

        lastDetails = await response.text().catch(() => '')
        let errorCode = ''
        let errorMessage = ''
        try {
          const errorBody = JSON.parse(lastDetails) as {
            errors?: { code?: string | number; message?: string }[]
            messages?: { code?: string | number; message?: string }[]
          }
          const firstError = errorBody.errors?.[0] ?? errorBody.messages?.[0]
          errorCode = String(firstError?.code ?? '')
          errorMessage = firstError?.message ?? ''
        } catch {
          errorMessage = lastDetails
        }
        console.error('Cloudflare image model failed:', model, response.status, errorCode, lastDetails.slice(0, 300))

        if (response.status === 401 || response.status === 403) {
          return NextResponse.json({ error: 'Cloudflare rejected the API token or model access. Check CLOUDFLARE_AI_API_TOKEN permissions and Workers AI access in Cloudflare.' }, { status: 502 })
        }

        // Cloudflare code 3036 means the daily free Neurons allocation is exhausted.
        // Trying another model cannot fix an account-wide quota limit.
        if (response.status === 429 && errorCode === '3036') {
          dailyQuotaExceeded = true
          break
        }

        if (response.status === 429 && errorCode === '3040' && attempt === 0 && modelIndex === 0) {
          await new Promise(resolve => setTimeout(resolve, 1200))
          continue
        }

        // Capacity/rate limits and transient provider failures can be model-specific.
        if (response.status === 429 || response.status >= 500) break

        return NextResponse.json({ error: 'The image request could not be processed. Please try changing the prompt or image.' }, { status: 502 })
      }
      if (response?.ok || dailyQuotaExceeded) break
    }

    if (dailyQuotaExceeded) {
      return NextResponse.json({
        error: 'Cloudflare has used up this account’s daily free AI allocation, so image generation is paused for now. It resets at 00:00 UTC; to keep generating today, enable Workers Paid billing in Cloudflare. Your prompt has not been lost.',
        code: 'DAILY_AI_QUOTA_EXCEEDED',
      }, { status: 429 })
    }

    if (!response?.ok) {
      const providerSaysBusy = /capacity temporarily exceeded|temporarily busy|overloaded/i.test(lastDetails)
      return NextResponse.json({
        error: providerSaysBusy
          ? 'Cloudflare image servers are temporarily at capacity. Aperonix tried the high-quality model and its fallback; please retry in a minute. Your prompt has not been lost.'
          : 'Cloudflare temporarily rate-limited image generation. If this keeps happening, check Workers AI usage and billing in your Cloudflare dashboard. Your prompt has not been lost.',
      }, { status: 429 })
    }

    const result = await response.json() as { result?: { image?: string }; success?: boolean; errors?: { message?: string }[] }
    const image = result.result?.image
    if (!image || typeof image !== 'string') {
      console.error('Cloudflare image response did not contain an image.')
      return NextResponse.json({ error: 'The image service returned no image. Please try again.' }, { status: 502 })
    }

    const imageBytes = Buffer.from(image, 'base64')
    if (imageBytes.length < 1000) {
      return NextResponse.json({ error: 'The image service returned an incomplete image. Please try again.' }, { status: 502 })
    }
    return new NextResponse(imageBytes, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(imageBytes.length),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('Aperonix image generation error:', error)
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    return NextResponse.json({
      error: timedOut ? 'Image generation took too long. Please try again.' : 'Aperonix could not generate this image. Please try again.',
    }, { status: timedOut ? 504 : 500 })
  }
}
