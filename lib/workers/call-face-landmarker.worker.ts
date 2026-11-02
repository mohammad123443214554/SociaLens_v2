import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task'

type RequestMessage =
  | { type: 'init' }
  | { type: 'frame'; bitmap: ImageBitmap; timestamp: number }
  | { type: 'dispose' }

type WorkerScope = {
  addEventListener(type: 'message', listener: (event: MessageEvent<RequestMessage>) => void): void
  postMessage(message: unknown, transfer?: Transferable[]): void
}

const scope = self as unknown as WorkerScope
let landmarker: FaceLandmarker | null = null
let initializing = false
let disposed = false

async function initialize() {
  if (initializing || landmarker || disposed) return
  initializing = true
  try {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL)
    const options = {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' as const },
      runningMode: 'VIDEO' as const,
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    }
    try {
      landmarker = await FaceLandmarker.createFromOptions(vision, options)
    } catch (gpuError) {
      console.warn('[Call AR] Face landmark GPU delegate unavailable; retrying with CPU.', gpuError)
      landmarker = await FaceLandmarker.createFromOptions(vision, {
        ...options,
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' as const },
      })
    }
    if (!disposed) scope.postMessage({ type: 'ready' })
    else { landmarker.close(); landmarker = null }
  } catch (error) {
    scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Face tracking could not start.' })
  } finally {
    initializing = false
  }
}

scope.addEventListener('message', (event) => {
  const message = event.data
  if (message.type === 'init') { void initialize(); return }
  if (message.type === 'dispose') {
    disposed = true
    landmarker?.close()
    landmarker = null
    return
  }
  if (message.type === 'frame') {
    const bitmap = message.bitmap
    if (!landmarker || disposed) { bitmap.close(); return }
    try {
      const result = landmarker.detectForVideo(bitmap, message.timestamp)
      const face = result.faceLandmarks[0]
      if (!face) {
        scope.postMessage({ type: 'landmarks', timestamp: message.timestamp, points: null })
      } else {
        const points = new Float32Array(face.length * 2)
        face.forEach((point, index) => {
          points[index * 2] = point.x
          points[index * 2 + 1] = point.y
        })
        scope.postMessage({ type: 'landmarks', timestamp: message.timestamp, points: points.buffer }, [points.buffer])
      }
    } catch (error) {
      scope.postMessage({ type: 'frame-error', message: error instanceof Error ? error.message : 'Face tracking skipped a frame.' })
    } finally {
      bitmap.close()
    }
  }
})
