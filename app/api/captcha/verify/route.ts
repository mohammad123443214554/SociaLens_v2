import { NextRequest, NextResponse } from 'next/server'

// The widget on the page only proves someone loaded the form - the real
// check happens here, server-side, against Cloudflare's own endpoint,
// using the secret key that never reaches the browser. If this route
// isn't configured (no secret key set), it fails open rather than
// blocking every signup - see the comment below.
export async function POST(request: NextRequest) {
  const secretKey = process.env.TURNSTILE_SECRET_KEY
  const { token } = await request.json().catch(() => ({ token: null }))

  // Not configured yet - don't lock everyone out of signing up just
  // because the captcha keys haven't been added to Vercel. Once
  // TURNSTILE_SECRET_KEY is set this stops being reachable.
  if (!secretKey) {
    return NextResponse.json({ success: true, configured: false })
  }

  if (!token) {
    return NextResponse.json({ success: false, error: 'Missing captcha token' }, { status: 400 })
  }

  try {
    const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: secretKey, response: token }),
    })
    const verifyData = await verifyRes.json()

    if (!verifyData.success) {
      return NextResponse.json({ success: false, error: 'Captcha verification failed' }, { status: 400 })
    }

    return NextResponse.json({ success: true, configured: true })
  } catch (err) {
    console.error('Captcha verify error:', err)
    return NextResponse.json({ success: false, error: 'Could not verify captcha right now' }, { status: 500 })
  }
}
