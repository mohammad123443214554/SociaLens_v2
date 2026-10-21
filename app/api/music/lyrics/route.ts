import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type LyricLine = { time: number; text: string }
type LyricsRecord = {
  id?: number
  trackName?: string
  artistName?: string
  plainLyrics?: string | null
  syncedLyrics?: string | null
}

function parseSyncedLyrics(value: string | null | undefined): LyricLine[] {
  if (!value) return []
  const lines: LyricLine[] = []
  for (const raw of value.split(/\r?\n/)) {
    const match = raw.match(/^\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\](.*)$/)
    if (!match) continue
    const time = Number(match[1]) * 60 + Number(match[2])
    const text = match[3].trim()
    if (text) lines.push({ time, text })
  }
  return lines.sort((a, b) => a.time - b.time)
}

export async function GET(request: NextRequest) {
  const title = request.nextUrl.searchParams.get('title')?.trim().slice(0, 180)
  const artist = request.nextUrl.searchParams.get('artist')?.trim().slice(0, 180)
  if (!title || !artist) {
    return NextResponse.json({ available: false, lyrics: null }, { status: 400 })
  }

  const params = new URLSearchParams({ track_name: title, artist_name: artist })
  const headers = { Accept: 'application/json', 'User-Agent': 'SociaLensV2/1.0 (story lyrics lookup)' }
  try {
    const exactResponse = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
      headers, signal: AbortSignal.timeout(6500), cache: 'no-store',
    })
    let record: LyricsRecord | null = exactResponse.ok
      ? await exactResponse.json() as LyricsRecord
      : null

    if (!record?.plainLyrics && !record?.syncedLyrics) {
      const searchParams = new URLSearchParams({ track_name: title, artist_name: artist })
      const searchResponse = await fetch(`https://lrclib.net/api/search?${searchParams.toString()}`, {
        headers, signal: AbortSignal.timeout(6500), cache: 'no-store',
      })
      if (searchResponse.ok) {
        const matches = await searchResponse.json() as LyricsRecord[]
        const normalize = (value: string) => value.toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
        const expectedTitle = normalize(title)
        const expectedArtist = normalize(artist)
        record = matches.find(item => normalize(item.trackName || '') === expectedTitle && normalize(item.artistName || '').includes(expectedArtist))
          || matches.find(item => normalize(item.trackName || '') === expectedTitle)
          || null
      }
    }

    const plainLyrics = record?.plainLyrics?.trim() || ''
    const syncedLines = parseSyncedLyrics(record?.syncedLyrics)
    if (!plainLyrics && syncedLines.length === 0) {
      return NextResponse.json({ available: false, lyrics: null })
    }

    return NextResponse.json({
      available: true,
      lyrics: {
        plain: plainLyrics || syncedLines.map(line => line.text).join('\n'),
        synced: syncedLines,
        hasSynced: syncedLines.length > 0,
        trackName: record?.trackName || title,
        artistName: record?.artistName || artist,
      },
    }, { headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=600' } })
  } catch (error) {
    console.error('Story lyrics lookup failed:', error)
    return NextResponse.json({ available: false, lyrics: null, temporaryError: true })
  }
}
