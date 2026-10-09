import { NextRequest, NextResponse } from 'next/server'

// iTunes Search API - completely free, no API key/signup needed, and has a
// huge global music catalog. It gives us a 30-second preview clip for each
// track, which is exactly what "add a song to your story" needs (same idea
// Instagram/Spotify previews use).
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim()

  if (!query) {
    return NextResponse.json({ results: [] })
  }

  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=20`
    const res = await fetch(url)

    if (!res.ok) {
      return NextResponse.json({ error: 'Search failed' }, { status: 502 })
    }

    const data = await res.json()

    const results = (data.results || [])
      .filter((track: any) => track.previewUrl)
      .map((track: any) => ({
        id: String(track.trackId),
        title: track.trackName,
        artist: track.artistName,
        // Apple gives a 100x100 thumbnail by default - bump it up for a
        // sharper "now playing" badge in the story.
        artworkUrl: track.artworkUrl100?.replace('100x100', '400x400') || track.artworkUrl100,
        previewUrl: track.previewUrl,
      }))

    return NextResponse.json({ results })
  } catch (err) {
    console.error('Music search error:', err)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
