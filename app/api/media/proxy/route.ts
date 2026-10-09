import { NextRequest, NextResponse } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL

function allowedStorageUrl(raw: string): URL | null {
  if (!SUPABASE_URL) return null
  try {
    const url = new URL(raw)
    const supabase = new URL(SUPABASE_URL)
    if (url.protocol !== 'https:' || url.host !== supabase.host) return null
    if (!url.pathname.startsWith('/storage/v1/object/')) return null
    return url
  } catch {
    return null
  }
}

function fallbackContentType(pathname: string): string {
  const lower = pathname.toLowerCase()
  if (lower.endsWith('.mp4') || lower.endsWith('.m4v')) return 'video/mp4'
  if (lower.endsWith('.webm')) return 'video/webm'
  if (lower.endsWith('.mov')) return 'video/quicktime'
  if (lower.endsWith('.mp3')) return 'audio/mpeg'
  if (lower.endsWith('.ogg')) return 'audio/ogg'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  return 'application/octet-stream'
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get('url')
  if (!rawUrl) return new NextResponse('Missing media URL', { status: 400 })

  const upstreamUrl = allowedStorageUrl(rawUrl)
  if (!upstreamUrl) return new NextResponse('Invalid media URL', { status: 400 })

  const headers = new Headers()
  for (const name of ['range', 'if-range', 'if-none-match', 'if-modified-since']) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      headers,
      redirect: 'follow',
      cache: 'no-store',
    })

    if (!upstream.ok && upstream.status !== 206 && upstream.status !== 304) {
      return new NextResponse('Media source unavailable', { status: upstream.status })
    }

    const responseHeaders = new Headers()
    responseHeaders.set('Content-Type', upstream.headers.get('content-type') || fallbackContentType(upstreamUrl.pathname))

    for (const name of ['content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified', 'cache-control']) {
      const value = upstream.headers.get(name)
      if (value) responseHeaders.set(name, value)
    }

    if (!responseHeaders.has('Accept-Ranges')) responseHeaders.set('Accept-Ranges', 'bytes')
    if (!responseHeaders.has('Cache-Control')) responseHeaders.set('Cache-Control', 'public, max-age=31536000, immutable')

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    })
  } catch {
    return new NextResponse('Media proxy failed', { status: 502 })
  }
} 
