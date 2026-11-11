import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' }

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const rawUrl = request.nextUrl.searchParams.get('url')
  if (!rawUrl || !SUPABASE_URL) return NextResponse.json({ error: 'Missing or invalid media URL' }, { status: 400 })

  let input: URL
  let project: URL
  try {
    input = new URL(rawUrl)
    project = new URL(SUPABASE_URL)
  } catch {
    return NextResponse.json({ error: 'Invalid media URL' }, { status: 400 })
  }

  const prefix = '/storage/v1/object/public/'
  if (input.protocol !== 'https:' || input.host !== project.host || !input.pathname.startsWith(prefix)) {
    return NextResponse.json({ error: 'Unsupported media URL' }, { status: 400 })
  }

  let bucket = ''
  let originalPath = ''
  try {
    const parts = input.pathname.slice(prefix.length).split('/')
    bucket = decodeURIComponent(parts.shift() || '')
    originalPath = parts.map(part => decodeURIComponent(part)).join('/')
  } catch {
    return NextResponse.json({ error: 'Invalid media object path' }, { status: 400 })
  }

  if (bucket !== 'posts' || !originalPath || originalPath.split('/').length !== 2 ||
      originalPath.split('/').some(part => !part || part === '.' || part === '..')) {
    return NextResponse.json({ error: 'Unsupported media object' }, { status: 400 })
  }

  // Public share pages work without login. Enforce the same posts RLS
  // visibility check before returning a rendition URL to any visitor.
  const { data: visiblePost, error: visibilityError } = await supabase.from('posts').select('id')
    .eq('media_type', 'video').eq('media_url', rawUrl).limit(1).maybeSingle()
  if (visibilityError) {
    console.error('Could not verify video post visibility:', visibilityError.message)
    return NextResponse.json({ error: 'Could not verify video visibility' }, { status: 503, headers: NO_STORE })
  }
  if (!visiblePost) return NextResponse.json({ error: 'Video post is not available' }, { status: 404, headers: NO_STORE })

  try {
    const admin = createAdminClient()
    const { data: job, error } = await admin.from('video_processing_jobs')
      .select('status, playback_path')
      .eq('bucket', 'posts')
      .eq('original_path', originalPath)
      .maybeSingle()

    if (error) {
      console.error('Video rendition lookup failed:', error.message)
      return NextResponse.json({ error: 'Could not check video processing status' }, { status: 503, headers: NO_STORE })
    }
    if (!job) return NextResponse.json({ status: 'untracked', playbackUrl: rawUrl }, { headers: NO_STORE })

    if (job.status === 'ready' && job.playback_path) {
      const { data } = admin.storage.from('posts').getPublicUrl(job.playback_path)
      return NextResponse.json({ status: 'ready', playbackUrl: data.publicUrl }, { headers: NO_STORE })
    }
    if (job.status === 'failed') {
      return NextResponse.json({ status: 'failed', playbackUrl: rawUrl }, { headers: NO_STORE })
    }
    return NextResponse.json({ status: job.status, playbackUrl: rawUrl }, { headers: NO_STORE })
  } catch (error) {
    console.error('Video playback status endpoint failed:', error)
    return NextResponse.json({ error: 'Could not check video processing status' }, { status: 503, headers: NO_STORE })
  }
}
