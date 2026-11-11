import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const MAX_SOURCE_BYTES = 100 * 1024 * 1024
const VIDEO_EXTENSION = /\.(mp4|m4v|mov|webm|mkv|3gp|avi|mpg|mpeg|ts)$/i

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!SUPABASE_URL) return NextResponse.json({ error: 'Media storage is not configured' }, { status: 503 })

  let body: { objectPath?: unknown; sourceBytes?: unknown }
  try {
    const parsed: unknown = await request.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    body = parsed as { objectPath?: unknown; sourceBytes?: unknown }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const objectPath = typeof body.objectPath === 'string' ? body.objectPath : ''
  const sourceBytes = Number(body.sourceBytes)
  const parts = objectPath.split('/')
  if (parts.length !== 2 || parts[0] !== user.id || !parts[1] ||
      parts.some(part => part === '.' || part === '..') || !VIDEO_EXTENSION.test(parts[1]) ||
      !Number.isSafeInteger(sourceBytes) || sourceBytes <= 0 || sourceBytes > MAX_SOURCE_BYTES) {
    return NextResponse.json({ error: 'Invalid video object' }, { status: 400 })
  }

  const project = new URL(SUPABASE_URL)
  if (project.protocol !== 'https:') return NextResponse.json({ error: 'Invalid storage configuration' }, { status: 503 })
  const encodedPath = parts.map(part => encodeURIComponent(part)).join('/')
  const publicUrl = project.origin + '/storage/v1/object/public/posts/' + encodedPath

  // Only an already-published video row owned by this user can be registered.
  const { data: post, error: postError } = await supabase.from('posts').select('id')
    .eq('user_id', user.id).eq('media_type', 'video').eq('media_url', publicUrl).maybeSingle()
  if (postError) {
    console.error('Could not verify published video ownership:', postError.message)
    return NextResponse.json({ error: 'Could not verify published video' }, { status: 503 })
  }
  if (!post) return NextResponse.json({ error: 'Published video not found for this account' }, { status: 409 })

  try {
    const admin = createAdminClient()
    const { data: files, error: storageError } = await admin.storage.from('posts')
      .list(user.id, { search: parts[1], limit: 100 })
    if (storageError) throw storageError
    if (!files?.some(file => file.name === parts[1])) {
      return NextResponse.json({ error: 'Uploaded video was not found' }, { status: 404 })
    }

    const { error: queueError } = await admin.from('video_processing_jobs').upsert({
      owner_id: user.id,
      bucket: 'posts',
      original_path: objectPath,
      status: 'queued',
      source_bytes: sourceBytes,
    }, { onConflict: 'bucket,original_path', ignoreDuplicates: true })
    if (queueError) throw queueError
    return NextResponse.json({ status: 'queued' }, { status: 202 })
  } catch (error) {
    console.error('Could not register published video for processing:', error)
    return NextResponse.json({ error: 'Could not queue video processing' }, { status: 503 })
  }
}
