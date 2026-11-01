'use client'

const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite'

type WorkerMessage =
  | { type: 'ready'; delegate: 'GPU' | 'CPU' }
  | { type: 'mask'; width: number; height: number; mask: ArrayBuffer }
  | { type: 'error'; message: string }

export class CallBackgroundBlurProcessor {
  readonly processedTrack: MediaStreamTrack
  private readonly worker: Worker
  private readonly video: HTMLVideoElement
  private readonly canvas: HTMLCanvasElement
  private readonly outputStream: MediaStream
  private readonly maskCanvas: HTMLCanvasElement
  private readonly personCanvas: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D
  private readonly maskContext: CanvasRenderingContext2D
  private readonly personContext: CanvasRenderingContext2D
  private animationFrame = 0
  private intensity: number
  private stopped = false
  private inferencePending = false
  private lastInferenceAt = 0
  private lastVideoTime = -1
  private maskValues: Float32Array | null = null

  private constructor(sourceTrack: MediaStreamTrack, intensity: number) {
    this.intensity = intensity
    this.video = document.createElement('video')
    this.video.autoplay = true
    this.video.muted = true
    this.video.playsInline = true
    this.video.srcObject = new MediaStream([sourceTrack])
    this.canvas = document.createElement('canvas')
    this.maskCanvas = document.createElement('canvas')
    this.personCanvas = document.createElement('canvas')

    const context = this.canvas.getContext('2d', { alpha: false })
    const maskContext = this.maskCanvas.getContext('2d')
    const personContext = this.personCanvas.getContext('2d')
    if (!context || !maskContext || !personContext) throw new Error('Your device does not support the video effects renderer.')
    this.context = context
    this.maskContext = maskContext
    this.personContext = personContext
    this.worker = new Worker(new URL('../workers/call-background-blur.worker.ts', import.meta.url), { type: 'module' })

    const stream = this.canvas.captureStream(30)
    const track = stream.getVideoTracks()[0]
    if (!track) {
      this.worker.terminate()
      throw new Error('Your browser could not create a processed video track.')
    }
    this.outputStream = stream
    this.processedTrack = track
  }

  static async create(sourceTrack: MediaStreamTrack, intensity: number) {
    if (typeof Worker === 'undefined' || typeof createImageBitmap === 'undefined') {
      throw new Error('Background Blur is not supported by this browser. Please update your browser or use another device.')
    }
    if (typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
      throw new Error('This browser does not support live video effects.')
    }
    const processor = new CallBackgroundBlurProcessor(sourceTrack, intensity)
    try {
      await processor.initialize()
      return processor
    } catch (error) {
      processor.stop()
      throw error
    }
  }

  private async initialize() {
    const metadataReady = this.video.readyState >= HTMLMediaElement.HAVE_METADATA
      ? Promise.resolve()
      : new Promise<void>((resolve, reject) => {
          this.video.onloadedmetadata = () => resolve()
          this.video.onerror = () => reject(new Error('Could not read the camera video for Background Blur.'))
        })
    await this.video.play()
    await metadataReady

    const sourceWidth = this.video.videoWidth || 640
    const sourceHeight = this.video.videoHeight || 360
    const scale = Math.min(1, 1280 / sourceWidth)
    const width = Math.max(320, Math.round(sourceWidth * scale))
    const height = Math.max(240, Math.round(sourceHeight * scale))
    this.canvas.width = width
    this.canvas.height = height
    this.personCanvas.width = width
    this.personCanvas.height = height

    await new Promise<void>((resolve, reject) => {
      const onMessage = (event: MessageEvent<WorkerMessage>) => {
        if (event.data.type === 'ready') {
          this.worker.removeEventListener('message', onMessage)
          this.worker.removeEventListener('error', onError)
          resolve()
        } else if (event.data.type === 'error') {
          this.worker.removeEventListener('message', onMessage)
          this.worker.removeEventListener('error', onError)
          reject(new Error(event.data.message))
        }
      }
      const onError = () => {
        this.worker.removeEventListener('message', onMessage)
        this.worker.removeEventListener('error', onError)
        reject(new Error('The on-device AI model could not be started.'))
      }
      this.worker.addEventListener('message', onMessage)
      this.worker.addEventListener('error', onError, { once: true })
      this.worker.postMessage({ type: 'init' })
    })

    this.worker.addEventListener('message', this.handleWorkerMessage)
    this.renderFrame()
  }

