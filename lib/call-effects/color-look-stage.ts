'use client'

import type { CallEffectDefinition, CallEffectFrame, CallEffectStage } from './types'

type LookStyle = {
  filter: string
  tint?: string
  tintMode?: GlobalCompositeOperation
  vignette?: number
  glow?: number
  blur?: number
  grain?: number
  highlight?: string
  shadow?: string
}

const LOOKS: Record<string, LookStyle> = {
  'golden-hour': { filter: 'saturate(1.13) contrast(1.04) sepia(0.12) brightness(1.055)', tint: 'rgba(255,166,75,0.15)', tintMode: 'soft-light', glow: 0.16, vignette: 0.08 },
  'warm-light': { filter: 'saturate(1.07) sepia(0.10) brightness(1.035)', tint: 'rgba(255,190,132,0.12)', tintMode: 'soft-light' },
  'cool-light': { filter: 'saturate(0.98) contrast(1.045) brightness(1.025)', tint: 'rgba(125,184,255,0.12)', tintMode: 'soft-light' },
  'dreamy-glow': { filter: 'saturate(1.08) brightness(1.045)', glow: 0.34, tint: 'rgba(255,231,222,0.10)', tintMode: 'screen' },
  'vintage-film': { filter: 'sepia(0.22) saturate(0.82) contrast(0.94) brightness(1.025)', tint: 'rgba(184,126,78,0.13)', tintMode: 'soft-light', vignette: 0.24, grain: 0.18 },
  cinematic: { filter: 'contrast(1.16) saturate(0.88) brightness(0.97)', tint: 'rgba(34,64,89,0.12)', tintMode: 'soft-light', vignette: 0.32, shadow: 'rgba(12,31,54,0.13)', highlight: 'rgba(255,190,132,0.07)' },
  'pastel-dream': { filter: 'saturate(0.92) contrast(0.88) brightness(1.075)', tint: 'rgba(255,211,226,0.13)', tintMode: 'screen', glow: 0.15 },
  lavender: { filter: 'saturate(0.96) contrast(0.96) brightness(1.025)', tint: 'rgba(174,145,232,0.20)', tintMode: 'soft-light', highlight: 'rgba(228,204,255,0.07)' },
  'milky-tone': { filter: 'saturate(0.78) contrast(0.82) brightness(1.10)', tint: 'rgba(255,239,218,0.14)', tintMode: 'screen' },
  'soft-focus': { filter: 'saturate(1.04) contrast(0.96) brightness(1.035)', blur: 1.9, glow: 0.12 },
  'rose-gold': { filter: 'saturate(1.10) contrast(1.02) sepia(0.09) brightness(1.035)', tint: 'rgba(211,132,139,0.17)', tintMode: 'soft-light', highlight: 'rgba(255,215,190,0.10)' },
  'night-glow': { filter: 'saturate(1.13) contrast(1.08) brightness(1.09)', tint: 'rgba(70,92,156,0.14)', tintMode: 'soft-light', glow: 0.23, shadow: 'rgba(21,32,78,0.13)', highlight: 'rgba(255,177,130,0.11)', vignette: 0.16 },
}

/**
 * A lightweight local colour-grading stage. It does not need face detection:
 * the same look works for any camera framing and does not fail when no face
 * is visible. The source camera is never acquired or stopped by this stage.
 */
export class ColorLookEffectStage implements CallEffectStage {
  readonly priority = 20
  readonly id: string
  private readonly preset: CallEffectDefinition
  private readonly style: LookStyle
  private readonly scratch = document.createElement('canvas')
  private readonly scratchContext: CanvasRenderingContext2D
  private readonly grainTile = document.createElement('canvas')
  private readonly grainContext: CanvasRenderingContext2D
  private intensity: number
  private disposed = false

  constructor(preset: CallEffectDefinition, intensity = preset.defaultIntensity) {
    this.preset = preset
    this.id = `color-look:${preset.id}`
    const style = LOOKS[preset.id]
    if (!style) throw new Error(`Unsupported colour look: ${preset.id}`)
    this.style = style
    this.intensity = clamp(intensity, 0, 100)
    const scratchContext = this.scratch.getContext('2d', { alpha: false })
    const grainContext = this.grainTile.getContext('2d', { alpha: true })
    if (!scratchContext || !grainContext) throw new Error('This device cannot create the colour-effects drawing surface.')
    this.scratchContext = scratchContext
    this.grainContext = grainContext
    this.createGrainTile()
  }

  setIntensity(value: number) { this.intensity = clamp(value, 0, 100) }

