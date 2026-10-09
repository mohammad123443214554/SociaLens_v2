/**
 * Compresses an image file in the browser before it ever reaches Supabase
 * Storage - this is what actually keeps storage size and egress (bandwidth)
 * usage low on the free plan. Videos are left untouched; non-image files
 * are returned as-is.
 *
 * Deliberately built with ZERO external packages (just the browser's own
 * Canvas API) - no npm install / package.json / lockfile changes needed
 * anywhere, so it can never break a build the way a missing dependency can.
 *
 * A 3-4MB phone photo typically comes back around 150-350KB after this,
 * with no visible quality loss at the sizes the app actually displays.
 */

const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.75

export async function compressImageIfNeeded(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file

  // GIFs would lose their animation if run through canvas (it flattens to a
  // single frame), so leave them alone.
  if (file.type === 'image/gif') return file

  try {
    const bitmap = await createImageBitmap(file)

    let { width, height } = bitmap
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      const scale = MAX_DIMENSION / Math.max(width, height)
      width = Math.round(width * scale)
      height = Math.round(height * scale)
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file

    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
    )
    if (!blob) return file

    // Only actually use the compressed version if it's smaller - for
    // already-small or already-compressed images, re-encoding can
    // occasionally come out larger, so fall back to the original then.
    if (blob.size >= file.size) return file

    return new File([blob], renameToJpg(file.name), { type: 'image/jpeg' })
  } catch (err) {
    // If compression fails for any reason, better to upload the original
    // than to block the person's post/story entirely.
    console.error('Image compression failed, uploading original:', err)
    return file
  }
}

function renameToJpg(filename: string) {
  const withoutExt = filename.replace(/\.[^/.]+$/, '')
  return `${withoutExt || 'image'}.jpg`
}

// Long cache lifetime is safe here because every upload in this app goes to
// a fresh, uniquely-named path (timestamped filenames, no overwrites) - so
// the content at a given URL never changes, and can be cached aggressively
// both in the browser and on Supabase's CDN edge.
export const LONG_CACHE_CONTROL = '31536000' // seconds = 1 year
