import { NextRequest, NextResponse } from 'next/server'
import { synthesizeEdgeTts } from '@/lib/server/edgeTts'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 30

// Aperonix's single voice everywhere: a warm, natural female voice - used
// for reading a reply aloud, for speaking back a voice-mode conversation,
// and (on the frontend) for reading a user's own chat messages aloud too.
// Emma is Microsoft's default "Multilingual" neural voice - handles the
// occasional Hindi/English code-switching in Aperonix's replies more
// gracefully than a plain en-US-only voice.
const APERONIX_VOICE = 'en-US-EmmaMultilingualNeural'

// Strips emojis and stray markdown symbols before speaking - without this,
// some engines announce emojis ("grinning face") or read "asterisk" around
// Bold text, which sounds nothing like a real person talking.
function cleanTextForSpeech(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{2190}-\u{21FF}]/gu, '')
    .replace(/[*_~`#]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export async function POST(req: NextRequest) {
  try {
    // Text-to-speech also costs per request - require auth, same as the
    // other Aperonix endpoints.
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { text } = await req.json()
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 })
    }

    const cleaned = cleanTextForSpeech(text).slice(0, 3000)
    if (!cleaned) {
      return NextResponse.json({ error: 'Nothing to speak' }, { status: 400 })
    }

    const audioBuffer = await synthesizeEdgeTts(cleaned, {
      voice: APERONIX_VOICE,
      // A touch slower and slightly higher reads as warmer/sweeter rather
      // than robotic or flat.
      rate: '-4%',
      pitch: '+8Hz',
      volume: '+0%',
    })

    return new NextResponse(new Uint8Array(audioBuffer), {
      headers: { 'Content-Type': 'audio/mpeg' },
    })
  } catch (error) {
    console.error('[aperonix/speak] Edge TTS failed:', error)
    return NextResponse.json({ error: 'Could not generate speech' }, { status: 503 })
  }
}
