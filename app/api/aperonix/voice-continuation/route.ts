import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callGemini, extractText } from '@/lib/aperonix/gemini'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_CONTEXT_AUDIO_BYTES = 15 * 1024 * 1024

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Please sign in to continue a voice conversation.' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const sourceId = typeof body.conversationId === 'string' ? body.conversationId : ''
    if (!sourceId) return NextResponse.json({ error: 'Choose a conversation to continue.' }, { status: 400 })

    const { data: source, error: sourceError } = await supabase.from('aperonix_voice_conversations')
      .select('id,title,storage_path,mime_type,duration_ms,context_summary')
      .eq('id', sourceId).eq('user_id', user.id).maybeSingle()
    if (sourceError || !source) return NextResponse.json({ error: 'This voice conversation could not be found.' }, { status: 404 })
    if (!source.storage_path || !source.storage_path.startsWith(user.id + '/')) {
      return NextResponse.json({ error: 'This conversation has no saved recording to connect.' }, { status: 400 })
    }

    const { data: audio, error: downloadError } = await supabase.storage.from('aperonix-voice-recordings').download(source.storage_path)
    if (downloadError || !audio) return NextResponse.json({ error: 'Could not read the previous recording. Please try again.' }, { status: 400 })
    if (audio.size > MAX_CONTEXT_AUDIO_BYTES) {
      return NextResponse.json({ error: 'This recording is too large to prepare a continuation automatically (limit 15 MB). The original conversation is unchanged.' }, { status: 413 })
    }

    const mimeType = source.mime_type || audio.type || 'audio/webm'
    const audioBase64 = Buffer.from(await audio.arrayBuffer()).toString('base64')
    const previousSummary = typeof source.context_summary === 'string' ? source.context_summary.trim() : ''
    const transcriptContent = await callGemini('generate',
      'You are preparing continuity notes for a private voice conversation. Carefully listen to the attached complete audio recording, which may contain both the user and the AI speaking. Capture the user’s goals, facts they shared, preferences, decisions, names, numbers, instructions, questions and answers, and unresolved tasks. Clearly distinguish user statements from AI suggestions when possible. Include enough detail that another AI can continue the conversation without asking the user to repeat themselves. Do not invent details; mark anything inaudible or uncertain. Output concise but comprehensive continuity notes, maximum 12000 characters.',
      [{ role: 'user', parts: [
        { text: (previousSummary ? 'Earlier carried-forward context (preserve all useful details and add anything new from this recording):\n' + previousSummary + '\n\n' : '') + 'Create the continuity notes for this voice recording.' },
        { inlineData: { mimeType, data: audioBase64 } },
      ] }],
    )
    const contextSummary = extractText(transcriptContent).trim().slice(0, 12000)
    if (!contextSummary) return NextResponse.json({ error: 'Aperonix could not prepare context from this recording. The original conversation is unchanged.' }, { status: 502 })

    const title = (source.title.replace(/\s+continue$/i, '').trim() || 'Voice conversation') + ' continue'
    const { data: conversation, error: insertError } = await supabase.from('aperonix_voice_conversations')
      .insert({
        user_id: user.id,
        title: title.slice(0, 80),
        storage_path: null,
        mime_type: 'audio/webm',
        duration_ms: 0,
        pinned: false,
        context_summary: contextSummary,
      })
      .select('id,title,storage_path,mime_type,duration_ms,pinned,context_summary,created_at,updated_at')
      .single()
    if (insertError || !conversation) {
      console.error('Could not create connected Aperonix voice conversation:', insertError)
      return NextResponse.json({ error: 'Could not create the connected conversation. Please try again.' }, { status: 500 })
    }

    return NextResponse.json({ conversation }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch (error) {
    console.error('Aperonix voice continuation failed:', error)
    return NextResponse.json({ error: 'Could not prepare this continuation. Please try again.' }, { status: 500 })
  }
}
