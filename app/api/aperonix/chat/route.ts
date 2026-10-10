import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callGemini, extractText, GeminiMessage, GeminiPart } from '@/lib/aperonix/gemini'
import { APERONIX_SYSTEM_PROMPT } from '@/lib/aperonix/systemPrompt'

export const maxDuration = 30

interface ChatHistoryItem { role: 'user' | 'model'; content: string }
interface StoredFileInput { path: string; name: string; mimeType: string; size: number }

const MAX_FILES = 5
const MAX_FILE_BYTES = 20 * 1024 * 1024
const TEXT_EXTENSIONS = new Set([
  'txt','md','markdown','csv','tsv','json','jsonl','xml','html','htm','css','js','jsx','ts','tsx',
  'py','java','c','h','cpp','cs','go','rs','sql','sh','bash','yml','yaml','toml','ini','log',
  'rtf','svg','ics','vtt','srt'
])
const MODEL_INLINE_TYPES = new Set([
  'application/pdf',
  'image/png','image/jpeg','image/webp','image/gif',
  'audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/aac','audio/ogg','audio/flac','audio/mp4',
  'video/mp4','video/mpeg','video/mov','video/avi','video/x-flv','video/mpg','video/webm','video/wmv','video/3gpp'
])

function extensionOf(name: string) {
  return name.split('.').pop()?.toLowerCase() || ''
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json() as {
      messages?: ChatHistoryItem[]
      newMessage?: string
      files?: StoredFileInput[]
    }
    const messages = Array.isArray(body.messages) ? body.messages : []
    const newMessage = typeof body.newMessage === 'string' ? body.newMessage : ''
    const files = Array.isArray(body.files) ? body.files.slice(0, MAX_FILES) : []

    if (!newMessage.trim() && files.length === 0) {
      return NextResponse.json({ error: 'Write a message or attach a file first.' }, { status: 400 })
    }

    const userParts: GeminiPart[] = []
    for (const file of files) {
      if (!file || typeof file.path !== 'string' || !file.path.startsWith(`${user.id}/`)) {
        return NextResponse.json({ error: 'One of the files is not accessible from your account.' }, { status: 403 })
      }
      if (typeof file.size !== 'number' || file.size < 0 || file.size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: `“${file.name || 'File'}” exceeds the 20 MB limit.` }, { status: 413 })
      }

      const { data: blob, error } = await supabase.storage.from('aperonix-files').download(file.path)
      if (error || !blob) {
        return NextResponse.json({ error: `Could not read “${file.name || 'file'}” from secure storage. Please upload it again.` }, { status: 400 })
      }
      const mimeType = (file.mimeType || blob.type || 'application/octet-stream').toLowerCase()
      const ext = extensionOf(file.name || '')
      if (mimeType.startsWith('text/') || TEXT_EXTENSIONS.has(ext) || ['application/json','application/xml','application/csv','application/rtf'].includes(mimeType)) {
        const text = await blob.text()
        if (text.length > 120_000) {
          userParts.push({ text: `File “${file.name}” was truncated to its first 120,000 characters for analysis:\n\n${text.slice(0,120000)}` })
        } else {
          userParts.push({ text: `File “${file.name}” contents:\n\n${text}` })
        }
        continue
      }
      if (!MODEL_INLINE_TYPES.has(mimeType)) {
        return NextResponse.json({
          error: `Aperonix can upload and store “${file.name}”, but cannot read this format yet. For content analysis, use PDF, an image, supported audio/video, or export the document as TXT, CSV, JSON or PDF.`,
        }, { status: 415 })
      }
      const buffer = await blob.arrayBuffer()
      const base64 = Buffer.from(buffer).toString('base64')
      userParts.push({ inlineData: { mimeType, data: base64 } })
      userParts.push({ text: `Attached file: ${file.name}` })
    }

    userParts.push({ text: newMessage.trim() || 'Analyze the attached file(s), summarize the content, and answer clearly.' })
    const trimmedHistory = messages.slice(-20).map(m => ({
      role: m.role === 'model' ? 'model' as const : 'user' as const,
      parts: [{ text: String(m.content || '').slice(0, 20000) }],
    }))
    const contents: GeminiMessage[] = [...trimmedHistory, { role: 'user', parts: userParts }]
    const content = await callGemini('chat', APERONIX_SYSTEM_PROMPT, contents)
    const reply = extractText(content) || "Sorry, I couldn't come up with a reply. Try again?"
    return NextResponse.json({ reply })
  } catch (error: any) {
    console.error('Aperonix chat error:', error)
    return NextResponse.json({ error: 'Aperonix could not analyze this message. Please try again with a smaller or supported file.' }, { status: 500 })
  }
}
