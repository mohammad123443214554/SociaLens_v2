import { NextRequest, NextResponse } from 'next/server'
import { inflateRawSync } from 'node:zlib'
import { createClient } from '@/lib/supabase/server'
import { callGemini, extractText, GeminiMessage, GeminiPart } from '@/lib/aperonix/gemini'
import { APERONIX_SYSTEM_PROMPT } from '@/lib/aperonix/systemPrompt'

export const maxDuration = 30

interface ChatHistoryItem { role: 'user' | 'model'; content: string; files?: StoredFileInput[] }
interface StoredFileInput { path: string; name: string; mimeType: string; size: number }

const MAX_FILES = 5
const MAX_FILE_BYTES = 20 * 1024 * 1024
const MAX_TOTAL_ANALYSIS_BYTES = 30 * 1024 * 1024
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

function normalizedMimeType(mimeType: string, name: string) {
  if (mimeType && mimeType !== 'application/octet-stream') return mimeType
  const ext = extensionOf(name)
  const known: Record<string, string> = {
    pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', gif: 'image/gif', mp3: 'audio/mpeg', wav: 'audio/wav',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/mov',
    txt: 'text/plain', csv: 'text/csv', tsv: 'text/tab-separated-values',
    json: 'application/json', xml: 'application/xml', html: 'text/html',
    md: 'text/markdown', log: 'text/plain', srt: 'text/plain', vtt: 'text/plain',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  }
  return known[ext] || mimeType || 'application/octet-stream'
}

function unzipTextEntries(input: Buffer): Map<string, string> {
  const entries = new Map<string, string>()
  let eocd = -1
  for (let i = input.length - 22; i >= Math.max(0, input.length - 65557); i--) {
    if (input.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('Invalid office document archive')
  const count = input.readUInt16LE(eocd + 10)
  let cursor = input.readUInt32LE(eocd + 16)
  for (let i = 0; i < count && cursor + 46 <= input.length; i++) {
    if (input.readUInt32LE(cursor) !== 0x02014b50) break
    const method = input.readUInt16LE(cursor + 10)
    const compressedSize = input.readUInt32LE(cursor + 20)
    const nameLength = input.readUInt16LE(cursor + 28)
    const extraLength = input.readUInt16LE(cursor + 30)
    const commentLength = input.readUInt16LE(cursor + 32)
    const localOffset = input.readUInt32LE(cursor + 42)
    const name = input.toString('utf8', cursor + 46, cursor + 46 + nameLength)
    cursor += 46 + nameLength + extraLength + commentLength
    if (!/\.(xml|rels)$/i.test(name) || localOffset + 30 > input.length) continue
    if (input.readUInt32LE(localOffset) !== 0x04034b50) continue
    const localNameLength = input.readUInt16LE(localOffset + 26)
    const localExtraLength = input.readUInt16LE(localOffset + 28)
    const start = localOffset + 30 + localNameLength + localExtraLength
    const compressed = input.subarray(start, start + compressedSize)
    let uncompressed: Buffer
    if (method === 0) uncompressed = compressed
    else if (method === 8) uncompressed = inflateRawSync(compressed)
    else continue
    entries.set(name, uncompressed.toString('utf8'))
  }
  return entries
}

function xmlText(value: string) {
  return value.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/[\t ]+/g, ' ').replace(/ *\n */g, '\n').trim()
}

function extractOfficeText(buffer: Buffer, ext: string): string | null {
  const entries = unzipTextEntries(buffer)
  if (ext === 'docx') {
    const document = entries.get('word/document.xml')
    if (!document) return null
    return xmlText(document.replace(/<\/w:p>/g, '\n').replace(/<\/w:tr>/g, '\n'))
  }
  if (ext === 'pptx') {
    const slides = [...entries.entries()].filter(([name]) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    return slides.map(([, xml], i) => 'Slide ' + (i + 1) + ': ' + xmlText(xml)).join('\n\n')
  }
  if (ext === 'xlsx') {
    const sharedXml = entries.get('xl/sharedStrings.xml') || ''
    const shared = [...sharedXml.matchAll(/<si[ >][\s\S]*?<\/si>/g)]
      .map(match => [...match[0].matchAll(/<t(?: [^>]*)?>([\s\S]*?)<\/t>/g)].map(t => xmlText(t[1])).join(''))
    const sheets = [...entries.entries()].filter(([name]) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    return sheets.map(([name, xml], sheetIndex) => {
      const rows = [...xml.matchAll(/<row[ >][\s\S]*?<\/row>/g)].map(row => {
        const cells = [...row[0].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)].map(cell => {
          const attrs = cell[1]
          const value = cell[2].match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? ''
          if (/t="s"/.test(attrs)) return shared[Number(value)] ?? ''
          const inline = cell[2].match(/<is[ >][\s\S]*?<\/is>/)?.[0]
          return inline ? xmlText(inline) : xmlText(value)
        })
        return cells.join('\t')
      })
      return 'Sheet ' + (sheetIndex + 1) + ' (' + name + ')\n' + rows.join('\n')
    }).join('\n\n')
  }
  return null
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
    const currentFiles = Array.isArray(body.files) ? body.files : []
    // Include recent conversation attachments so follow-up questions can refer
    // to an earlier upload without uploading its bytes through the app again.
    const seenPaths = new Set<string>()
    const files = [...currentFiles, ...messages.slice().reverse().flatMap(m => Array.isArray(m.files) ? m.files : [])]
      .filter(file => {
        if (!file || typeof file.path !== 'string' || seenPaths.has(file.path)) return false
        seenPaths.add(file.path)
        return true
      }).slice(0, MAX_FILES)

    if (!newMessage.trim() && files.length === 0) {
      return NextResponse.json({ error: 'Write a message or attach a file first.' }, { status: 400 })
    }

    const userParts: GeminiPart[] = []
    let totalAnalysisBytes = 0
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
      if (blob.size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: `“${file.name || 'File'}” exceeds the 20 MB limit.` }, { status: 413 })
      }
      totalAnalysisBytes += blob.size
      if (totalAnalysisBytes > MAX_TOTAL_ANALYSIS_BYTES) {
        return NextResponse.json({ error: 'Please attach files with a combined size under 30 MB per message for fast analysis.' }, { status: 413 })
      }
      const mimeType = normalizedMimeType((file.mimeType || blob.type || 'application/octet-stream').toLowerCase(), file.name || '')
      const ext = extensionOf(file.name || '')
      if (['docx','xlsx','pptx'].includes(ext)) {
        try {
          const extracted = extractOfficeText(Buffer.from(await blob.arrayBuffer()), ext)
          if (!extracted?.trim()) throw new Error('No readable text found')
          userParts.push({ text: `Extracted text from Office file “${file.name}”:\\n\\n${extracted.slice(0, 120000)}` })
          continue
        } catch {
          return NextResponse.json({ error: `Could not extract readable text from “${file.name}”. Please save it as PDF or TXT and upload again.` }, { status: 415 })
        }
      }
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
