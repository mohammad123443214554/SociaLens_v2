import { NextRequest, NextResponse } from 'next/server'

// manifest.json's "share_target" makes SociaLens show up in the phone's
// share sheet next to WhatsApp, Gmail, etc., pointing it at POST /share.
// The service worker (see public/sw.js) is what normally answers that
// POST - it intercepts the request on-device and never lets it reach a
// server function at all, which matters because actually doing something
// with a shared photo/video is planned for a future version of
// SociaLens, not this one. This route is only a fallback for the rare
// case a share reaches the server before the service worker is
// controlling the page (e.g. right after first install): it deliberately
// does NOT read the request body (a large shared video would hit
// Vercel's hard ~4.5MB request-size limit if it tried to), and just sends
// the person straight to the same "coming soon" page.
export async function POST(request: NextRequest) {
  return NextResponse.redirect(new URL('/share/handle', request.nextUrl.origin), 303)
}

// Someone navigating to /share directly (not via the share sheet) has
// nothing to hand off - send them to the app instead of a bare 404.
export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/feed', request.nextUrl.origin))
}
