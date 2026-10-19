import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

const MAX_PROMPT_LENGTH = 2000
const MODEL = '@cf/black-forest-labs/flux-1-schnell'

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

    const body = await request.json() as { prompt?: unknown }
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    if (!prompt) return NextResponse.json({ error: 'Describe the image you want Aperonix to create.' }, { status: 400 })
    if (prompt.length > MAX_PROMPT_LENGTH) {
      return NextResponse.json({ error: 'Please keep the image prompt under 2,000 characters.' }, { status: 413 })
    }

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, num_steps: 4 }),
        signal: AbortSignal.timeout(55000),
        cache: 'no-store',
      },
    )

    if (!response.ok) {
      const details = await response.text().catch(() => '')
      console.error('Cloudflare image generation failed:', response.status, details.slice(0, 500))
      if (response.status === 401 || response.status === 403) {
        return NextResponse.json({ error: 'Cloudflare rejected the API token. Check the token permissions in Vercel Environment Variables.' }, { status: 502 })
      }
      if (response.status === 429) {
        return NextResponse.json({ error: 'Image generation is temporarily rate-limited. Please try again shortly.' }, { status: 429 })
      }
      return NextResponse.json({ error: 'Aperonix could not generate that image right now. Please try again.' }, { status: 502 })
    }

    const result = await response.json() as { result?: { image?: string }; success?: boolean; errors?: { message?: string }[] }
    const image = result.result?.image
    if (!image || typeof image !== 'string') {
      console.error('Cloudflare image response did not contain an image.')
      return NextResponse.json({ error: 'The image service returned no image. Please try again.' }, { status: 502 })
    }

    return NextResponse.json({ image, mimeType: 'image/jpeg' }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Aperonix image generation error:', error)
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    return NextResponse.json({
      error: timedOut ? 'Image generation took too long. Please try again.' : 'Aperonix could not generate this image. Please try again.',
    }, { status: timedOut ? 504 : 500 })
  }
}
