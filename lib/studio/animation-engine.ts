/**
 * Deterministic, renderer-agnostic text animation engine.
 *
 * This module deliberately contains no DOM, React, CSS animation clocks, or canvas
 * dependencies. Both the interactive preview and video exporter can sample the same
 * animation definition at an explicit timeline time and receive the same transform.
 *
 * Animation catalog entries are added in the later animation-family parts. Keeping
 * definitions data-driven here prevents 300 one-off implementations.
 */

export type TextAnimationMode = 'entrance' | 'exit' | 'loop' | 'continuous'
export type MaskRevealEffect = 'wipe-left' | 'wipe-right' | 'wipe-up' | 'wipe-down' | 'diagonal-down' | 'diagonal-up' | 'center-open' | 'center-close' | 'iris-circle' | 'iris-ellipse' | 'diamond' | 'radial-sweep' | 'clock-wipe' | 'venetian' | 'checkerboard' | 'box-reveal' | 'corner-sweep' | 'curtain' | 'shutter' | 'scanline' | 'pixel-grid' | 'feathered-wipe' | 'starburst' | 'spiral' | 'cross-reveal'
export type WordAnimationEffect = 'cascade' | 'rise' | 'drop' | 'fade' | 'slide-left' | 'slide-right' | 'zoom' | 'soft-zoom' | 'blur' | 'flip' | 'rotate' | 'wave' | 'stagger' | 'float' | 'sweep' | 'mask' | 'tracking' | 'focus' | 'pop' | 'drift' | 'fold' | 'glide' | 'spotlight' | 'line-reveal' | 'line-cascade'
export type CharacterAnimationEffect = 'typewriter' | 'reverse-typewriter' | 'delete-typewriter' | 'fade' | 'rise' | 'drop' | 'pop' | 'bounce' | 'rotate' | 'flip' | 'zoom' | 'blur' | 'slide' | 'scatter' | 'assemble' | 'dissolve' | 'wave' | 'pulse' | 'stretch' | 'squeeze' | 'shuffle' | 'reveal' | 'mask-reveal' | 'spark' | 'stagger'
export type TextAnimationDirection = 'normal' | 'reverse' | 'alternate' | 'alternate-reverse'
export type TextAnimationEasing =
  | 'linear'
  | 'ease'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'cubic-in'
  | 'cubic-out'
  | 'cubic-in-out'
  | 'premium-out'
  | 'premium-in'
  | 'premium-in-out'
  | 'back-out'
  | 'back-in'
  | 'elastic-out'
  | 'bounce-out'

/** Values are renderer-neutral CSS/canvas-friendly visual properties. */
export type TextAnimationFrame = {
  at: number
  opacity?: number
  translateX?: number
  translateY?: number
  scaleX?: number
  scaleY?: number
  rotate?: number
  /** 3D rotation in degrees around the horizontal axis. */
  rotateX?: number
  /** 3D rotation in degrees around the vertical axis. */
  rotateY?: number
  /** CSS perspective distance in pixels; zero disables perspective. */
  perspective?: number
  skewX?: number
  skewY?: number
  blur?: number
  letterSpacing?: number
}

export type TextAnimationDefinition = {
  id: string
  name: string
  description?: string
  category: string
  mode: TextAnimationMode
  /** Normalized keyframes must start at 0 and end at 1. */
  keyframes: readonly TextAnimationFrame[]
  defaultDurationMs: number
  defaultEasing?: TextAnimationEasing
  /** Describes whether this effect is safe to combine with other animation tracks. */
  compositing?: 'replace' | 'additive'
  characterEffect?: CharacterAnimationEffect
  wordEffect?: WordAnimationEffect
  maskEffect?: MaskRevealEffect
}

export type TextAnimationSettings = {
  animationId: string | null
  durationMs?: number
  delayMs?: number
  repeatCount?: number
  direction?: TextAnimationDirection
  easing?: TextAnimationEasing
  intensity?: number
  enabled?: boolean
}

export type TextAnimationSample = {
  visible: boolean
  opacity: number
  translateX: number
  translateY: number
  scaleX: number
  scaleY: number
  rotate: number
  rotateX: number
  rotateY: number
  perspective: number
  skewX: number
  skewY: number
  blur: number
  letterSpacing: number
  progress: number
  phase: 'before' | 'running' | 'after' | 'inactive'
}

