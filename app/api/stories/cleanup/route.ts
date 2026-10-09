import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Called on a schedule by Vercel Cron (see vercel.json - runs hourly).
// Stories already stop being *shown* to anyone the instant they pass 24h
// (the database RLS policy filters `expires_at > NOW()`), so this route's
// Only job is the actual cleanup: remove expired rows from the database and
// Delete their matching files from the "stories" storage bucket, so
// Storage usage doesn't grow forever.
export async function GET(request: NextRequest) {
  // Protect the endpoint so randoms on the internet can't spam-trigger it.
  const authHeader = request.headers.get('authorization')
  const expected = process.env.CRON_SECRET
  if (expected && authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Grab expired stories first so we know which storage files to remove.
  const { data: expired, error: fetchError } = await supabase
    .from('stories')
    .select('id, media_url, photo_scenes, video_scenes')
    .lte('expires_at', new Date().toISOString())

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  if (!expired || expired.length === 0) {
    return NextResponse.json({ deleted: 0 })
  }

  // Collect every media URL that might exist on a story - the single legacy
  // `media_url` field, plus every scene's own URL for multi-photo/video
  // stories. Without the scene URLs, a multi-scene story's actual image/
  // video files would never get cleaned up and storage usage would keep
  // growing even though the story row itself is gone.
  const allUrls: string[] = []
  for (const s of expired) {
    if (s.media_url) allUrls.push(s.media_url)
    if (Array.isArray(s.photo_scenes)) {
      for (const scene of s.photo_scenes as any[]) {
        if (scene?.imageUrl) allUrls.push(scene.imageUrl)
      }
    }
    if (Array.isArray(s.video_scenes)) {
      for (const scene of s.video_scenes as any[]) {
        if (scene?.videoUrl) allUrls.push(scene.videoUrl)
      }
    }
  }

  // Extract storage paths ("<userId>/<filename>") from each public URL and
  // delete the actual files from the "stories" bucket.
  const paths = allUrls
    .map((url) => {
      const marker = '/storage/v1/object/public/stories/'
      const idx = url.indexOf(marker)
      return idx === -1 ? null : url.slice(idx + marker.length)
    })
    .filter((p): p is string => !!p)

  if (paths.length > 0) {
    await supabase.storage.from('stories').remove(paths)
  }

  const { error: deleteError } = await supabase
    .from('stories')
    .delete()
    .in('id', expired.map((s) => s.id))

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ deleted: expired.length })
}
