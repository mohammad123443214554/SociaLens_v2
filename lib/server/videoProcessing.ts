import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const MAX_SOURCE_BYTES = 100 * 1024 * 1024
const VIDEO_EXTENSION = /\.(mp4|m4v|mov|webm|mkv|3gp|avi|mpg|mpeg|ts)$/i

/**
 * Best-effort server-side queue registration for authenticated post-creation
 * routes that already inserted a video post. The original URL is retained
 * when the object is unsupported or registration is unavailable.
 */
export async function enqueuePublishedVideoForProcessing(userId: string, mediaUrl: string) {
  if (!SUPABASE_URL || !userId || !mediaUrl) return false

  try {
    const input = new URL(mediaUrl)
    const project = new URL(SUPABASE_URL)
    const prefix = '/storage/v1/object/public/posts/'
    if (input.protocol !== 'https:' || input.host !== project.host ||
        !input.pathname.startsWith(prefix) || input.search || input.hash) return false

    const parts = input.pathname.slice(prefix.length).split('/').map(decodeURIComponent)
    if (parts.length !== 2 || parts[0] !== userId || !parts[1] ||
        parts.some(part => part === '.' || part === '..') || !VIDEO_EXTENSION.test(parts[1])) return false

    const objectPath = parts.join('/')
    const admin = createAdminClient()

    const { data: post, error: postError } = await admin.from('posts').select('id')
      .eq('user_id', userId).eq('media_type', 'video').eq('media_url', mediaUrl)
      .limit(1).maybeSingle()
    if (postError) throw postError
    if (!post) return false

    const { data: files, error: storageError } = await admin.storage.from('posts')
      .list(userId, { search: parts[1], limit: 100 })
    if (storageError) throw storageError
    const file = files?.find(item => item.name === parts[1])
    if (!file) return false

    const metadataSize = Number((file.metadata as Record<string, unknown> | null)?.size)
    if (Number.isFinite(metadataSize) && metadataSize > MAX_SOURCE_BYTES) return false
    const sourceBytes = Number.isSafeInteger(metadataSize) && metadataSize > 0 ? metadataSize : null

    const { error: queueError } = await admin.from('video_processing_jobs').upsert({
      owner_id: userId,
      bucket: 'posts',
      original_path: objectPath,
      status: 'queued',
      source_bytes: sourceBytes,
    }, { onConflict: 'bucket,original_path', ignoreDuplicates: true })
    if (queueError) throw queueError
    return true
  } catch (error) {
    console.warn('Server-side video compatibility registration was skipped:', error)
    return false
  }
}
