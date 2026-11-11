import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ALLOWED_BUCKETS = ['posts', 'avatars', 'covers', 'stories', 'chat-media', 'chat-wallpapers', 'appeals', 'contact-support'] as const
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime', 'audio/webm', 'audio/mpeg', 'audio/ogg']
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024

function safeExtension(file: File) {
  const byType: Record<string, string> = {
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'audio/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
  }
  return byType[file.type] || 'bin'
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid upload form data' }, { status: 400 })
  }

  const file = formData.get('file')
  const bucketValue = formData.get('bucket')
  const bucket = typeof bucketValue === 'string' && bucketValue ? bucketValue : 'posts'

  if (!(file instanceof File)) return NextResponse.json({ error: 'No valid file supplied' }, { status: 400 })
  if (!ALLOWED_BUCKETS.includes(bucket as any)) {
    return NextResponse.json({ error: 'Invalid upload destination' }, { status: 400 })
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
  }
  if (file.size <= 0 || file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: 'File must be between 1 byte and 50MB' }, { status: 400 })
  }

  const path = `${user.id}/${Date.now()}-${randomUUID()}.${safeExtension(file)}`
  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '31536000',
    contentType: file.type,
    upsert: false,
  })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  // Only published-post media enters the video worker queue. Stories, chat,
  // avatars, covers and every other Storage bucket retain their existing flow.
  if (bucket === 'posts' && file.type.startsWith('video/')) {
    try {
      const admin = createAdminClient()
      const { error: queueError } = await admin.from('video_processing_jobs').insert({
        owner_id: user.id,
        bucket,
        original_path: path,
        status: 'queued',
        source_bytes: file.size,
      })
      if (queueError) throw queueError
    } catch (queueError) {
      // Do not leave an upload that the worker cannot discover.
      await supabase.storage.from(bucket).remove([path])
      console.error('Could not enqueue video compatibility job:', queueError)
      return NextResponse.json(
        { error: 'Video upload could not be queued. Please retry.' },
        { status: 503 },
      )
    }
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return NextResponse.json({
    url: data.publicUrl,
    ...(bucket === 'posts' && file.type.startsWith('video/')
      ? { videoProcessing: 'queued' as const }
      : {}),
  })
}
