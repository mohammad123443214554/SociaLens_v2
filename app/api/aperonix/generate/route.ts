import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callGemini, extractText, GeminiMessage } from '@/lib/aperonix/gemini'
import { stripMarkdown } from '@/lib/utils/helpers'

const NO_MARKDOWN = ` Do not use any markdown or formatting symbols anywhere in the reply - no **bold**, no *italics*, no underscores, no backticks. Plain text only.`

const MEDIA_PROMPTS: Record<string, string> = {
  title: `Watch/look at this media and write ONE short, catchy title for a social media post (max 100 characters). Reply with ONLY the title text - no quotes, no labels, no extra commentary.${NO_MARKDOWN}`,
  description: `Watch/look at this media and write an engaging caption/description for a social media post. Keep it to at most 100 words. Do NOT include any hashtags anywhere in this text - hashtags are handled in a separate field. Reply with ONLY the caption text - no quotes, no labels, no extra commentary.${NO_MARKDOWN}`,
  hashtags: `Watch/look at this media and generate EXACTLY 5 relevant hashtags for a social media post about it. One of the 5 must always be #SociaLens. Reply with ONLY the 5 hashtags separated by single spaces, in the format "#SociaLens #tag2 #tag3 #tag4 #tag5" - no extra commentary, no line breaks.${NO_MARKDOWN}`,
}

const TEXT_PROMPTS: Record<string, string> = {
  title: `Based on the following instructions from the user, write ONE short, catchy title for a text-only social media post (max 100 characters). User's instructions: "{context}". Reply with ONLY the title text - no quotes, no labels, no extra commentary.${NO_MARKDOWN}`,
  description: `Based on the following instructions from the user, write an engaging caption/description for a text-only social media post. Keep it to at most 100 words. Do NOT include any hashtags anywhere in this text - hashtags are handled in a separate field. User's instructions: "{context}". Reply with ONLY the caption text - no quotes, no labels, no extra commentary.${NO_MARKDOWN}`,
  hashtags: `Based on the following instructions from the user, generate EXACTLY 5 relevant hashtags for a text-only social media post. One of the 5 must always be #SociaLens. User's instructions: "{context}". Reply with ONLY the 5 hashtags separated by single spaces, in the format "#SociaLens #tag2 #tag3 #tag4 #tag5" - no extra commentary, no line breaks.${NO_MARKDOWN}`,
}

const SYSTEM_PROMPT = 'You are Aperonix, SociaLens\'s official AI assistant, made by Mohammad Khan. You help users write great post titles, captions, and hashtags - either by analyzing their photo/video, or from instructions they type for a text-only post.'

export async function POST(request: NextRequest) {
  try {
    // Same cost-abuse guard as the chat/speak routes - this also calls
    // Gemini, So it must never be reachable by a signed-out visitor.
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { mediaBase64, mimeType, context, field, regenerate, previousResult } = (await request.json()) as {
      mediaBase64?: string
      mimeType?: string
      context?: string
      field: 'title' | 'description' | 'hashtags'
      regenerate?: boolean
      previousResult?: string
    }

    const hasMedia = !!mediaBase64 && !!mimeType
    const hasContext = !!context?.trim()

    if (!field || (!hasMedia && !hasContext)) {
      return NextResponse.json(
        { error: 'Either media or a context description is required, along with a valid field.' },
        { status: 400 }
      )
    }

    let promptText = hasMedia
      ? MEDIA_PROMPTS[field]
      : TEXT_PROMPTS[field]?.replace('{context}', context!.trim())

    if (!promptText) {
      return NextResponse.json({ error: 'Invalid field' }, { status: 400 })
    }

    if (regenerate && previousResult) {
      promptText += ` You already suggested: "${previousResult}". Give a noticeably different alternative this time.`
    }

    const parts: GeminiMessage['parts'] = hasMedia
      ? [{ inlineData: { mimeType: mimeType!, data: mediaBase64! } }, { text: promptText }]
      : [{ text: promptText }]

    const contents: GeminiMessage[] = [{ role: 'user', parts }]

    const content = await callGemini('generate', SYSTEM_PROMPT, contents)
    let result = extractText(content)
    if (!result) throw new Error('Empty response')
    // Belt-and-suspenders - even though the prompt already asks for plain
    // text, models occasionally slip in a stray ** anyway, and that would
    // Show up literally in the post instead of actually rendering bold.
    result = stripMarkdown(result)

    return NextResponse.json({ result })
  } catch (error: any) {
    console.error('Aperonix generate error:', error)
    return NextResponse.json({ error: 'Try again later.' }, { status: 500 })
  }
}
