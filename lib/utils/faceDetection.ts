'use client'

// face-api.js runs entirely in the browser via TensorFlow.js - no server
// involved, matching how this whole admin system has to work without a
// dedicated backend. Model weights are pulled from the project's own
// published weights on jsDelivr (a stable, versioned CDN mirror of the
// face-api.js GitHub repo) the first time this is used, then cached by
// The browser.
const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js/weights'

let modelsLoadedPromise: Promise<void> | null = null

async function ensureModelsLoaded() {
  if (!modelsLoadedPromise) {
    modelsLoadedPromise = (async () => {
      const faceapi = await import('face-api.js')
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL)
    })()
  }
  return modelsLoadedPromise
}

export interface FaceCheckResult {
  ok: boolean
  reason?: 'no_face' | 'multiple_faces' | 'low_confidence' | 'load_failed'
}

// A face is "clear" here if the tiny detector finds exactly one face with
// reasonably high confidence - a good proxy for "not blurry, not a random
// object, not a crowd photo" without needing a dedicated blur-detection
// model on top.
const CONFIDENCE_THRESHOLD = 0.6

export async function checkPhotoHasClearFace(imageElement: HTMLImageElement): Promise<FaceCheckResult> {
  try {
    const faceapi = await import('face-api.js')
    await ensureModelsLoaded()

    const detections = await faceapi.detectAllFaces(
      imageElement,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 })
    )

    if (detections.length === 0) return { ok: false, reason: 'no_face' }
    if (detections.length > 1) return { ok: false, reason: 'multiple_faces' }
    if (detections[0].score < CONFIDENCE_THRESHOLD) return { ok: false, reason: 'low_confidence' }
    return { ok: true }
  } catch (err) {
    console.error('[SociaLens] face check failed to load/run', err)
    return { ok: false, reason: 'load_failed' }
  }
}

export function faceCheckMessage(reason: FaceCheckResult['reason']): string {
  switch (reason) {
    case 'no_face': return "We couldn't find a clear face in that photo. Please try again with better lighting and your face fully visible."
    case 'multiple_faces': return 'This photo has more than one face in it. Please upload a photo of just yourself.'
    case 'low_confidence': return "That photo doesn't look clear enough. Try a sharper, well-lit photo facing the camera."
    case 'load_failed':
    default:
      return "We couldn't check that photo right now. Please try again in a moment."
  }
}
