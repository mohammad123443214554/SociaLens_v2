import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 15

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Please sign in to use Aperonix Voice Agent.' }, { status: 401 })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({
        error: 'Voice Agent is not configured yet. Add GEMINI_API_KEY in Vercel → Project Settings → Environment Variables, then redeploy.',
        code: 'MISSING_GEMINI_API_KEY',
      }, { status: 503 })
    }

    const now = Date.now()
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        uses: 1,
        expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(now + 60 * 1000).toISOString(),
        liveConnectConstraints: {
          model: 'models/gemini-3.8-live',
          config: {
            responseModalities: ['AUDIO'],
            sessionResumption: {},
          },
        },
      }),
      cache: 'no-store',
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok || typeof data.name !== 'string') {
      console.error('Gemini Live token provisioning failed:', response.status, data?.error?.message || 'Unknown error')
      return NextResponse.json({
        error: data?.error?.message || 'Google could not start a Live voice session. Check your API key, model access, quota, and billing.',
        code: 'GEMINI_TOKEN_FAILED',
      }, { status: response.status === 429 ? 429 : 502 })
    }

    return NextResponse.json({ token: data.name, expiresAt: data.expireTime }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error) {
    console.error('Aperonix Voice Agent token error:', error)
    return NextResponse.json({ error: 'Could not prepare the voice session. Please try again.' }, { status: 500 })
  }
}
