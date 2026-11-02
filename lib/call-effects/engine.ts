'use client'

import type { CallEffectFrame, CallEffectStage, CallEffectsEngineOptions, CallEffectsEngineSnapshot } from './types'
import { getCallEffectsRenderProfile } from './capabilities'

type VideoFrameElement = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (now: number) => void) => number
  cancelVideoFrameCallback?: (handle: number) => void
}

/**
 * Reusable local frame pipeline for Agora, Daily and future live streaming.
 * The caller supplies an already-authorized camera track and owns its lifetime.
 * No camera permission is requested and the source track is never stopped here.
 */
export class CallVideoEffectsEngine {
  readonly processedTrack: MediaStreamTrack
  private readonly sourceTrack: MediaStreamTrack
  private readonly video: VideoFrameElement
  private readonly canvas: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D
  private outputStream: MediaStream | null = null
  private readonly stages = new Map<string, CallEffectStage>()
  private readonly options: CallEffectsEngineOptions
  private readonly targetFrameInterval: number
  private rafHandle: number | null = null
  private videoFrameHandle: number | null = null
  private lastFrameAt = 0
  private lastRenderAt = 0
  private frameCount = 0
  private stopped = false
  private running = false

  private constructor(sourceTrack: MediaStreamTrack, options: CallEffectsEngineOptions) {
    this.sourceTrack = sourceTrack
    this.options = options
    this.video = document.createElement('video') as VideoFrameElement
    this.video.autoplay = true
    this.video.muted = true
    this.video.playsInline = true
    this.video.srcObject = new MediaStream([sourceTrack])
    this.canvas = document.createElement('canvas')
    const context = this.canvas.getContext('2d', { alpha: false, desynchronized: true })
    if (!context) throw new Error('This device does not support the camera effects renderer.')
    this.context = context
    const profile = getCallEffectsRenderProfile()
    const fps = Math.max(15, Math.min(30, options.frameRate ?? profile.frameRate))
    this.targetFrameInterval = 1000 / fps
    // Assigned after camera metadata determines the output dimensions.
    this.processedTrack = null as unknown as MediaStreamTrack
  }

  static async create(sourceTrack: MediaStreamTrack, options: CallEffectsEngineOptions = {}) {
    if (typeof window === 'undefined') throw new Error('Camera effects require a browser.')
    if (!sourceTrack || sourceTrack.kind !== 'video' || sourceTrack.readyState !== 'live') {
      throw new Error('A live camera video track is required.')
    }
    if (typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
      throw new Error('This browser does not support processed live video.')
    }
    const engine = new CallVideoEffectsEngine(sourceTrack, options)
    try {
      await engine.initialize()
      return engine
    } catch (error) {
      engine.stop()
      throw error
    }
  }

