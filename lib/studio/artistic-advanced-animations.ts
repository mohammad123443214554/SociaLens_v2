import type { TextAnimationDefinition } from './animation-engine'

type Frame = {
  at: number
  opacity?: number
  translateX?: number
  translateY?: number
  scaleX?: number
  scaleY?: number
  rotate?: number
  rotateX?: number
  rotateY?: number
  skewX?: number
  skewY?: number
  blur?: number
  letterSpacing?: number
}
type Preset = {
  name: string
  description: string
  duration: number
  mode?: 'entrance' | 'exit' | 'loop'
  frames: readonly Frame[]
}

/**
 * Artistic & Advanced presets use deterministic keyframes shared by preview
 * and export. These are renderer-neutral motion treatments; they do not
 * pretend to generate raster paint, particles, or fluid simulations.
 */
const presets: readonly Preset[] = [
  { name: 'Ink Bloom', description: 'An ink-inspired soft expansion that blooms into a crisp title.', duration: 1450, frames: [{ at: 0, opacity: 0, scaleX: 0.72, scaleY: 0.78, blur: 9 }, { at: 0.58, opacity: 1, scaleX: 1.06, scaleY: 1.04, blur: 2 }, { at: 1, opacity: 1, scaleX: 1, scaleY: 1, blur: 0 }] },
  { name: 'Watercolor Wash', description: 'A gentle translucent-feeling arrival with a soft wash-like focus transition.', duration: 1650, frames: [{ at: 0, opacity: 0, scaleX: 0.96, scaleY: 1.08, blur: 12 }, { at: 0.52, opacity: 0.82, scaleX: 1.02, scaleY: 0.99, blur: 4 }, { at: 1, opacity: 1, scaleX: 1, scaleY: 1, blur: 0 }] },
  { name: 'Brush Stroke Reveal', description: 'A brisk brush-inspired directional entrance with a decisive, clean finish.', duration: 1200, frames: [{ at: 0, opacity: 0, translateX: -32, skewX: -12, scaleX: 0.9 }, { at: 0.55, opacity: 1, translateX: 4, skewX: 3, scaleX: 1.02 }, { at: 1, opacity: 1, translateX: 0, skewX: 0, scaleX: 1 }] },
  { name: 'Paper Cut Lift', description: 'A layered-paper impression created by a subtle lift, tilt and settle.', duration: 1350, frames: [{ at: 0, opacity: 0, translateY: 20, rotateX: -18, scaleY: 0.94 }, { at: 0.62, opacity: 1, translateY: -2, rotateX: 3, scaleY: 1.01 }, { at: 1, opacity: 1, translateY: 0, rotateX: 0, scaleY: 1 }] },
  { name: 'Origami Unfold', description: 'A folded-card style 3D opening that resolves into a front-facing title.', duration: 1550, frames: [{ at: 0, opacity: 0, rotateY: -82, rotateX: 12, scaleX: 0.82 }, { at: 0.62, opacity: 1, rotateY: 7, rotateX: -2, scaleX: 1.03 }, { at: 1, opacity: 1, rotateY: 0, rotateX: 0, scaleX: 1 }] },
  { name: 'Liquid Morph', description: 'A fluid-inspired stretch and compression that settles without changing the text.', duration: 1400, frames: [{ at: 0, opacity: 0, scaleX: 0.68, scaleY: 1.18, skewX: -8 }, { at: 0.42, opacity: 1, scaleX: 1.12, scaleY: 0.92, skewX: 5 }, { at: 0.72, opacity: 1, scaleX: 0.98, scaleY: 1.03, skewX: -2 }, { at: 1, opacity: 1, scaleX: 1, scaleY: 1, skewX: 0 }] },
  { name: 'Smoke Drift', description: 'A slow, softened drift that emerges from a diffuse, atmospheric state.', duration: 1800, frames: [{ at: 0, opacity: 0, translateY: 16, translateX: -8, blur: 14, scaleX: 1.04 }, { at: 0.62, opacity: 0.9, translateY: -2, translateX: 2, blur: 3 }, { at: 1, opacity: 1, translateY: 0, translateX: 0, blur: 0, scaleX: 1 }] },
  { name: 'Dust Motes', description: 'A delicate floating arrival with a light scale change and soft focus recovery.', duration: 1700, frames: [{ at: 0, opacity: 0, translateY: 12, translateX: 5, scaleX: 0.94, scaleY: 0.94, blur: 6 }, { at: 0.58, opacity: 1, translateY: -3, translateX: -2, scaleX: 1.02, scaleY: 1.02, blur: 1 }, { at: 1, opacity: 1, translateY: 0, translateX: 0, scaleX: 1, scaleY: 1, blur: 0 }] },
  { name: 'Confetti Flourish', description: 'A celebratory pop with a controlled rotational flourish and soft landing.', duration: 1250, frames: [{ at: 0, opacity: 0, scaleX: 0.62, scaleY: 0.62, rotate: -12, translateY: 10 }, { at: 0.58, opacity: 1, scaleX: 1.08, scaleY: 1.08, rotate: 4, translateY: -2 }, { at: 1, opacity: 1, scaleX: 1, scaleY: 1, rotate: 0, translateY: 0 }] },
  { name: 'Ribbon Sweep', description: 'A graceful sweeping motion with a slight skew that straightens into place.', duration: 1450, frames: [{ at: 0, opacity: 0, translateX: -38, rotate: -5, skewY: 8 }, { at: 0.56, opacity: 1, translateX: 5, rotate: 1, skewY: -2 }, { at: 1, opacity: 1, translateX: 0, rotate: 0, skewY: 0 }] },
  { name: 'Calligraphy Draw', description: 'A measured calligraphic-style reveal suggested through tracking and gentle rise.', duration: 1900, frames: [{ at: 0, opacity: 0, letterSpacing: 9, translateY: 7, scaleX: 0.96 }, { at: 0.7, opacity: 1, letterSpacing: -0.8, translateY: -1, scaleX: 1.01 }, { at: 1, opacity: 1, letterSpacing: 0, translateY: 0, scaleX: 1 }] },
  { name: 'Ink Bleed', description: 'A soft-edged ink impression that gradually sharpens and reaches full opacity.', duration: 1750, frames: [{ at: 0, opacity: 0, blur: 16, scaleX: 1.08, scaleY: 0.94 }, { at: 0.48, opacity: 0.76, blur: 7, scaleX: 0.98, scaleY: 1.04 }, { at: 1, opacity: 1, blur: 0, scaleX: 1, scaleY: 1 }] },
  { name: 'Stencil Reveal', description: 'A precise, mechanical-feeling reveal using a compact vertical compression.', duration: 1150, frames: [{ at: 0, opacity: 0, scaleY: 0.12, translateY: 5 }, { at: 0.48, opacity: 1, scaleY: 1.06, translateY: -1 }, { at: 1, opacity: 1, scaleY: 1, translateY: 0 }] },
  { name: 'Halftone Bloom', description: 'A graphic-print inspired scale bloom with a clean final silhouette.', duration: 1300, frames: [{ at: 0, opacity: 0, scaleX: 0.78, scaleY: 0.78, rotate: -3 }, { at: 0.52, opacity: 1, scaleX: 1.07, scaleY: 1.07, rotate: 1 }, { at: 1, opacity: 1, scaleX: 1, scaleY: 1, rotate: 0 }] },
  { name: 'Mosaic Assemble', description: 'A mosaic-inspired assembly impression using a controlled scale and focus transition.', duration: 1600, frames: [{ at: 0, opacity: 0, scaleX: 0.84, scaleY: 0.84, blur: 10, rotate: 2 }, { at: 0.58, opacity: 1, scaleX: 1.03, scaleY: 1.03, blur: 2, rotate: -1 }, { at: 1, opacity: 1, scaleX: 1, scaleY: 1, blur: 0, rotate: 0 }] },
  { name: 'Kaleidoscope Turn', description: 'A dimensional turning entrance with a measured rotation and a stable finish.', duration: 1500, frames: [{ at: 0, opacity: 0, rotate: -22, rotateY: 38, scaleX: 0.9, scaleY: 0.9 }, { at: 0.62, opacity: 1, rotate: 4, rotateY: -5, scaleX: 1.03, scaleY: 1.03 }, { at: 1, opacity: 1, rotate: 0, rotateY: 0, scaleX: 1, scaleY: 1 }] },
  { name: 'Prism Refraction', description: 'A refracted-light impression suggested by a short skew and perspective settle.', duration: 1400, frames: [{ at: 0, opacity: 0, skewX: 14, skewY: -5, rotateY: 18, blur: 5 }, { at: 0.54, opacity: 1, skewX: -4, skewY: 2, rotateY: -4, blur: 1 }, { at: 1, opacity: 1, skewX: 0, skewY: 0, rotateY: 0, blur: 0 }] },
  { name: 'Aurora Drift', description: 'A slow atmospheric drift with a restrained tilt and seamless looping endpoints.', duration: 3600, mode: 'loop', frames: [{ at: 0, opacity: 0.92, translateX: -5, translateY: 2, rotate: -1 }, { at: 0.5, opacity: 1, translateX: 5, translateY: -2, rotate: 1 }, { at: 1, opacity: 0.92, translateX: -5, translateY: 2, rotate: -1 }] },
  { name: 'Silk Wave', description: 'A graceful, low-amplitude wave-like sway that returns exactly to its starting pose.', duration: 3000, mode: 'loop', frames: [{ at: 0, translateY: 0, skewX: -2 }, { at: 0.5, translateY: -4, skewX: 2 }, { at: 1, translateY: 0, skewX: -2 }] },
  { name: 'Sculpted Depth', description: 'A sculptural 3D entrance with shallow perspective and a polished front-facing settle.', duration: 1650, frames: [{ at: 0, opacity: 0, rotateX: 32, rotateY: -18, translateY: 14, scaleX: 0.92, scaleY: 0.92 }, { at: 0.62, opacity: 1, rotateX: -4, rotateY: 3, translateY: -2, scaleX: 1.02, scaleY: 1.02 }, { at: 1, opacity: 1, rotateX: 0, rotateY: 0, translateY: 0, scaleX: 1, scaleY: 1 }] },
  { name: 'Glass Shimmer', description: 'A refined glass-like focus shimmer with a restrained opacity and blur transition.', duration: 1500, frames: [{ at: 0, opacity: 0.2, blur: 10, scaleX: 1.03, scaleY: 1.03 }, { at: 0.38, opacity: 1, blur: 1, scaleX: 0.99, scaleY: 0.99 }, { at: 0.68, opacity: 0.88, blur: 2 }, { at: 1, opacity: 1, blur: 0, scaleX: 1, scaleY: 1 }] },
  { name: 'Foil Press', description: 'A premium stamped-title impression with a brief compression and precise release.', duration: 1250, frames: [{ at: 0, opacity: 0, scaleX: 1.08, scaleY: 0.78, translateY: -5 }, { at: 0.42, opacity: 1, scaleX: 0.98, scaleY: 1.06, translateY: 2 }, { at: 1, opacity: 1, scaleX: 1, scaleY: 1, translateY: 0 }] },
  { name: 'Charcoal Sketch', description: 'A hand-drawn sketch impression that emerges from softened focus and settles clearly.', duration: 1800, frames: [{ at: 0, opacity: 0, translateX: -4, translateY: 5, blur: 8, skewX: -2 }, { at: 0.35, opacity: 0.72, translateX: 3, translateY: -2, blur: 4, skewX: 1 }, { at: 0.72, opacity: 1, translateX: -1, translateY: 1, blur: 1, skewX: -0.5 }, { at: 1, opacity: 1, translateX: 0, translateY: 0, blur: 0, skewX: 0 }] },
  { name: 'Paint Splash Exit', description: 'A paint-inspired expressive exit with a short outward stretch and soft fade.', duration: 1200, mode: 'exit', frames: [{ at: 0, opacity: 1, scaleX: 1, scaleY: 1 }, { at: 0.48, opacity: 0.88, scaleX: 1.12, scaleY: 0.92, rotate: 3, blur: 1 }, { at: 1, opacity: 0, scaleX: 0.82, scaleY: 1.12, rotate: -5, blur: 8 }] },
  { name: 'Paper Crumple Exit', description: 'A paper-like exit suggested by a compact skew, tilt and gradual contraction.', duration: 1350, mode: 'exit', frames: [{ at: 0, opacity: 1, scaleX: 1, scaleY: 1, rotate: 0, skewX: 0 }, { at: 0.52, opacity: 0.82, scaleX: 0.94, scaleY: 0.94, rotate: 7, skewX: -7 }, { at: 1, opacity: 0, scaleX: 0.72, scaleY: 0.78, rotate: -12, skewX: 10, blur: 5 }] },
]
export const ARTISTIC_ADVANCED_ANIMATIONS: readonly TextAnimationDefinition[] = presets.map((preset, index) => ({
  id: 'artistic-' + (276 + index),
  name: preset.name,
  description: preset.description,
  category: 'Artistic & Advanced',
  mode: preset.mode ?? 'entrance',
  defaultDurationMs: preset.duration,
  defaultEasing: 'premium-out',
  compositing: 'replace',
  keyframes: preset.frames,
}))
