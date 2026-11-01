import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision'

const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite'
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'

type WorkerRequest =
  | { type: 'init' }
  | { type: 'frame'; bitmap: ImageBitmap; timestamp: number }
  | { type: 'dispose' }

type WorkerScope = {
  addEventListener(type: 'message', listener: (event: MessageEvent<WorkerRequest>) => void): void
  postMessage(message: unknown, transfer?: Transferable[]): void
}
const workerScope = self as unknown as WorkerScope
let segmenter: ImageSegmenter | null = null
let disposed = false

async function initialize() {
  try {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL)
    const options = {
      runningMode: 'VIDEO' as const,
      outputCategoryMask: false,
      outputConfidenceMasks: true,
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' as const },
    }
    try {
      segmenter = await ImageSegmenter.createFromOptions(vision, options)
      workerScope.postMessage({ type: 'ready', delegate: 'GPU' })
    } catch (gpuError) {
      console.warn('[Call effects] GPU delegate unavailable; using CPU', gpuError)
      segmenter = await ImageSegmenter.createFromOptions(vision, {
        ...options,
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' as const },
      })
      workerScope.postMessage({ type: 'ready', delegate: 'CPU' })
    }
  } catch (error) {
    workerScope.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Could not load the MediaPipe model.',
    })
  }
}

workerScope.addEventListener('message', (event) => {
  const message = event.data
  if (message.type === 'init') {
    void initialize()
    return
  }
  if (message.type === 'dispose') {
    disposed = true
    segmenter?.close()
    segmenter = null
    return
  }
  if (message.type === 'frame' && segmenter && !disposed) {
    const bitmap = message.bitmap
    try {
      const result = segmenter.segmentForVideo(bitmap, message.timestamp)
      const personMask = result.confidenceMasks?.[1] ?? result.confidenceMasks?.[0]
      if (!personMask) throw new Error('The segmentation model did not return a person mask.')
      const values = new Float32Array(personMask.getAsFloat32Array())
      workerScope.postMessage({
        type: 'mask',
        width: personMask.width,
        height: personMask.height,
        mask: values.buffer,
      }, [values.buffer])
    } catch (error) {
      workerScope.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : 'A video frame could not be segmented.',
      })
    } finally {
      bitmap.close()
    }
  }
})
