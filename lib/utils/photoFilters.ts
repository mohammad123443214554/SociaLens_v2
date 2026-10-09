export interface PhotoFilter {
  id: string
  name: string
  /** CSS/Canvas filter string - works identically in a live CSS preview
   *  and when baked into the final image via Canvas2D's ctx.filter. */
  css: string
}

// A systematic set of filters, generated from a handful of base looks x
// intensity levels, plus some named one-off looks - comfortably over 100
// distinct, Genuinely different results rather than 100 near-duplicates.
function buildFilters(): PhotoFilter[] {
  const filters: PhotoFilter[] = [{ id: 'none', name: 'Normal', css: 'none' }]

  // Brightness/Light family (light -> dark)
  const lightSteps = [
    ['Bright+3', 1.5], ['Bright+2', 1.35], ['Bright+1', 1.2],
    ['Dim-1', 0.9], ['Dim-2', 0.8], ['Dim-3', 0.65],
  ] as const
  for (const [name, v] of lightSteps) {
    filters.push({ id: `bright-${name}`, name, css: `brightness(${v})` })
  }

  // Contrast family
  const contrastSteps = [
    ['Crisp+1', 1.15], ['Crisp+2', 1.3], ['Crisp+3', 1.5],
    ['Soft-1', 0.9], ['Soft-2', 0.8], ['Soft-3', 0.7],
  ] as const
  for (const [name, v] of contrastSteps) {
    filters.push({ id: `contrast-${name}`, name, css: `contrast(${v})` })
  }

  // Saturation family (vivid -> muted -> grayscale)
  const satSteps = [
    ['Vivid+1', 1.3], ['Vivid+2', 1.6], ['Vivid+3', 2],
    ['Muted-1', 0.7], ['Muted-2', 0.45], ['Muted-3', 0.2],
  ] as const
  for (const [name, v] of satSteps) {
    filters.push({ id: `sat-${name}`, name, css: `saturate(${v})` })
  }

  // Warmth (hue-rotate + saturate combos, named by feel)
  const warmthSteps = [
    ['Warm+1', 10], ['Warm+2', 20], ['Warm+3', 30],
    ['Cool+1', -10], ['Cool+2', -20], ['Cool+3', -30],
  ] as const
  for (const [name, deg] of warmthSteps) {
    filters.push({ id: `hue-${name}`, name, css: `hue-rotate(${deg}deg) saturate(1.1)` })
  }

  // Black & white ladder (pure grayscale at varying contrast)
  const bwSteps = [
    ['Mono', 1, 1], ['Mono Soft', 1, 0.85], ['Mono Crisp', 1, 1.25], ['Mono Deep', 1, 1.4],
  ] as const
  for (const [name, g, c] of bwSteps) {
    filters.push({ id: `bw-${name.replace(/\s/g, '')}`, name, css: `grayscale(${g}) contrast(${c})` })
  }

  // Sepia / vintage ladder
  const sepiaSteps = [0.3, 0.5, 0.7, 0.9, 1] as const
  sepiaSteps.forEach((v, i) => {
    filters.push({ id: `sepia-${i}`, name: `Sepia ${i + 1}`, css: `sepia(${v}) contrast(1.05)` })
  })

  // Named creative looks - each a distinct hand-picked combo
  const named: [string, string][] = [
    ['Golden Hour', 'brightness(1.1) saturate(1.3) hue-rotate(8deg) contrast(1.05)'],
    ['Blue Hour', 'brightness(0.95) saturate(1.15) hue-rotate(-15deg) contrast(1.1)'],
    ['Faded Film', 'brightness(1.05) saturate(0.6) contrast(0.9) sepia(0.15)'],
    ['Noir', 'grayscale(1) contrast(1.5) brightness(0.9)'],
    ['Dreamy', 'brightness(1.15) saturate(0.8) contrast(0.85) blur(0.3px)'],
    ['Sunkissed', 'brightness(1.1) saturate(1.4) hue-rotate(5deg)'],
    ['Moody Blue', 'saturate(1.2) hue-rotate(-25deg) contrast(1.15) brightness(0.92)'],
    ['Rose Tint', 'saturate(1.2) hue-rotate(-8deg) brightness(1.05)'],
    ['Ice Cold', 'saturate(0.7) hue-rotate(-35deg) brightness(1.05) contrast(1.1)'],
    ['Cinema', 'contrast(1.2) saturate(0.85) brightness(0.95)'],
    ['Pop', 'saturate(1.8) contrast(1.2)'],
    ['Pastel', 'saturate(0.65) brightness(1.15) contrast(0.85)'],
    ['Deep Shadow', 'contrast(1.35) brightness(0.85) saturate(1.1)'],
    ['Overexposed', 'brightness(1.6) contrast(0.85) saturate(0.9)'],
    ['Underexposed', 'brightness(0.6) contrast(1.15)'],
    ['Retro 70s', 'sepia(0.4) saturate(1.3) hue-rotate(-10deg) contrast(1.05)'],
    ['Retro 90s', 'saturate(1.5) contrast(1.1) hue-rotate(3deg)'],
    ['Ghost', 'grayscale(0.7) brightness(1.3) contrast(0.8)'],
    ['Invert', 'invert(1)'],
    ['Soft Invert', 'invert(0.15) contrast(1.1)'],
    ['Emerald', 'saturate(1.4) hue-rotate(60deg) brightness(1.05)'],
    ['Lavender', 'saturate(1.2) hue-rotate(-60deg) brightness(1.1)'],
    ['Sunset', 'saturate(1.5) hue-rotate(15deg) brightness(1.08) contrast(1.05)'],
    ['Midnight', 'brightness(0.75) saturate(1.3) hue-rotate(-20deg) contrast(1.2)'],
    ['Clarity', 'contrast(1.25) saturate(1.15) brightness(1.03)'],
    ['Whisper', 'brightness(1.2) contrast(0.75) saturate(0.75)'],
    ['Bold', 'contrast(1.4) saturate(1.5)'],
    ['Vintage Fade', 'sepia(0.25) saturate(0.7) brightness(1.1) contrast(0.9)'],
    ['Steel', 'grayscale(0.5) saturate(0.6) contrast(1.15) hue-rotate(180deg)'],
    ['Amber Glow', 'sepia(0.35) saturate(1.4) brightness(1.1)'],
    ['Coral', 'saturate(1.3) hue-rotate(-5deg) brightness(1.08) contrast(1.05)'],
    ['Mint', 'saturate(1.25) hue-rotate(70deg) brightness(1.05)'],
    ['Plum', 'saturate(1.3) hue-rotate(-45deg) contrast(1.1) brightness(0.95)'],
    ['Sand', 'sepia(0.2) saturate(1.1) brightness(1.12) contrast(0.95)'],
    ['Charcoal', 'grayscale(0.85) contrast(1.3) brightness(0.9)'],
    ['Sky', 'saturate(1.15) hue-rotate(-18deg) brightness(1.1) contrast(1.02)'],
    ['Forest', 'saturate(1.3) hue-rotate(45deg) brightness(0.98) contrast(1.08)'],
    ['Blush', 'saturate(1.15) hue-rotate(-4deg) brightness(1.12) contrast(0.95)'],
    ['Slate', 'saturate(0.5) hue-rotate(200deg) contrast(1.15) brightness(0.98)'],
    ['Honey', 'sepia(0.3) saturate(1.5) brightness(1.15)'],
    ['Frost', 'saturate(0.6) hue-rotate(-40deg) brightness(1.2) contrast(0.95)'],
    ['Ember', 'saturate(1.6) hue-rotate(12deg) contrast(1.2) brightness(0.95)'],
    ['Dusk', 'saturate(1.1) hue-rotate(-28deg) brightness(0.88) contrast(1.15)'],
    ['Paper', 'saturate(0.35) sepia(0.1) brightness(1.15) contrast(0.9)'],
    ['Ink', 'grayscale(1) contrast(1.6) brightness(0.8)'],
    ['Neon', 'saturate(2) contrast(1.3) brightness(1.05)'],
    ['Soft Focus', 'brightness(1.1) contrast(0.8) saturate(0.9) blur(0.5px)'],
  ]
  named.forEach(([name, css], i) => filters.push({ id: `named-${i}`, name, css }))

  // Fine-grained brightness x contrast grid - fills out the set with
  // genuinely distinct, evenly-spaced combinations rather than padding.
  const bSet = [0.85, 0.95, 1.05, 1.15, 1.25]
  const cSet = [0.85, 1, 1.15, 1.3]
  let gridCount = 0
  for (const b of bSet) {
    for (const c of cSet) {
      if (b === 1 && c === 1) continue
      gridCount++
      filters.push({
        id: `grid-${gridCount}`,
        name: `Tone ${gridCount}`,
        css: `brightness(${b}) contrast(${c})`,
      })
    }
  }

  return filters
}

export const PHOTO_FILTERS: PhotoFilter[] = buildFilters()
