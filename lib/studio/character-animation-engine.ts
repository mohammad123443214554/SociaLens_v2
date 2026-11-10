import type { CharacterAnimationEffect } from './animation-engine'

export type CharacterMotionSample = {
  opacity: number
  translateX: number
  translateY: number
  scaleX: number
  scaleY: number
  rotate: number
  blur: number
  clipProgress: number
}

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value))
const smootherStep = (value: number) => {
  const t = clamp(value)
  return t * t * t * (t * (t * 6 - 15) + 10)
}
const hash = (index: number, salt: number) => {
  const value = Math.sin((index + 1) * 127.1 + salt * 311.7) * 43758.5453
  return value - Math.floor(value)
}
const springSettle = (progress: number) => {
  const t = clamp(progress)
  return clamp(1 - Math.exp(-6.5 * t) * (Math.cos(9 * t) + 0.12 * Math.sin(9 * t)), 0, 1.045)
}

export function splitStudioGraphemes(value: string): string[] {
  const Segmenter = (Intl as unknown as {
    Segmenter?: new (locale?: string, options?: { granularity: 'grapheme' }) => {
      segment: (input: string) => Iterable<{ segment: string }>
    }
  }).Segmenter
  return Segmenter
    ? Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(value), item => item.segment)
    : Array.from(value)
}

/** Samples restrained, deterministic per-grapheme motion for preview and export. */
export function sampleCharacterMotion(input: {
  effect: CharacterAnimationEffect
  progress: number
  index: number
  count: number
  intensity?: number
}): CharacterMotionSample {
  const { effect } = input
  const count = Math.max(1, Math.floor(input.count))
  const index = Math.max(0, Math.min(count - 1, Math.floor(input.index)))
  const progress = clamp(input.progress)
  if (progress >= 1) {
    return { opacity: 1, translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotate: 0, blur: 0, clipProgress: 1 }
  }

  const intensity = clamp(Number.isFinite(input.intensity) ? input.intensity! : 1, 0, 2)
  const reverseOrder = effect === 'reverse-typewriter' || effect === 'delete-typewriter'
  const order = reverseOrder ? count - 1 - index : index
  const stagger = Math.min(0.055, 0.45 / count)
  const localProgress = smootherStep((progress - order * stagger) / Math.max(0.12, 1 - (count - 1) * stagger))
  const center = count <= 1 ? 0 : index / (count - 1) - 0.5
  const randomX = (hash(index, 1) - 0.5) * 64 * intensity
  const randomY = (hash(index, 2) - 0.5) * 48 * intensity
  const randomRotation = (hash(index, 3) - 0.5) * 96 * intensity
  const spring = springSettle(localProgress)

  const sample: CharacterMotionSample = {
    opacity: 1,
    translateX: 0,
    translateY: 0,
    scaleX: 1,
    scaleY: 1,
    rotate: 0,
    blur: 0,
    clipProgress: 1,
  }

  switch (effect) {
    case 'typewriter':
    case 'reverse-typewriter':
      sample.opacity = progress >= (order + 1) / count ? 1 : 0
      break
    case 'delete-typewriter':
      sample.opacity = progress >= (order + 1) / count ? 1 : 0
      sample.scaleX = sample.opacity ? 0.78 + localProgress * 0.22 : 0.05
      sample.translateX = sample.opacity ? (1 - localProgress) * 3 * intensity : 3 * intensity
      break
    case 'fade':
      sample.opacity = localProgress
      break
    case 'rise':
      sample.opacity = localProgress
      sample.translateY = (1 - localProgress) * 18 * intensity
      break
    case 'drop':
      sample.opacity = localProgress
      sample.translateY = -(1 - localProgress) * 18 * intensity
      break
    case 'pop':
      sample.opacity = localProgress
      sample.scaleX = sample.scaleY = 0.68 + spring * 0.32
      break
    case 'bounce':
      sample.opacity = localProgress
      sample.scaleX = sample.scaleY = 0.96 + spring * 0.04
      sample.translateY = (1 - spring) * 11 * intensity
      break
    case 'rotate':
      sample.opacity = localProgress
      sample.rotate = (1 - localProgress) * -56 * intensity
      sample.scaleX = sample.scaleY = 0.88 + localProgress * 0.12
      break
    case 'flip':
      sample.opacity = localProgress
      sample.scaleX = Math.max(0.12, Math.abs(2 * localProgress - 1))
      sample.rotate = (1 - localProgress) * 5 * intensity
      break
    case 'zoom':
      sample.opacity = localProgress
      sample.scaleX = sample.scaleY = 0.72 + localProgress * 0.28
      break
    case 'blur':
      sample.opacity = localProgress
      sample.blur = (1 - localProgress) * 8 * intensity
      break
    case 'slide':
      sample.opacity = localProgress
      sample.translateX = (1 - localProgress) * (index % 2 ? 1 : -1) * 24 * intensity
      break
    case 'scatter':
    case 'assemble':
      sample.opacity = localProgress
      sample.translateX = randomX * (1 - localProgress)
      sample.translateY = randomY * (1 - localProgress)
      sample.rotate = randomRotation * (1 - localProgress)
      sample.scaleX = sample.scaleY = (effect === 'scatter' ? 0.82 : 0.72) + localProgress * (effect === 'scatter' ? 0.18 : 0.28)
      break
    case 'dissolve':
      sample.opacity = clamp((progress - order / count * 0.48) * count * 2.1)
      sample.blur = (1 - localProgress) * 2.5 * intensity
      break
    case 'wave':
      sample.opacity = localProgress
      sample.translateY = Math.sin((localProgress * 1.35 - center * 0.55) * Math.PI * 2) * Math.sin(localProgress * Math.PI) * 8 * intensity
      break
    case 'pulse':
      sample.opacity = localProgress
      sample.scaleX = sample.scaleY = 1 + Math.sin(localProgress * Math.PI) * 0.075 * intensity
      break
    case 'stretch':
      sample.opacity = localProgress
      sample.scaleX = 1.55 - localProgress * 0.55
      sample.scaleY = 0.9 + localProgress * 0.1
      break
    case 'squeeze':
      sample.opacity = localProgress
      sample.scaleX = 0.72 + localProgress * 0.28
      sample.scaleY = 1.12 - localProgress * 0.12
      break
    case 'shuffle':
      sample.opacity = localProgress
      sample.translateX = randomX * (1 - localProgress) * 0.55
      sample.translateY = randomY * (1 - localProgress) * 0.55
      sample.rotate = randomRotation * (1 - localProgress) * 0.35
      break
    case 'reveal':
      sample.opacity = localProgress
      sample.scaleX = 0.18 + localProgress * 0.82
      break
    case 'mask-reveal':
      sample.opacity = localProgress
      sample.clipProgress = localProgress
      break
    case 'spark':
      sample.opacity = localProgress
      sample.scaleX = sample.scaleY = 0.72 + localProgress * 0.28
      sample.rotate = (1 - localProgress) * randomRotation * 0.28
      sample.blur = (1 - localProgress) * 4 * intensity
      sample.translateY = (1 - localProgress) * -7 * intensity
      break
    case 'stagger':
      sample.opacity = localProgress
      sample.translateY = (1 - localProgress) * 9 * intensity
      sample.scaleY = 0.94 + localProgress * 0.06
      break
  }

  sample.opacity = clamp(sample.opacity)
  for (const key of Object.keys(sample) as (keyof CharacterMotionSample)[]) {
    if (Object.is(sample[key], -0)) sample[key] = 0
  }
  return sample
}
