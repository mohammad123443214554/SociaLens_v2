import { NextResponse } from 'next/server'

export const revalidate = 86400

type GoogleFontMetadata = {
  family?: string
  category?: string
  subsets?: string[]
}

export async function GET() {
  try {
    const response = await fetch('https://fonts.google.com/metadata/fonts', {
      headers: { Accept: 'application/json' },
      next: { revalidate: 86400 },
    })
    if (!response.ok) {
      return NextResponse.json({ error: 'The Google Fonts catalogue is temporarily unavailable.' }, { status: 502 })
    }

    const raw = (await response.text()).replace(/^\)\]\}',?\s*/, '')
    const metadata = JSON.parse(raw) as {
      familyMetadataList?: GoogleFontMetadata[]
      items?: GoogleFontMetadata[]
    }
    const entries = metadata.familyMetadataList || metadata.items || []
    const fonts = entries
      .filter((font): font is GoogleFontMetadata & { family: string } =>
        typeof font.family === 'string' && font.family.trim().length > 0 &&
        (!Array.isArray(font.subsets) || font.subsets.includes('latin'))
      )
      .map(font => ({ family: font.family, category: font.category || 'sans-serif' }))
      .sort((a, b) => a.family.localeCompare(b.family))

    if (fonts.length < 1000) {
      return NextResponse.json({ error: 'The font catalogue returned an incomplete result.' }, { status: 502 })
    }

    return NextResponse.json({ fonts, count: fonts.length, source: 'Google Fonts' }, {
      headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' },
    })
  } catch {
    return NextResponse.json({ error: 'Could not load the Google Fonts catalogue.' }, { status: 502 })
  }
}
