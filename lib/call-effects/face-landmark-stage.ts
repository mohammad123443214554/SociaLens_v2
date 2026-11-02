'use client'

import type { CallEffectFrame, CallEffectStage } from './types'
import type { CallEffectDefinition } from './types'

const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
const LEFT_EYE = [33, 160, 158, 133, 153, 144]
const RIGHT_EYE = [362, 385, 387, 263, 373, 380]
const OUTER_LIPS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78]
const INNER_LIPS = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95]
const CHEEK_LEFT = 205
const CHEEK_RIGHT = 425
const IRIS_LEFT = 468
const IRIS_RIGHT = 473

type LandmarkSnapshot = { points: Float32Array | null; receivedAt: number }
type WorkerResponse =
  | { type: 'ready' }
  | { type: 'landmarks'; points: ArrayBuffer | null; timestamp: number }
  | { type: 'frame-error'; message: string }
  | { type: 'error'; message: string }

export interface FaceLandmarkStageOptions {
  preset: CallEffectDefinition
  intensity?: number
  onError?: (error: Error) => void
}

/**
 * Runs MediaPipe FaceLandmarker in a worker and paints the selected preset
 * over the outgoing camera canvas. Inference is throttled independently from
 * the video render loop so the call remains responsive on mid-range phones.
 */
export class FaceLandmarkEffectStage implements CallEffectStage {
  readonly id: string
  readonly priority = 30
  private readonly worker: Worker
  private readonly preset: CallEffectDefinition
  private readonly onError?: (error: Error) => void
  private readonly scratch = document.createElement('canvas')
  private readonly scratchContext: CanvasRenderingContext2D
  private snapshot: LandmarkSnapshot = { points: null, receivedAt: 0 }
  private lastInferenceAt = 0
  private inferencePending = false
  private disposed = false
  private intensity: number
  private errorReported = false

  constructor({ preset, intensity = preset.defaultIntensity, onError }: FaceLandmarkStageOptions) {
    this.id = `face-preset:${preset.id}`
    this.preset = preset
    this.intensity = clamp(intensity, 0, 100)
    this.onError = onError
    const context = this.scratch.getContext('2d', { alpha: true })
    if (!context) throw new Error('This device cannot create the face-effects drawing surface.')
    this.scratchContext = context
    this.worker = new Worker(new URL('../workers/call-face-landmarker.worker.ts', import.meta.url), { type: 'module' })
    this.worker.addEventListener('message', this.handleWorkerMessage)
    this.worker.addEventListener('error', this.handleWorkerError)
    this.worker.postMessage({ type: 'init' })
  }

  setIntensity(value: number) { this.intensity = clamp(value, 0, 100) }

