import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type StoryTrack = {
  id: string
  title: string
  artist: string
  artworkUrl: string
  previewUrl: string
  duration: number
  licenseUrl?: string
  source: string
}

function normalize(value: string) {
  return value.toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

function trackKey(track: StoryTrack) {
  return `${normalize(track.title)}|${normalize(track.artist)}`
}

async function searchApple(query: string): Promise<StoryTrack[]> {
  const url = new URL('https://itunes.apple.com/search')
  url.searchParams.set('term', query)
  url.searchParams.set('media', 'music')
  url.searchParams.set('entity', 'song')
  url.searchParams.set('limit', '50')
  const response = await fetch(url.toString(), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error(`Apple music search returned ${response.status}`)
  const data = await response.json() as {
    results?: Array<{
      trackId?: number
      trackName?: string
      artistName?: string
      artworkUrl100?: string
      previewUrl?: string
      trackTimeMillis?: number
    }>
  }
  return (data.results || [])
    .filter((track) => Boolean(track.trackId && track.trackName && track.previewUrl))
    .map((track) => ({
      id: `apple-${track.trackId}`,
      title: track.trackName || 'Unknown track',
      artist: track.artistName || 'Unknown artist',
      artworkUrl: track.artworkUrl100?.replace(/\d+x\d+bb\.(jpg|png)$/i, '400x400bb.$1') || track.artworkUrl100 || '',
      previewUrl: track.previewUrl || '',
      duration: Math.min(30, Math.max(0, Math.round((Number(track.trackTimeMillis) || 30000) / 1000))),
      source: 'apple',
    }))
}

async function searchIndependent(query: string): Promise<StoryTrack[]> {
  const clientId = process.env.JAMENDO_CLIENT_ID?.trim()
  if (!clientId) return []

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
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 300 },
  })
  if (!response.ok) throw new Error(`Independent music search returned ${response.status}`)
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
    }>
  }
  if (data.headers?.status === 'failed') throw new Error(data.headers.error_message || 'Independent music search failed')

  return (data.results || [])
    .filter((track) => Boolean(track.id && track.name && track.audio))
    .map((track) => ({
      id: `indie-${track.id}`,
      title: track.name || 'Unknown track',
      artist: track.artist_name || 'Unknown artist',
      artworkUrl: track.image || '',
      previewUrl: track.audio || '',
      duration: Math.max(0, Number(track.duration) || 0),
      licenseUrl: track.license_ccurl || '',
      source: 'independent',
    }))
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim()
  if (!query) return NextResponse.json({ results: [] })

  const [appleResult, independentResult] = await Promise.allSettled([
    searchApple(query),
    searchIndependent(query),
  ])

  const appleTracks = appleResult.status === 'fulfilled' ? appleResult.value : []
  const independentTracks = independentResult.status === 'fulfilled' ? independentResult.value : []
  if (appleResult.status === 'rejected') console.error('Apple music search error:', appleResult.reason)
  if (independentResult.status === 'rejected') console.error('Independent music search error:', independentResult.reason)

  // Put familiar catalogue matches first, then append independent full-length tracks.
  // Deduplicate by title + artist so the combined list feels like one search.
  const results: StoryTrack[] = [...appleTracks]
  const indexByKey = new Map<string, number>()
  results.forEach((track, index) => indexByKey.set(trackKey(track), index))
  for (const track of independentTracks) {
    const key = trackKey(track)
    if (!key) continue
    const existingIndex = indexByKey.get(key)
    if (existingIndex === undefined) {
      indexByKey.set(key, results.length)
      results.push(track)
    } else if (track.duration > results[existingIndex].duration) {
      // Prefer the full-length version when the same track exists in both catalogs.
      results[existingIndex] = track
    }
  }

  if (results.length === 0 && appleResult.status === 'rejected' && independentResult.status === 'rejected') {
    return NextResponse.json({ error: 'Music search is temporarily unavailable. Please try again.' }, { status: 502 })
  }

  return NextResponse.json({ results })
}
