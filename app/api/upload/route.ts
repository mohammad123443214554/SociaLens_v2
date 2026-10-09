import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_BUCKETS = ['posts', 'avatars', 'covers', 'stories', 'chat-media', 'chat-wallpapers', 'appeals', 'contact-support'] as const
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime', 'audio/webm', 'audio/mpeg', 'audio/ogg']
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024 // 50MB - Generous for a short video/voice note, still bounds storage abuse

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File
  const bucket = (formData.get('bucket') as string) ?? 'posts'

  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  if (!ALLOWED_BUCKETS.includes(bucket as any)) {
    return NextResponse.json({ error: 'Invalid upload destination' }, { status: 400 })
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: 'File is too large (50MB max)' }, { status: 400 })
  }

  const ext = file.name.split('.').pop()
  const path = `${user.id}/${Date.now()}.${ext}`

  const { error } = await supabase.storage.from(bucket).upload(path, file, { cacheControl: '31536000' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return NextResponse.json({ url: data.publicUrl })
} 