  private handleWorkerMessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data
    if (message.type === 'landmarks') {
      this.inferencePending = false
      this.snapshot = { points: message.points ? new Float32Array(message.points) : null, receivedAt: performance.now() }
    } else if (message.type === 'error') {
      this.inferencePending = false
      this.reportError(new Error(message.message))
    } else if (message.type === 'frame-error') {
      this.inferencePending = false
      if (!this.errorReported) console.warn('[Call AR] Face landmark frame skipped:', message.message)
    }
  }

  private handleWorkerError = () => {
    this.inferencePending = false
    this.reportError(new Error('The on-device face tracking worker stopped unexpectedly.'))
  }

  private reportError(error: Error) {
    if (this.errorReported) return
    this.errorReported = true
    this.onError?.(error)
  }

  render(frame: CallEffectFrame) {
    if (this.disposed) return
    const now = frame.timestamp
    if (!this.inferencePending && now - this.lastInferenceAt >= 90) {
      this.inferencePending = true
      this.lastInferenceAt = now
      void createImageBitmap(frame.video).then((bitmap) => {
        if (this.disposed) { bitmap.close(); this.inferencePending = false; return }
        this.worker.postMessage({ type: 'frame', bitmap, timestamp: Math.max(0, Math.round(now)) }, [bitmap])
      }).catch((error) => {
        this.inferencePending = false
        this.reportError(error instanceof Error ? error : new Error('Could not prepare a frame for face tracking.'))
      })
    }

    const points = this.snapshot.points
    // A stale face mesh must never be painted over a different camera scene.
    if (!points || performance.now() - this.snapshot.receivedAt > 450) return
    this.drawPreset(frame, points)
  }

  private drawPreset(frame: CallEffectFrame, points: Float32Array) {
    const { context, width, height, video } = frame
    const amount = this.intensity / 100
    if (amount <= 0) return

    if (this.preset.id === 'glass-skin' || this.preset.id === 'soft-beauty' || this.preset.id === 'smooth-portrait' || this.preset.id === 'portrait-polish') {
      this.drawSkinSoftening(frame, points, amount)
    }
    if (this.preset.id === 'natural-makeup' || this.preset.id === 'soft-blush') this.drawBlush(context, points, width, height, amount * (this.preset.id === 'natural-makeup' ? 0.48 : 0.72))
    if (this.preset.id === 'natural-makeup' || this.preset.id === 'lip-tint') this.drawLipTint(context, points, width, height, amount * (this.preset.id === 'natural-makeup' ? 0.32 : 0.72))
    if (this.preset.id === 'bright-eyes') this.drawEyeBrightness(context, points, width, height, amount)
    if (this.preset.id === 'eye-glow') this.drawEyeGlow(context, points, width, height, amount)
    if (this.preset.id === 'soft-contour') this.drawContour(context, points, width, height, amount)
    if (this.preset.id === 'portrait-polish') this.drawBlush(context, points, width, height, amount * 0.18)

    if (this.preset.id === 'natural-glow' || this.preset.id === 'fresh-face' || this.preset.id === 'portrait-polish') {
      const overlay = this.preset.id === 'fresh-face' ? 'rgba(255,238,220,0.055)' : 'rgba(255,218,178,0.07)'
      context.save()
      context.globalCompositeOperation = 'soft-light'
      context.fillStyle = overlay
      context.fillRect(0, 0, width, height)
      context.restore()
    }
    void video
  }

  private drawSkinSoftening(frame: CallEffectFrame, points: Float32Array, amount: number) {
    const { width, height, context, video } = frame
    const facePath = polygonPath(points, FACE_OVAL, width, height)
    if (!facePath) return
    // Keep the eye and mouth areas crisp instead of smoothing over facial details.
    const eyeLeftPath = polygonPath(points, LEFT_EYE, width, height)
    const eyeRightPath = polygonPath(points, RIGHT_EYE, width, height)
    const lipPath = polygonPath(points, OUTER_LIPS, width, height)
    if (eyeLeftPath) facePath.addPath(eyeLeftPath)
    if (eyeRightPath) facePath.addPath(eyeRightPath)
    if (lipPath) facePath.addPath(lipPath)
    this.scratch.width = width
    this.scratch.height = height
    const scratch = this.scratchContext
    scratch.save()
    scratch.clearRect(0, 0, width, height)
    scratch.filter = `blur(${(this.preset.id === 'smooth-portrait' ? 1.8 : 1.15) + amount * 1.4}px)`
    scratch.drawImage(video, 0, 0, width, height)
    scratch.restore()

    context.save()
    context.globalAlpha = amount * (this.preset.id === 'glass-skin' ? 0.23 : 0.17)
    context.clip(facePath, 'evenodd')
    context.drawImage(this.scratch, 0, 0)
    context.restore()
  }

  private drawBlush(context: CanvasRenderingContext2D, points: Float32Array, width: number, height: number, amount: number) {
    context.save()
    context.globalCompositeOperation = 'soft-light'
    for (const index of [CHEEK_LEFT, CHEEK_RIGHT]) {
      const point = getPoint(points, index, width, height)
      if (!point) continue
      const radius = Math.max(14, width * 0.075)
      const gradient = context.createRadialGradient(point.x, point.y, 1, point.x, point.y, radius)
      gradient.addColorStop(0, `rgba(239,105,132,${0.32 * amount})`)
      gradient.addColorStop(0.58, `rgba(242,126,148,${0.16 * amount})`)
      gradient.addColorStop(1, 'rgba(242,126,148,0)')
      context.fillStyle = gradient
      context.beginPath()
      context.arc(point.x, point.y, radius, 0, Math.PI * 2)
      context.fill()
    }
    context.restore()
  }

  private drawLipTint(context: CanvasRenderingContext2D, points: Float32Array, width: number, height: number, amount: number) {
    const path = polygonPath(points, OUTER_LIPS, width, height)
    if (!path) return
    context.save()
    context.globalCompositeOperation = 'multiply'
    context.globalAlpha = 0.26 * amount
    context.fillStyle = '#d96f83'
    context.fill(path)
    context.restore()
  }

  private drawEyeBrightness(context: CanvasRenderingContext2D, points: Float32Array, width: number, height: number, amount: number) {
    context.save()
    context.globalCompositeOperation = 'screen'
    context.globalAlpha = 0.18 * amount
    for (const contour of [LEFT_EYE, RIGHT_EYE]) {
      const path = polygonPath(points, contour, width, height)
      if (!path) continue
      context.fillStyle = '#e7f2ff'
      context.fill(path)
    }
    context.restore()
  }

  private drawEyeGlow(context: CanvasRenderingContext2D, points: Float32Array, width: number, height: number, amount: number) {
    context.save()
    context.globalCompositeOperation = 'screen'
    for (const index of [IRIS_LEFT, IRIS_RIGHT]) {
      const point = getPoint(points, index, width, height)
      if (!point) continue
      const radius = Math.max(5, width * 0.022)
      const gradient = context.createRadialGradient(point.x, point.y, 1, point.x, point.y, radius)
      gradient.addColorStop(0, `rgba(190,225,255,${0.24 * amount})`)
      gradient.addColorStop(1, 'rgba(190,225,255,0)')
      context.fillStyle = gradient
      context.beginPath()
      context.arc(point.x, point.y, radius, 0, Math.PI * 2)
      context.fill()
    }
    context.restore()
  }

  private drawContour(context: CanvasRenderingContext2D, points: Float32Array, width: number, height: number, amount: number) {
    context.save()
    context.globalCompositeOperation = 'multiply'
    context.globalAlpha = 0.16 * amount
    for (const index of [234, 454]) {
      const point = getPoint(points, index, width, height)
      if (!point) continue
      const radius = Math.max(18, width * 0.055)
      const gradient = context.createRadialGradient(point.x, point.y, 2, point.x, point.y, radius)
      gradient.addColorStop(0, 'rgba(111,75,70,0.55)')
      gradient.addColorStop(1, 'rgba(111,75,70,0)')
      context.fillStyle = gradient
      context.beginPath()
      context.arc(point.x, point.y, radius, 0, Math.PI * 2)
      context.fill()
    }
    context.restore()
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.worker.removeEventListener('message', this.handleWorkerMessage)
    this.worker.removeEventListener('error', this.handleWorkerError)
    try { this.worker.postMessage({ type: 'dispose' }) } catch {}
    this.worker.terminate()
    this.snapshot.points = null
    this.scratch.width = 0
    this.scratch.height = 0
  }
}

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, Math.round(value))) }

function getPoint(points: Float32Array, index: number, width: number, height: number) {
  const offset = index * 2
  if (offset + 1 >= points.length) return null
  const x = points[offset]
  const y = points[offset + 1]
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x: x * width, y: y * height }
}

function polygonPath(points: Float32Array, indices: number[], width: number, height: number) {
  const path = new Path2D()
  let started = false
  for (const index of indices) {
    const point = getPoint(points, index, width, height)
    if (!point) continue
    if (!started) { path.moveTo(point.x, point.y); started = true }
    else path.lineTo(point.x, point.y)
  }
  if (!started) return null
  path.closePath()
  return path
}
