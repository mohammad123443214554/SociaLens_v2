import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Search the full music catalog available through the provider.
 * Keep the provider client ID server-side. Licence metadata is returned
 * when available, but is not used to exclude search results.
 */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim()
  if (!query) return NextResponse.json({ results: [] })

  const clientId = process.env.JAMENDO_CLIENT_ID?.trim()
  if (!clientId) {
    return NextResponse.json(
      { error: 'Music search is not configured yet. Add JAMENDO_CLIENT_ID in the deployment environment.' },
      { status: 503 },
    )
  }

  try {
    const params = new URLSearchParams({
      client_id: clientId,
      format: 'json',
      limit: '100',
      search: query,
      type: 'single albumtrack',
      include: 'licenses',
      audioformat: 'mp32',
    })
    const response = await fetch(`https://api.jamendo.com/v3.0/tracks/?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 300 },
    })

    if (!response.ok) {
      console.error('Music provider search returned status:', response.status)
      return NextResponse.json({ error: 'Music search is temporarily unavailable.' }, { status: 502 })
    }

    const data = await response.json() as {
      headers?: { status?: string; error_message?: string }
      results?: Array<{
        id?: string
        name?: string
        artist_name?: string
        image?: string
        audio?: string
        duration?: string | number
        license_ccurl?: string
        audiodownload_allowed?: boolean
      }>
    }

    if (data.headers?.status === 'failed') {
      console.error('Music provider API error:', data.headers.error_message)
      return NextResponse.json({ error: 'Music search could not be completed.' }, { status: 502 })
    }

    const results = (data.results || [])
      .filter((track) => Boolean(track.id && track.name && track.audio))
      .map((track) => ({
        id: String(track.id),
        title: track.name || 'Unknown track',
        artist: track.artist_name || 'Unknown artist',
        artworkUrl: track.image || '',
        previewUrl: track.audio || '',
        duration: Math.max(0, Number(track.duration) || 0),
        licenseUrl: track.license_ccurl || '',
        source: 'Jamendo',
      }))

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Music search error:', error)
    return NextResponse.json({ error: 'Could not search Jamendo music right now.' }, { status: 500 })
  }
}