export const NEUTRAL_TEXT_ANIMATION: Readonly<TextAnimationSample> = Object.freeze({
  visible: true,
  opacity: 1,
  translateX: 0,
  translateY: 0,
  scaleX: 1,
  scaleY: 1,
  rotate: 0,
  rotateX: 0,
  rotateY: 0,
  perspective: 0,
  skewX: 0,
  skewY: 0,
  blur: 0,
  letterSpacing: 0,
  progress: 1,
  phase: 'inactive',
})

const EASING: Record<TextAnimationEasing, (value: number) => number> = {
  linear: value => value,
  ease: value => value * value * (3 - 2 * value),
  'ease-in': value => value * value,
  'ease-out': value => 1 - (1 - value) * (1 - value),
  'ease-in-out': value => value < 0.5 ? 2 * value * value : 1 - Math.pow(-2 * value + 2, 2) / 2,
  'cubic-in': value => value * value * value,
  'cubic-out': value => 1 - Math.pow(1 - value, 3),
  'cubic-in-out': value => value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2,
  // Premium motion curves: quick, controlled travel with a long, gentle settle.
  'premium-out': value => 1 - Math.pow(1 - value, 5),
  'premium-in': value => Math.pow(value, 5),
  'premium-in-out': value => value < 0.5 ? 16 * Math.pow(value, 5) : 1 - Math.pow(-2 * value + 2, 5) / 2,
  'back-out': value => {
    const c1 = 1.70158
    const c3 = c1 + 1
    return 1 + c3 * Math.pow(value - 1, 3) + c1 * Math.pow(value - 1, 2)
  },
  'back-in': value => {
    const c1 = 1.70158
    const c3 = c1 + 1
    return c3 * value * value * value - c1 * value * value
  },
  'elastic-out': value => value === 0 || value === 1 ? value : Math.pow(2, -10 * value) * Math.sin((value * 10 - 0.75) * (2 * Math.PI / 3)) + 1,
  'bounce-out': value => {
    const n1 = 7.5625
    const d1 = 2.75
    if (value < 1 / d1) return n1 * value * value
    if (value < 2 / d1) return n1 * (value -= 1.5 / d1) * value + 0.75
    if (value < 2.5 / d1) return n1 * (value -= 2.25 / d1) * value + 0.9375
    return n1 * (value -= 2.625 / d1) * value + 0.984375
  },
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const finite = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

export function normalizeTextAnimationSettings(
  settings?: Partial<TextAnimationSettings> | null,
): TextAnimationSettings {
  if (!settings || typeof settings !== 'object') return { animationId: null, enabled: false }
  const animationId = typeof settings.animationId === 'string' && settings.animationId.trim()
    ? settings.animationId.trim()
    : null
  const durationMs = clamp(finite(settings.durationMs, 700), 50, 60000)
  const delayMs = clamp(finite(settings.delayMs, 0), 0, 60000)
  const repeatCount = clamp(Math.floor(finite(settings.repeatCount, 1)), 0, 1000)
  const directions: TextAnimationDirection[] = ['normal', 'reverse', 'alternate', 'alternate-reverse']
  const easings = Object.keys(EASING) as TextAnimationEasing[]
  return {
    animationId,
    durationMs,
    delayMs,
    repeatCount,
    direction: directions.includes(settings.direction as TextAnimationDirection) ? settings.direction : 'normal',
    easing: easings.includes(settings.easing as TextAnimationEasing) ? settings.easing : 'ease',
    intensity: clamp(finite(settings.intensity, 1), 0, 2),
    enabled: settings.enabled !== false && animationId !== null,
  }
}

export function validateTextAnimationDefinition(definition: TextAnimationDefinition): string[] {
  const errors: string[] = []
  if (!definition.id.trim()) errors.push('Animation id is required.')
  if (!definition.name.trim()) errors.push('Animation name is required.')
  if (!definition.category.trim()) errors.push('Animation category is required.')
  if (!Number.isFinite(definition.defaultDurationMs) || definition.defaultDurationMs <= 0) {
    errors.push('Default duration must be a positive finite number.')
  }
  if (definition.keyframes.length < 2) errors.push('At least two keyframes are required.')
  if (definition.keyframes.length >= 2) {
    if (definition.keyframes[0].at !== 0) errors.push('The first keyframe must start at 0.')
    if (definition.keyframes[definition.keyframes.length - 1].at !== 1) errors.push('The final keyframe must end at 1.')
  }
  let previous = -Infinity
  for (const frame of definition.keyframes) {
    if (!Number.isFinite(frame.at) || frame.at < 0 || frame.at > 1) errors.push('Keyframe positions must be finite values between 0 and 1.')
    if (frame.at <= previous) errors.push('Keyframe positions must be strictly increasing.')
    previous = frame.at
    for (const [key, value] of Object.entries(frame)) {
      if (key !== 'at' && (typeof value !== 'number' || !Number.isFinite(value))) {
        errors.push('Keyframe property ' + key + ' must be a finite number.')
      }
    }
  }
  return [...new Set(errors)]
}

export function validateTextAnimationRegistry(definitions: readonly TextAnimationDefinition[]): string[] {
  const errors: string[] = []
  const ids = new Set<string>()
  const names = new Set<string>()
  for (const definition of definitions) {
    if (ids.has(definition.id)) errors.push('Duplicate animation id: ' + definition.id)
    if (names.has(definition.name.trim().toLocaleLowerCase())) errors.push('Duplicate animation name: ' + definition.name)
    ids.add(definition.id)
    names.add(definition.name.trim().toLocaleLowerCase())
    errors.push(...validateTextAnimationDefinition(definition).map(error => definition.id + ': ' + error))
  }
  return errors
}

function interpolateFrame(
  definition: TextAnimationDefinition,
  progress: number,
  easing: TextAnimationEasing,
  intensity: number,
): Omit<TextAnimationSample, 'visible' | 'progress' | 'phase'> {
  const frames = definition.keyframes
  const rawProgress = clamp(progress, 0, 1)
  // Overshooting curves intentionally retain their authored overshoot. All other
  // curves remap the full animation clock once, then use a C1-continuous Hermite
  // spline between keyframes so velocity does not abruptly restart at each stop.
  const overshoots = easing === 'back-out' || easing === 'back-in' || easing === 'elastic-out' || easing === 'bounce-out'
  const position = overshoots ? rawProgress : clamp(EASING[easing](rawProgress), 0, 1)
  let rightIndex = frames.findIndex(frame => frame.at >= position)
  if (rightIndex < 0) rightIndex = frames.length - 1
  const leftIndex = Math.max(0, rightIndex - 1)
  const left = frames[leftIndex]
  const right = frames[rightIndex]
  const span = right.at - left.at
  const local = span <= 0 ? 1 : clamp((position - left.at) / span, 0, 1)
  const value = (key: keyof TextAnimationFrame, fallback: number) => {
    const at = (index: number) => finite(frames[index][key], fallback)
    const from = at(leftIndex)
    const to = at(rightIndex)
    if (overshoots) {
      const eased = EASING[easing](local)
      return from + (to - from) * eased
    }
    if (span <= 0 || leftIndex === rightIndex) return to
    const previousIndex = Math.max(0, leftIndex - 1)
    const nextIndex = Math.min(frames.length - 1, rightIndex + 1)
    const leftSlope = leftIndex === 0
      ? (at(1) - at(0)) / Math.max(1e-6, frames[1].at - frames[0].at)
      : (at(rightIndex) - at(previousIndex)) / Math.max(1e-6, frames[rightIndex].at - frames[previousIndex].at)
    const rightSlope = rightIndex === frames.length - 1
      ? (at(rightIndex) - at(leftIndex)) / span
      : (at(nextIndex) - at(leftIndex)) / Math.max(1e-6, frames[nextIndex].at - frames[leftIndex].at)
    const t2 = local * local
    const t3 = t2 * local
    const h00 = 2 * t3 - 3 * t2 + 1
    const h10 = t3 - 2 * t2 + local
    const h01 = -2 * t3 + 3 * t2
    const h11 = t3 - t2
    return h00 * from + h10 * leftSlope * span + h01 * to + h11 * rightSlope * span
  }
  const neutral = {
    opacity: 1, translateX: 0, translateY: 0, scaleX: 1, scaleY: 1,
    rotate: 0, rotateX: 0, rotateY: 0, perspective: 0, skewX: 0, skewY: 0, blur: 0, letterSpacing: 0,
  }
  const scale = (key: keyof TextAnimationFrame, fallback: number) => {
    const raw = value(key, fallback)
    return fallback + (raw - fallback) * intensity
  }
  return {
    opacity: clamp(scale('opacity', neutral.opacity), 0, 1),
    translateX: scale('translateX', 0),
    translateY: scale('translateY', 0),
    scaleX: Math.max(0.001, scale('scaleX', 1)),
    scaleY: Math.max(0.001, scale('scaleY', 1)),
    rotate: scale('rotate', 0),
    rotateX: scale('rotateX', 0),
    rotateY: scale('rotateY', 0),
    perspective: Math.max(0, scale('perspective', 0)),
    skewX: scale('skewX', 0),
    skewY: scale('skewY', 0),
    blur: Math.max(0, scale('blur', 0)),
    letterSpacing: scale('letterSpacing', 0),
  }
}

function directedProgress(progress: number, direction: TextAnimationDirection, iteration: number) {
  const reverse = direction === 'reverse'
    || (direction === 'alternate' && iteration % 2 === 1)
    || (direction === 'alternate-reverse' && iteration % 2 === 0)
  return reverse ? 1 - progress : progress
}

/**
 * Samples an animation at absolute project timeline time (seconds).
 * repeatCount=0 means infinite; finite repeats hold their final frame.
 * Exit animations are anchored to the end of the text layer's visible interval.
 */
export function sampleTextAnimation(input: {
  definition: TextAnimationDefinition
  settings: Partial<TextAnimationSettings>
  timelineTimeSeconds: number
  layerStartSeconds: number
  layerDurationSeconds: number
}): TextAnimationSample {
  const { definition } = input
  const settings = normalizeTextAnimationSettings(input.settings)
  const neutral = { ...NEUTRAL_TEXT_ANIMATION }
  if (!settings.enabled || settings.animationId !== definition.id) return neutral
  const timelineTime = finite(input.timelineTimeSeconds, 0)
  const layerStart = Math.max(0, finite(input.layerStartSeconds, 0))
  const layerDuration = Math.max(0, finite(input.layerDurationSeconds, 0))
  if (layerDuration <= 0) return { ...neutral, visible: false, phase: 'before' }

  const duration = settings.durationMs! / 1000
  const delay = settings.delayMs! / 1000
  const layerEnd = layerStart + layerDuration
  const animationStart = definition.mode === 'exit'
    ? Math.max(layerStart, layerEnd - duration - delay)
    : layerStart + delay
  const animationEnd = animationStart + duration
  const isLoop = definition.mode === 'loop' || definition.mode === 'continuous'
  const before = timelineTime < animationStart
  const after = !isLoop && timelineTime >= animationEnd
  let phaseProgress = 0
  let iteration = 0
  let phase: TextAnimationSample['phase'] = 'running'

  if (before) {
    phase = 'before'
    phaseProgress = definition.mode === 'exit' ? 0 : 0
  } else if (isLoop) {
    const elapsed = Math.max(0, timelineTime - animationStart)
    const totalIterations = settings.repeatCount === 0 ? Infinity : Math.max(1, settings.repeatCount!)
    iteration = Math.floor(elapsed / duration)
    if (iteration >= totalIterations) {
      iteration = totalIterations - 1
      phaseProgress = 1
      phase = 'after'
    } else {
      phaseProgress = (elapsed % duration) / duration
    }
  } else {
    phaseProgress = after ? 1 : clamp((timelineTime - animationStart) / duration, 0, 1)
    if (after) phase = 'after'
  }

  const directed = directedProgress(phaseProgress, settings.direction!, iteration)
  const visual = interpolateFrame(definition, directed, settings.easing || definition.defaultEasing || 'ease', settings.intensity ?? 1)
  const visible = definition.mode === 'entrance' ? timelineTime >= layerStart : true
  return {
    ...visual,
    visible,
    progress: phaseProgress,
    phase,
  }
}

/** Resolve a catalog entry without allowing malformed ids to throw. */
export function getTextAnimationDefinition(
  definitions: readonly TextAnimationDefinition[],
  animationId: string | null | undefined,
): TextAnimationDefinition | undefined {
  if (!animationId) return undefined
  return definitions.find(definition => definition.id === animationId)
}