  private async initialize() {
    if (this.video.readyState < HTMLMediaElement.HAVE_METADATA) {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          cleanup()
          reject(new Error('Timed out while preparing the camera effects video.'))
        }, 10000)
        const cleanup = () => {
          window.clearTimeout(timeout)
          this.video.removeEventListener('loadedmetadata', onReady)
          this.video.removeEventListener('error', onError)
        }
        const onReady = () => { cleanup(); resolve() }
        const onError = () => { cleanup(); reject(new Error('Could not read the camera video.')) }
        this.video.addEventListener('loadedmetadata', onReady, { once: true })
        this.video.addEventListener('error', onError, { once: true })
      })
    }
    await this.video.play()
    const sourceWidth = this.video.videoWidth
    const sourceHeight = this.video.videoHeight
    if (!sourceWidth || !sourceHeight) throw new Error('The camera has not produced a usable video frame.')
    const profile = getCallEffectsRenderProfile()
    const maxWidth = Math.max(320, this.options.maxWidth ?? profile.maxWidth)
    const scale = Math.min(1, maxWidth / sourceWidth)
    this.canvas.width = Math.max(2, Math.round(sourceWidth * scale))
    this.canvas.height = Math.max(2, Math.round(sourceHeight * scale))
    const stream = this.canvas.captureStream(1000 / this.targetFrameInterval)
    const track = stream.getVideoTracks()[0]
    if (!track) {
      stream.getTracks().forEach((item) => item.stop())
      throw new Error('Could not create the processed camera track.')
    }
    this.outputStream = stream
    ;(this as { processedTrack: MediaStreamTrack }).processedTrack = track
    this.running = true
    this.scheduleNextFrame()
  }

  addStage(stage: CallEffectStage) {
    if (this.stopped) throw new Error('The camera effects engine has been stopped.')
    if (!stage.id.trim()) throw new Error('Every effect stage must have a stable id.')
    const previous = this.stages.get(stage.id)
    if (previous && previous !== stage) {
      try { previous.dispose?.() } catch (error) { this.options.onStageError?.(stage.id, error) }
    }
    this.stages.set(stage.id, stage)
  }

  removeStage(id: string) {
    const stage = this.stages.get(id)
    if (!stage) return
    this.stages.delete(id)
    try { stage.dispose?.() } catch (error) { this.options.onStageError?.(id, error) }
  }

  clearStages() {
    for (const id of [...this.stages.keys()]) this.removeStage(id)
  }

  getSnapshot(): CallEffectsEngineSnapshot {
    const elapsed = this.lastFrameAt > 0 ? Math.max(1, performance.now() - this.lastFrameAt) : 1
    return {
      running: this.running && !this.stopped,
      width: this.canvas.width,
      height: this.canvas.height,
      frameRate: this.frameCount > 1 ? Math.round(1000 / elapsed) : 0,
      activeStageIds: [...this.stages.keys()],
    }
  }

  private scheduleNextFrame() {
    if (this.stopped || !this.running) return
    if (this.video.requestVideoFrameCallback) {
      this.videoFrameHandle = this.video.requestVideoFrameCallback((now) => {
        this.videoFrameHandle = null
        this.renderFrame(now)
        this.scheduleNextFrame()
      })
    } else {
      this.rafHandle = window.requestAnimationFrame((now) => {
        this.rafHandle = null
        this.renderFrame(now)
        this.scheduleNextFrame()
      })
    }
  }

  private renderFrame(now: number) {
    if (this.stopped || this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
    if (now - this.lastRenderAt < this.targetFrameInterval) return
    const width = this.canvas.width
    const height = this.canvas.height
    if (!width || !height) return
    const deltaMs = this.lastFrameAt > 0 ? Math.min(250, now - this.lastFrameAt) : this.targetFrameInterval
    this.lastFrameAt = now
    this.lastRenderAt = now
    this.frameCount += 1

    this.context.save()
    this.context.setTransform(1, 0, 0, 1, 0, 0)
    this.context.globalAlpha = 1
    this.context.globalCompositeOperation = 'source-over'
    this.context.filter = 'none'
    this.context.clearRect(0, 0, width, height)
    this.context.drawImage(this.video, 0, 0, width, height)
    this.context.restore()

    const frame: CallEffectFrame = {
      video: this.video,
      canvas: this.canvas,
      context: this.context,
      timestamp: now,
      deltaMs,
      width,
      height,
    }
    const stages = [...this.stages.values()].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))
    for (const stage of stages) {
      if (!this.stages.has(stage.id)) continue
      try {
        stage.render(frame)
      } catch (error) {
        this.removeStage(stage.id)
        this.options.onStageError?.(stage.id, error)
      }
    }
  }

  /** Stops the generated output only; the source camera track remains caller-owned. */
  stop() {
    if (this.stopped) return
    this.stopped = true
    this.running = false
    if (this.rafHandle !== null) window.cancelAnimationFrame(this.rafHandle)
    if (this.videoFrameHandle !== null) this.video.cancelVideoFrameCallback?.(this.videoFrameHandle)
    this.rafHandle = null
    this.videoFrameHandle = null
    this.clearStages()
    this.outputStream?.getTracks().forEach((track) => track.stop())
    this.video.pause()
    this.video.srcObject = null
  }
}
