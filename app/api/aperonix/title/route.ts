import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callGemini, extractText } from '@/lib/aperonix/gemini'

export const maxDuration = 15

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json() as { message?: string; attachmentNames?: string[] }
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 12000) : ''
    const attachmentNames = Array.isArray(body.attachmentNames)
      ? body.attachmentNames.filter((name): name is string => typeof name === 'string').slice(0, 5)
      : []
    if (!message && attachmentNames.length === 0) {
      return NextResponse.json({ error: 'A message or attachment is required.' }, { status: 400 })
    }

    const prompt = [
      'Create a concise, useful title for this chat, similar to ChatGPT conversation titles.',
      'Identify the main intent/topic of the full user message, not just its opening words.',
      'Use the same language as the user. Usually 3–7 words, maximum 60 characters.',
      'Return only the title, with no quotation marks, label, or explanation.',
      attachmentNames.length ? 'Attached files: ' + attachmentNames.join(', ') : '',
      'User message: ' + (message || 'Analyze the attached file(s).'),
    ].filter(Boolean).join('\n\n')

    const result = await callGemini('generate',
      'You generate short, accurate conversation titles. Never answer the user message; output only a title.',
      [{ role: 'user', parts: [{ text: prompt }] }],
    )
    const title = extractText(result).replace(/^["'\s]+|["'\s]+$/g, '').replace(/^title:\s*/i, '').slice(0, 80).trim()
    if (!title) return NextResponse.json({ error: 'Could not generate a title.' }, { status: 502 })
    return NextResponse.json({ title })
  } catch (error) {
    console.error('Aperonix title generation failed:', error)
    return NextResponse.json({ error: 'Could not generate a chat title.' }, { status: 500 })
  }
}