  private handleWorkerMessage = (event: MessageEvent<WorkerMessage>) => {
    const message = event.data
    if (message.type === 'mask') {
      this.inferencePending = false
      const incoming = new Float32Array(message.mask)
      if (this.maskValues && this.maskValues.length === incoming.length) {
        for (let index = 0; index < incoming.length; index += 1) {
          this.maskValues[index] = this.maskValues[index] * 0.55 + incoming[index] * 0.45
        }
      } else {
        this.maskValues = incoming
      }
      this.maskCanvas.width = message.width
      this.maskCanvas.height = message.height
      const image = this.maskContext.createImageData(message.width, message.height)
      for (let index = 0; index < incoming.length; index += 1) {
        const value = Math.min(1, Math.max(0, (this.maskValues[index] - 0.22) / 0.48))
        const alpha = Math.round(value * value * (3 - 2 * value) * 255)
        const pixel = index * 4
        image.data[pixel] = 255
        image.data[pixel + 1] = 255
        image.data[pixel + 2] = 255
        image.data[pixel + 3] = alpha
      }
      this.maskContext.putImageData(image, 0, 0)
    } else if (message.type === 'error') {
      this.inferencePending = false
      console.warn('[Call effects] MediaPipe frame skipped:', message.message)
    }
  }

  private renderFrame = (now = performance.now()) => {
    if (this.stopped) return
    if (this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && this.video.videoWidth > 0) {
      if (!this.inferencePending && now - this.lastInferenceAt >= 85 && this.video.currentTime !== this.lastVideoTime) {
        this.inferencePending = true
        this.lastInferenceAt = now
        this.lastVideoTime = this.video.currentTime
        void createImageBitmap(this.video).then((bitmap) => {
          if (this.stopped) {
            bitmap.close()
            this.inferencePending = false
            return
          }
          this.worker.postMessage({ type: 'frame', bitmap, timestamp: now }, [bitmap])
        }).catch((error) => {
          this.inferencePending = false
          console.warn('[Call effects] Could not prepare a camera frame for segmentation:', error)
        })
      }

      const width = this.canvas.width
      const height = this.canvas.height
      const blurPixels = 2 + this.intensity * 0.26
      this.context.save()
      this.context.clearRect(0, 0, width, height)
      this.context.filter = `blur(${blurPixels}px)`
      this.context.drawImage(this.video, 0, 0, width, height)
      this.context.restore()

      if (this.maskValues) {
        this.personContext.save()
        this.personContext.clearRect(0, 0, width, height)
        this.personContext.globalCompositeOperation = 'source-over'
        this.personContext.filter = 'none'
        this.personContext.drawImage(this.video, 0, 0, width, height)
        this.personContext.globalCompositeOperation = 'destination-in'
        this.personContext.filter = 'blur(1.2px)'
        this.personContext.drawImage(this.maskCanvas, 0, 0, width, height)
        this.personContext.restore()
        this.context.drawImage(this.personCanvas, 0, 0, width, height)
      }
    }
    this.animationFrame = requestAnimationFrame(this.renderFrame)
  }

  setIntensity(intensity: number) {
    this.intensity = Math.max(0, Math.min(100, Math.round(intensity)))
  }

  stop() {
    if (this.stopped) return
    this.stopped = true
    cancelAnimationFrame(this.animationFrame)
    try { this.worker.postMessage({ type: 'dispose' }) } catch {}
    this.worker.terminate()
    this.outputStream.getTracks().forEach((track) => track.stop())
    this.video.pause()
    this.video.srcObject = null
  }
}
