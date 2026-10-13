import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 15

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Please sign in to use Aperonix Voice Agent.' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    let contextSummary: string | null = null
    if (typeof body.conversationId === 'string' && body.conversationId) {
      const { data: conversation, error: contextError } = await supabase.from('aperonix_voice_conversations')
        .select('context_summary').eq('id', body.conversationId).eq('user_id', user.id).maybeSingle()
      if (contextError) return NextResponse.json({ error: 'Could not load the connected conversation context.' }, { status: 500 })
      contextSummary = typeof conversation?.context_summary === 'string' ? conversation.context_summary : null
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({
        error: 'Voice Agent is not configured yet. Add GEMINI_API_KEY in Vercel → Project Settings → Environment Variables, then redeploy.',
        code: 'MISSING_GEMINI_API_KEY',
      }, { status: 503 })
    }

    // The REST auth_tokens endpoint expects AuthToken fields at the top level.
    // Keep the payload to universally supported token fields; Live model/config
    // are supplied by the client when it opens the constrained Live API session.
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
      }),
      cache: 'no-store',
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok || typeof data.name !== 'string') {
      const message = data?.error?.message || 'Google could not start a Live voice session. Check your API key, model access, quota, and billing.'
      console.error('Gemini Live token provisioning failed:', response.status, message)
      return NextResponse.json({
        error: message,
        code: 'GEMINI_TOKEN_FAILED',
      }, { status: response.status === 429 ? 429 : 502 })
    }

    return NextResponse.json({ token: data.name, expiresAt: data.expireTime, contextSummary }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error) {
    console.error('Aperonix Voice Agent token error:', error)
    return NextResponse.json({ error: 'Could not prepare the voice session. Please try again.' }, { status: 500 })
  }
}
