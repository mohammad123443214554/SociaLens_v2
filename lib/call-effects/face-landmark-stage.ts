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
  private workerReady = false
  private workerFailed = false
  private disposed = false
  private intensity: number
  private errorReported = false

  constructor({ preset, intensity = preset.defaultIntensity, onError }: FaceLandmarkStageOptions) {
    this.id = `face-preset:${preset.id}`
    this.preset = preset
    this.intensity = clamp(intensity, 0, 100)
    this.onError = onError
    if (typeof Worker === 'undefined' || typeof createImageBitmap === 'undefined') {
      throw new Error('Live face filters are not supported by this browser version.')
    }
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
    if (message.type === 'ready') {
      this.workerReady = true
    } else if (message.type === 'landmarks') {
      this.inferencePending = false
      this.snapshot = { points: message.points ? new Float32Array(message.points) : null, receivedAt: performance.now() }
    } else if (message.type === 'error') {
      this.inferencePending = false
      this.workerFailed = true
      this.reportError(new Error(message.message))
    } else if (message.type === 'frame-error') {
      this.inferencePending = false
      if (!this.errorReported) console.warn('[Call AR] Face landmark frame skipped:', message.message)
    }
  }

  private handleWorkerError = () => {
    this.inferencePending = false
    this.workerFailed = true
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
    if (this.workerReady && !this.workerFailed && !this.inferencePending && now - this.lastInferenceAt >= 90) {
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

    if (this.preset.categoryId === 'makeup') this.drawMakeupLook(context, points, width, height, amount)
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

  /**
   * Makeup is painted from the same live face mesh used by the other presets.
   * Each look combines tracked lip/eye/cheek regions rather than using a
   * screen-wide colour wash, so the effect follows head movement.
   */
  private drawMakeupLook(context: CanvasRenderingContext2D, points: Float32Array, width: number, height: number, amount: number) {
    const id = this.preset.id
    const looks: Record<string, { cheek: string; lip: string; shadow: string; liner: string; cheekAlpha: number; lipAlpha: number; eyeAlpha: number; linerWidth: number; highlight: boolean; gradientLip?: boolean }> = {
      'soft-pink': { cheek: '#f18da9', lip: '#dc718f', shadow: '#d98ca7', liner: '#65434f', cheekAlpha: 0.34, lipAlpha: 0.42, eyeAlpha: 0.14, linerWidth: 0.65, highlight: true },
      'rose-makeup': { cheek: '#d96f89', lip: '#a83e5d', shadow: '#a85d78', liner: '#49303e', cheekAlpha: 0.38, lipAlpha: 0.64, eyeAlpha: 0.25, linerWidth: 1.05, highlight: true },
      'peach-makeup': { cheek: '#f2a477', lip: '#df866b', shadow: '#d89b83', liner: '#705044', cheekAlpha: 0.35, lipAlpha: 0.48, eyeAlpha: 0.15, linerWidth: 0.7, highlight: true },
      'korean-makeup': { cheek: '#f28e9e', lip: '#e45c70', shadow: '#c88d9b', liner: '#634a53', cheekAlpha: 0.3, lipAlpha: 0.55, eyeAlpha: 0.12, linerWidth: 0.55, highlight: true, gradientLip: true },
      'glam-look': { cheek: '#c87580', lip: '#9c294c', shadow: '#80516f', liner: '#211b2b', cheekAlpha: 0.43, lipAlpha: 0.78, eyeAlpha: 0.4, linerWidth: 1.8, highlight: true },
      'nude-makeup': { cheek: '#c58e79', lip: '#b8796f', shadow: '#a9877c', liner: '#51413c', cheekAlpha: 0.2, lipAlpha: 0.35, eyeAlpha: 0.12, linerWidth: 0.85, highlight: false },
    }
    const look = looks[id]
    if (!look) return
    this.drawMakeupShadow(context, points, width, height, look.shadow, amount * look.eyeAlpha)
    this.drawMakeupLiner(context, points, width, height, look.liner, amount * look.linerWidth)
    this.drawMakeupLashes(context, points, width, height, amount, id === 'glam-look')
    this.drawMakeupCheeks(context, points, width, height, look.cheek, amount * look.cheekAlpha)
    this.drawMakeupLips(context, points, width, height, look.lip, amount * look.lipAlpha, Boolean(look.gradientLip))
    if (look.highlight) this.drawMakeupHighlight(context, points, width, height, amount, id === 'korean-makeup')
    if (id === 'glam-look') this.drawMakeupContour(context, points, width, height, amount)
  }

  private drawMakeupShadow(context: CanvasRenderingContext2D, points: Float32Array, width: number, height: number, color: string, amount: number) {
    if (amount <= 0) return
    context.save()
    context.globalCompositeOperation = 'multiply'
    for (const [contour, centerIndex] of [[LEFT_EYE, 159], [RIGHT_EYE, 386]] as const) {
      const center = getPoint(points, centerIndex, width, height)
      const eye = polygonPath(points, contour, width, height)
      if (!center || !eye) continue
      const radius = Math.max(9, width * 0.035)
      const gradient = context.createRadialGradient(center.x, center.y - radius * 0.22, 1, center.x, center.y, radius)
      gradient.addColorStop(0, colorWithAlpha(color, 0.24 * amount))
      gradient.addColorStop(1, colorWithAlpha(color, 0))
      context.fillStyle = gradient
      context.globalAlpha = 0.92
      context.fillRect(center.x - radius, center.y - radius, radius * 2, radius * 1.55)
      context.globalCompositeOperation = 'source-over'
      context.globalAlpha = 0.1 * amount
      context.fill(eye)
      context.globalCompositeOperation = 'multiply'
    }
    context.restore()
  }

  private drawMakeupLiner(context: CanvasRenderingContext2D, points: Float32Array, width: number, height: number, color: string, amount: number) {
    if (amount <= 0) return
    context.save()
    context.strokeStyle = color
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.globalAlpha = Math.min(0.82, 0.34 + amount * 0.2)
    context.lineWidth = Math.max(0.7, width * 0.00115 * amount)
    for (const indices of [[33, 160, 158, 133], [362, 385, 387, 263]]) {
      const path = openLandmarkPath(points, indices, width, height)
      if (path) context.stroke(path)
    }
    // Small outward wings, anchored to the outer eye corners.
    for (const [cornerIndex, adjacentIndex, direction] of [[33, 133, -1], [263, 362, 1]] as const) {
      const corner = getPoint(points, cornerIndex, width, height)
      const adjacent = getPoint(points, adjacentIndex, width, height)
      if (!corner || !adjacent) continue
      const dx = (corner.x - adjacent.x) * 0.32
      const dy = (corner.y - adjacent.y) * 0.2 - width * 0.002 * amount
      context.beginPath()
      context.moveTo(corner.x, corner.y)
      context.quadraticCurveTo(corner.x + dx * 0.55 + direction * width * 0.002, corner.y + dy * 0.4, corner.x + dx + direction * width * 0.003, corner.y + dy)
      context.stroke()
    }
    context.restore()
  }

  private drawMakeupLashes(context: CanvasRenderingContext2D, points: Float32Array, width: number, height: number, amount: number, dramatic: boolean) {
    if (amount <= 0.05) return
    context.save()
    context.strokeStyle = '#241b24'
    context.lineCap = 'round'
    context.lineWidth = Math.max(0.55, width * (dramatic ? 0.00105 : 0.00055))
    context.globalAlpha = (dramatic ? 0.5 : 0.22) * amount
    for (const [a, b] of [[33, 160], [160, 158], [158, 133], [362, 385], [385, 387], [387, 263]]) {
      const start = getPoint(points, a, width, height)
      const end = getPoint(points, b, width, height)
      if (!start || !end) continue
      const count = dramatic ? 3 : 2
      for (let i = 1; i <= count; i++) {
        const t = i / (count + 1)
        const x = start.x + (end.x - start.x) * t
        const y = start.y + (end.y - start.y) * t
        const lift = width * (dramatic ? 0.006 : 0.0035) * amount
        context.beginPath()
        context.moveTo(x, y)
        context.quadraticCurveTo(x + (end.x - start.x) * 0.035, y - lift * 0.55, x + (end.x - start.x) * 0.07, y - lift)
        context.stroke()
      }
    }
    context.restore()
  }

  private drawMakeupCheeks(context: CanvasRenderingContext2D, points: Float32Array, width: number, height: number, color: string, amount: number) {
    if (amount <= 0) return
    context.save()
    context.globalCompositeOperation = 'soft-light'
    for (const index of [CHEEK_LEFT, CHEEK_RIGHT]) {
      const point = getPoint(points, index, width, height)
      if (!point) continue
      const radiusX = Math.max(13, width * 0.072)
      const radiusY = radiusX * 0.58
      const gradient = context.createRadialGradient(point.x, point.y, 1, point.x, point.y, radiusX)
      gradient.addColorStop(0, colorWithAlpha(color, 0.55 * amount))
      gradient.addColorStop(0.62, colorWithAlpha(color, 0.2 * amount))
      gradient.addColorStop(1, colorWithAlpha(color, 0))
      context.fillStyle = gradient
      context.beginPath()
      context.ellipse(point.x, point.y, radiusX, radiusY, 0, 0, Math.PI * 2)
      context.fill()
    }
    context.restore()
  }

  private drawMakeupLips(context: CanvasRenderingContext2D, points: Float32Array, width: number, height: number, color: string, amount: number, gradientLip: boolean) {
    const outer = polygonPath(points, OUTER_LIPS, width, height)
    if (!outer) return
    context.save()
    context.globalCompositeOperation = 'multiply'
    context.globalAlpha = Math.min(0.78, 0.22 + amount * 0.48)
    context.fillStyle = color
    context.fill(outer)
    if (gradientLip) {
      const center = getPoint(points, 13, width, height)
      if (center) {
        const radius = Math.max(3, width * 0.025)
        const gradient = context.createRadialGradient(center.x, center.y, 0, center.x, center.y, radius)
        gradient.addColorStop(0, colorWithAlpha('#8f243d', 0.44 * amount))
        gradient.addColorStop(1, colorWithAlpha('#8f243d', 0))
        context.globalCompositeOperation = 'source-atop'
        context.fillStyle = gradient
        context.fillRect(center.x - radius, center.y - radius, radius * 2, radius * 2)
      }
    }
    context.restore()
  }

  private drawMakeupHighlight(context: CanvasRenderingContext2D, points: Float32Array, width: number, height: number, amount: number, aegyo: boolean) {
    context.save()
    context.globalCompositeOperation = 'screen'
    context.globalAlpha = (aegyo ? 0.2 : 0.15) * amount
    for (const index of aegyo ? [111, 340, 4] : [4, 195, 425]) {
      const point = getPoint(points, index, width, height)
      if (!point) continue
      const radius = Math.max(5, width * 0.025)
      const gradient = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius)
      gradient.addColorStop(0, 'rgba(255,239,222,0.48)')
      gradient.addColorStop(1, 'rgba(255,239,222,0)')
      context.fillStyle = gradient
      context.beginPath()
      context.ellipse(point.x, point.y, radius, radius * 0.48, 0, 0, Math.PI * 2)
      context.fill()
    }
    context.restore()
  }

  private drawMakeupContour(context: CanvasRenderingContext2D, points: Float32Array, width: number, height: number, amount: number) {
    context.save()
    context.globalCompositeOperation = 'multiply'
    context.globalAlpha = 0.1 * amount
    for (const index of [234, 454]) {
      const point = getPoint(points, index, width, height)
      if (!point) continue
      const radius = Math.max(15, width * 0.05)
      const gradient = context.createRadialGradient(point.x, point.y, 1, point.x, point.y, radius)
      gradient.addColorStop(0, 'rgba(100,61,55,0.42)')
      gradient.addColorStop(1, 'rgba(100,61,55,0)')
      context.fillStyle = gradient
      context.beginPath()
      context.arc(point.x, point.y, radius, 0, Math.PI * 2)
      context.fill()
    }
    context.restore()
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

function colorWithAlpha(color: string, alpha: number) {
  const hex = color.replace('#', '')
  const normalized = hex.length === 3 ? hex.split('').map((part) => part + part).join('') : hex
  const value = Number.parseInt(normalized, 16)
  if (!Number.isFinite(value)) return `rgba(180,120,130,${alpha})`
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${Math.max(0, Math.min(1, alpha))})`
}

function openLandmarkPath(points: Float32Array, indices: number[], width: number, height: number) {
  const path = new Path2D()
  let started = false
  for (const index of indices) {
    const point = getPoint(points, index, width, height)
    if (!point) continue
    if (!started) { path.moveTo(point.x, point.y); started = true }
    else path.lineTo(point.x, point.y)
  }
  return started ? path : null
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
