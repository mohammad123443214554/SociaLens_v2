const KNOWN_PLATFORMS: { match: RegExp; name: string }[] = [
  { match: /youtu\.?be/i, name: 'YouTube' },
  { match: /instagram\.com/i, name: 'Instagram' },
  { match: /(wa\.me|whatsapp\.com)/i, name: 'WhatsApp' },
  { match: /twitter\.com|x\.com/i, name: 'X' },
  { match: /facebook\.com|fb\.watch/i, name: 'Facebook' },
  { match: /tiktok\.com/i, name: 'TikTok' },
  { match: /snapchat\.com/i, name: 'Snapchat' },
  { match: /pinterest\./i, name: 'Pinterest' },
  { match: /reddit\.com/i, name: 'Reddit' },
  { match: /linkedin\.com/i, name: 'LinkedIn' },
  { match: /telegram\.org|t\.me/i, name: 'Telegram' },
  { match: /spotify\.com/i, name: 'Spotify' },
  { match: /amazon\./i, name: 'Amazon' },
  { match: /netflix\.com/i, name: 'Netflix' },
]

/** "https://www.youtube.com/watch?v=..." -> "YouTube". Falls back to a
 * cleaned-up hostname ("example.com") for anything not in the known list,
 * and to null if the string isn't a usable URL at all. */
export function getPlatformNameFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '')
    const known = KNOWN_PLATFORMS.find((p) => p.match.test(hostname))
    if (known) return known.name
    // "example.com" -> "Example" as a reasonable generic fallback.
    const base = hostname.split('.').slice(0, -1).join('.') || hostname
    return base.charAt(0).toUpperCase() + base.slice(1)
  } catch {
    return null
  }
}
