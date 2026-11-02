import type { CallEffectDefinition } from './types'

/** Part 2: twelve real presets backed by the local face-landmark renderer. */
export const PART_TWO_FACE_PRESETS: readonly CallEffectDefinition[] = [
  { id: 'natural-glow', categoryId: 'natural-beauty', name: 'Natural Glow', description: 'A soft, warm portrait finish with a gentle glow.', renderKind: 'color', requiresFace: true, defaultIntensity: 55 },
  { id: 'glass-skin', categoryId: 'natural-beauty', name: 'Glass Skin', description: 'A delicate, even-looking skin finish while preserving facial details.', renderKind: 'segmentation', requiresFace: true, defaultIntensity: 42 },
  { id: 'soft-beauty', categoryId: 'natural-beauty', name: 'Soft Beauty', description: 'A subtle skin-softening portrait effect.', renderKind: 'segmentation', requiresFace: true, defaultIntensity: 45 },
  { id: 'fresh-face', categoryId: 'natural-beauty', name: 'Fresh Face', description: 'A brighter, fresher colour treatment.', renderKind: 'color', requiresFace: true, defaultIntensity: 48 },
  { id: 'smooth-portrait', categoryId: 'natural-beauty', name: 'Smooth Portrait', description: 'A stronger but controlled skin-softening finish.', renderKind: 'segmentation', requiresFace: true, defaultIntensity: 38 },
  { id: 'natural-makeup', categoryId: 'natural-beauty', name: 'Natural Makeup', description: 'Soft blush and a restrained natural lip tint.', renderKind: 'face-landmark', requiresFace: true, defaultIntensity: 40 },
  { id: 'soft-blush', categoryId: 'face-enhancement', name: 'Soft Blush', description: 'A diffused blush tint placed on the cheeks.', renderKind: 'face-landmark', requiresFace: true, defaultIntensity: 42 },
  { id: 'bright-eyes', categoryId: 'face-enhancement', name: 'Bright Eyes', description: 'A light, subtle brightness around the eye area.', renderKind: 'face-landmark', requiresFace: true, defaultIntensity: 35 },
  { id: 'lip-tint', categoryId: 'face-enhancement', name: 'Lip Tint', description: 'A soft tint aligned to the tracked lip outline.', renderKind: 'face-landmark', requiresFace: true, defaultIntensity: 45 },
  { id: 'soft-contour', categoryId: 'face-enhancement', name: 'Soft Contour', description: 'Subtle cheek and jaw shading aligned to the face.', renderKind: 'face-landmark', requiresFace: true, defaultIntensity: 32 },
  { id: 'eye-glow', categoryId: 'face-enhancement', name: 'Eye Glow', description: 'A gentle luminous accent around the irises.', renderKind: 'face-landmark', requiresFace: true, defaultIntensity: 38 },
  { id: 'portrait-polish', categoryId: 'face-enhancement', name: 'Portrait Polish', description: 'A balanced portrait tone with light skin softening.', renderKind: 'segmentation', requiresFace: true, defaultIntensity: 35 },
] as const

export function getPartTwoFacePreset(id: string) {
  return PART_TWO_FACE_PRESETS.find((preset) => preset.id === id) ?? null
}
