import type { CallEffectCategory } from './types'

/** Canonical categories shared by calls and planned live streaming. */
export const CALL_EFFECT_CATEGORIES: readonly CallEffectCategory[] = [
  { id: 'natural-beauty', label: 'Natural Beauty', description: 'Subtle, realistic skin and portrait looks.', order: 1 },
  { id: 'makeup', label: 'Makeup', description: 'Makeup-inspired colour and face effects.', order: 2 },
  { id: 'aesthetic-lighting', label: 'Aesthetic Lighting', description: 'Warmth, tone, glow and cinematic lighting.', order: 3 },
  { id: 'face-enhancement', label: 'Face Enhancement', description: 'Carefully tracked eye, lip and cheek enhancements.', order: 4 },
  { id: 'creative-looks', label: 'Creative Looks', description: 'Stylised colour treatments and creative portraits.', order: 5 },
  { id: 'eye-lenses', label: 'Eye Lenses', description: 'Tracked iris-colour effects with natural detail preservation.', order: 6 },
] as const
