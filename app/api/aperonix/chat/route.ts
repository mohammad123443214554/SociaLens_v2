import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callGemini, extractText, GeminiMessage, GeminiPart } from '@/lib/aperonix/gemini'
import { APERONIX_SYSTEM_PROMPT } from '@/lib/aperonix/systemPrompt'

export const maxDuration = 30

interface ChatHistoryItem {
  role: 'user' | 'model'
  content: string
}

interface MediaInput {
  mimeType: string
  data: string // base64, no "data:" prefix
}

export async function POST(request: NextRequest) {
  try {
    // Aperonix calls out to the Gemini API, which costs real money per
    // request - require a signed-in SociaLens user so a stranger can't script
    // requests straight at this endpoint and burn through the API quota.
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { messages, newMessage, media } = (await request.json()) as {
      messages: ChatHistoryItem[]
      newMessage: string
      media?: MediaInput[]
    }

    // A photo/video with no caption is still a valid message - only reject
    // when there's genuinely nothing to send.
    if (!newMessage?.trim() && (!media || media.length === 0)) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Keep only the last 20 turns of history so the request doesn't grow unbounded.
    const trimmedHistory = (messages || []).slice(-20)

    const userParts: GeminiPart[] = []
    for (const item of media || []) {
      userParts.push({ inlineData: { mimeType: item.mimeType, data: item.data } })
    }
    userParts.push({ text: newMessage?.trim() || 'Describe what you see in a friendly way.' })

    const contents: GeminiMessage[] = [
      ...trimmedHistory.map(m => ({ role: m.role, parts: [{ text: m.content }] })),
      { role: 'user' as const, parts: userParts },
    ]

    const content = await callGemini('chat', APERONIX_SYSTEM_PROMPT, contents)
    const reply = extractText(content) || "Sorry, I couldn't come up with a reply. Try again?"

    return NextResponse.json({ reply })
  } catch (error: any) {
    console.error('Aperonix chat error:', error)
    return NextResponse.json({ error: 'Try again later.' }, { status: 500 })
  }
}
