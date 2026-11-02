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

/** Part 3: six makeup looks built from tracked facial regions; no external SDK. */
export const PART_THREE_MAKEUP_PRESETS: readonly CallEffectDefinition[] = [
  { id: 'soft-pink', categoryId: 'makeup', name: 'Soft Pink', description: 'A delicate pink lip, diffused cheek colour and a soft rosy eye wash.', renderKind: 'face-landmark', requiresFace: true, defaultIntensity: 52 },
  { id: 'rose-makeup', categoryId: 'makeup', name: 'Rose Makeup', description: 'Rose-toned lips and cheeks with softly defined eyes.', renderKind: 'face-landmark', requiresFace: true, defaultIntensity: 58 },
  { id: 'peach-makeup', categoryId: 'makeup', name: 'Peach Makeup', description: 'Warm peach cheeks, a fresh peach lip and subtle eye warmth.', renderKind: 'face-landmark', requiresFace: true, defaultIntensity: 54 },
  { id: 'korean-makeup', categoryId: 'makeup', name: 'Korean Makeup', description: 'A soft gradient lip, youthful cheek tint and delicate aegyo-sal highlight.', renderKind: 'face-landmark', requiresFace: true, defaultIntensity: 50 },
  { id: 'glam-look', categoryId: 'makeup', name: 'Glam Look', description: 'Defined eyeliner, richer lipstick, eye shadow and cheek highlight.', renderKind: 'face-landmark', requiresFace: true, defaultIntensity: 62 },
  { id: 'nude-makeup', categoryId: 'makeup', name: 'Nude Makeup', description: 'Neutral nude lips, understated contour and a natural eye definition.', renderKind: 'face-landmark', requiresFace: true, defaultIntensity: 46 },
] as const

export function getPartThreeMakeupPreset(id: string) {
  return PART_THREE_MAKEUP_PRESETS.find((preset) => preset.id === id) ?? null
}

/** Part 4: local colour-grade and light-treatment presets. */
export const PART_FOUR_LIGHTING_PRESETS: readonly CallEffectDefinition[] = [
  { id: 'golden-hour', categoryId: 'aesthetic-lighting', name: 'Golden Hour', description: 'Warm late-afternoon light with a gentle highlight bloom.', renderKind: 'color', requiresFace: false, defaultIntensity: 58 },
  { id: 'warm-light', categoryId: 'aesthetic-lighting', name: 'Warm Light', description: 'A soft amber-white balance for a cosy natural look.', renderKind: 'color', requiresFace: false, defaultIntensity: 48 },
  { id: 'cool-light', categoryId: 'aesthetic-lighting', name: 'Cool Light', description: 'A clean cool daylight treatment with controlled contrast.', renderKind: 'color', requiresFace: false, defaultIntensity: 45 },
  { id: 'dreamy-glow', categoryId: 'aesthetic-lighting', name: 'Dreamy Glow', description: 'Soft luminous highlights with a delicate diffusion halo.', renderKind: 'overlay', requiresFace: false, defaultIntensity: 52 },
  { id: 'vintage-film', categoryId: 'aesthetic-lighting', name: 'Vintage Film', description: 'Warm film-inspired colour, gentle vignette and fine grain.', renderKind: 'overlay', requiresFace: false, defaultIntensity: 50 },
  { id: 'cinematic', categoryId: 'aesthetic-lighting', name: 'Cinematic', description: 'A deeper cinematic grade with restrained contrast and vignette.', renderKind: 'color', requiresFace: false, defaultIntensity: 48 },
] as const

export const PART_FOUR_CREATIVE_PRESETS: readonly CallEffectDefinition[] = [
  { id: 'pastel-dream', categoryId: 'creative-looks', name: 'Pastel Dream', description: 'Airy pastel colour with softened contrast and a gentle glow.', renderKind: 'color', requiresFace: false, defaultIntensity: 54 },
  { id: 'lavender', categoryId: 'creative-looks', name: 'Lavender', description: 'A delicate lavender-violet colour mood.', renderKind: 'color', requiresFace: false, defaultIntensity: 50 },
  { id: 'milky-tone', categoryId: 'creative-looks', name: 'Milky Tone', description: 'A creamy, lifted colour grade with muted saturation.', renderKind: 'color', requiresFace: false, defaultIntensity: 46 },
  { id: 'soft-focus', categoryId: 'creative-looks', name: 'Soft Focus', description: 'A subtle optical diffusion while keeping the main image readable.', renderKind: 'overlay', requiresFace: false, defaultIntensity: 42 },
  { id: 'rose-gold', categoryId: 'creative-looks', name: 'Rose Gold', description: 'A refined rosy warmth with a soft metallic highlight tint.', renderKind: 'color', requiresFace: false, defaultIntensity: 52 },
  { id: 'night-glow', categoryId: 'creative-looks', name: 'Night Glow', description: 'A low-light friendly luminous grade with cool shadows and warm highlights.', renderKind: 'overlay', requiresFace: false, defaultIntensity: 56 },
] as const

export function getPartFourLightingPreset(id: string) {
  return PART_FOUR_LIGHTING_PRESETS.find((preset) => preset.id === id) ?? null
}

export function getPartFourCreativePreset(id: string) {
  return PART_FOUR_CREATIVE_PRESETS.find((preset) => preset.id === id) ?? null
}
