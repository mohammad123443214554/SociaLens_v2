import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getRoboflowConfiguration, OBJECT_ERASER_MAX_IMAGE_BYTES, prepareObjectEraserImage } from '@/lib/studio/object-eraser'

export const runtime = 'nodejs'
export const maxDuration = 15

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' }

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Please sign in to use Object Eraser.' }, { status: 401, headers: NO_STORE_HEADERS })
  }

  return NextResponse.json({
    ok: true,
    provider: 'roboflow',
    apiConfigured: getRoboflowConfiguration().configured,
    maxImageBytes: OBJECT_ERASER_MAX_IMAGE_BYTES,
    acceptedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],
    stage: 'api-foundation',
  }, { headers: NO_STORE_HEADERS })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Please sign in to use Object Eraser.' }, { status: 401, headers: NO_STORE_HEADERS })
  }

  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > OBJECT_ERASER_MAX_IMAGE_BYTES + 256 * 1024) {
    return NextResponse.json({ error: 'Image is too large. Please use an image up to 10 MB.' }, { status: 413, headers: NO_STORE_HEADERS })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Could not read the image upload. Please try again.' }, { status: 400, headers: NO_STORE_HEADERS })
  }

  const image = formData.get('image')
  if (!(image instanceof File)) {
    return NextResponse.json({ error: 'Please attach an image using the image field.' }, { status: 400, headers: NO_STORE_HEADERS })
  }

  try {
    const prepared = await prepareObjectEraserImage(image)
    const provider = getRoboflowConfiguration()

    // Part 2 establishes the authenticated, validated image hand-off and
    // server-only provider configuration. Actual detection is wired in Part 3.
    // The base64 image is intentionally kept server-side and is not echoed.
    return NextResponse.json({
      ok: true,
      image: {
        mimeType: prepared.mimeType,
        size: prepared.size,
        sha256: prepared.sha256,
      },
      provider: {
        name: provider.provider,
        configured: provider.configured,
      },
      readyForDetection: provider.configured,
      nextStage: 'grounding-dino-detection',
    }, { headers: NO_STORE_HEADERS })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Image validation failed.'
    const status = /too large/i.test(message) ? 413 : 400
    return NextResponse.json({ error: message }, { status, headers: NO_STORE_HEADERS })
  }
}