  render(frame: CallEffectFrame) {
    if (this.disposed || this.intensity <= 0) return
    const { canvas, context, width, height } = frame
    if (!width || !height) return
    if (this.scratch.width !== width || this.scratch.height !== height) {
      this.scratch.width = width
      this.scratch.height = height
    }

    // Snapshot before modifying the destination canvas.
    this.scratchContext.save()
    this.scratchContext.setTransform(1, 0, 0, 1, 0, 0)
    this.scratchContext.globalAlpha = 1
    this.scratchContext.globalCompositeOperation = 'source-over'
    this.scratchContext.filter = 'none'
    this.scratchContext.clearRect(0, 0, width, height)
    this.scratchContext.drawImage(canvas, 0, 0, width, height)
    this.scratchContext.restore()

    const amount = this.intensity / 100
    context.save()
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.globalAlpha = 1
    context.globalCompositeOperation = 'source-over'
    context.filter = 'none'
    context.clearRect(0, 0, width, height)
    context.drawImage(this.scratch, 0, 0, width, height)

    // Blend the colour grade over the original for a predictable intensity control.
    context.globalAlpha = amount
    context.filter = this.style.filter
    context.drawImage(this.scratch, 0, 0, width, height)
    context.filter = 'none'
    context.globalAlpha = 1

    if (this.style.tint) {
      context.save()
      context.globalCompositeOperation = this.style.tintMode ?? 'soft-light'
      context.globalAlpha = amount
      context.fillStyle = this.style.tint
      context.fillRect(0, 0, width, height)
      context.restore()
    }

    if (this.style.shadow) this.paintGradient(context, width, height, this.style.shadow, 'multiply', amount)
    if (this.style.highlight) this.paintGradient(context, width, height, this.style.highlight, 'screen', amount)

    if (this.style.glow) {
      context.save()
      context.globalCompositeOperation = 'screen'
      context.globalAlpha = amount * this.style.glow
      context.filter = `blur(${Math.max(1, width * 0.003)}px)`
      context.drawImage(this.scratch, 0, 0, width, height)
      context.filter = 'none'
      context.restore()
    }

    if (this.style.blur) {
      context.save()
      context.globalCompositeOperation = 'screen'
      context.globalAlpha = amount * Math.min(0.28, this.style.blur * 0.075)
      context.filter = `blur(${this.style.blur}px)`
      context.drawImage(this.scratch, 0, 0, width, height)
      context.filter = 'none'
      context.restore()
    }

    if (this.style.vignette) this.paintVignette(context, width, height, amount * this.style.vignette)
    if (this.style.grain) this.paintGrain(context, width, height, amount * this.style.grain)
    context.restore()
  }

  private paintGradient(context: CanvasRenderingContext2D, width: number, height: number, colour: string, mode: GlobalCompositeOperation, amount: number) {
    context.save()
    context.globalCompositeOperation = mode
    context.globalAlpha = amount
    const gradient = context.createLinearGradient(0, 0, width, height)
    gradient.addColorStop(0, colour)
    gradient.addColorStop(1, 'rgba(0,0,0,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, width, height)
    context.restore()
  }

  private paintVignette(context: CanvasRenderingContext2D, width: number, height: number, amount: number) {
    const radius = Math.hypot(width / 2, height / 2)
    const gradient = context.createRadialGradient(width / 2, height / 2, radius * 0.28, width / 2, height / 2, radius)
    gradient.addColorStop(0, 'rgba(0,0,0,0)')
    gradient.addColorStop(0.72, 'rgba(0,0,0,0.04)')
    gradient.addColorStop(1, 'rgba(0,0,0,0.72)')
    context.save()
    context.globalCompositeOperation = 'multiply'
    context.globalAlpha = amount
    context.fillStyle = gradient
    context.fillRect(0, 0, width, height)
    context.restore()
  }

  private createGrainTile() {
    const size = 96
    this.grainTile.width = size
    this.grainTile.height = size
    const image = this.grainContext.createImageData(size, size)
    // Fixed-seed noise avoids generating random values on every video frame.
    let seed = 0x51f15e
    for (let i = 0; i < image.data.length; i += 4) {
      seed = (seed * 1664525 + 1013904223) >>> 0
      const value = 100 + (seed % 56)
      image.data[i] = value
      image.data[i + 1] = value
      image.data[i + 2] = value
      image.data[i + 3] = 34
    }
    this.grainContext.putImageData(image, 0, 0)
  }

  private paintGrain(context: CanvasRenderingContext2D, width: number, height: number, amount: number) {
    const pattern = context.createPattern(this.grainTile, 'repeat')
    if (!pattern) return
    context.save()
    context.globalCompositeOperation = 'soft-light'
    context.globalAlpha = amount
    context.fillStyle = pattern
    context.fillRect(0, 0, width, height)
    context.restore()
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.scratch.width = 0
    this.scratch.height = 0
    this.grainTile.width = 0
    this.grainTile.height = 0
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)))
}
