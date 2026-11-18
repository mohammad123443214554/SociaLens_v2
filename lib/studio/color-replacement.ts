export type StudioColorReplacement = { source: string; target: string }

export const STUDIO_REPLACEMENT_SWATCHES = [
  '#FF2D55', '#FF4F8B', '#E91E63', '#C026D3', '#9333EA',
  '#6D28D9', '#4F46E5', '#2563EB', '#0284C7', '#06B6D4',
  '#0D9488', '#16A34A', '#65A30D', '#EAB308', '#F59E0B',
  '#F97316', '#EF4444', '#FFFFFF', '#9CA3AF', '#111827',
] as const

type RGB = { r: number; g: number; b: number }
type Oklab = { L: number; a: number; b: number; chroma: number; hue: number }

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)))
const hexToRgb = (hex: string): RGB | null => {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!match) return null
  const value = match[1]
  return { r: parseInt(value.slice(0, 2), 16), g: parseInt(value.slice(2, 4), 16), b: parseInt(value.slice(4, 6), 16) }
}
const rgbToHex = (r: number, g: number, b: number) => '#' + [r, g, b].map(value => clampByte(value).toString(16).padStart(2, '0')).join('')

function srgbToLinear(value: number): number {
  const channel = value / 255
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
}

function linearToSrgb(value: number): number {
  const channel = value <= 0.0031308 ? value * 12.92 : 1.055 * Math.pow(Math.max(0, value), 1 / 2.4) - 0.055
  return clamp(channel, 0, 1)
}

// OKLab keeps perceptual lightness separate from chroma, which lets recolouring
// change the material colour without flattening the original highlights/shadows.
function rgbToOklab(rgb: RGB): Oklab {
  const r = srgbToLinear(rgb.r), g = srgbToLinear(rgb.g), b = srgbToLinear(rgb.b)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const labB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { L, a, b: labB, chroma: Math.hypot(a, labB), hue: Math.atan2(labB, a) }
}

function oklabToLinearRgb(L: number, a: number, b: number): RGB {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3)
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3)
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3)
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  }
}

function oklabToRgb(L: number, hue: number, chroma: number): RGB {
  const safeL = clamp(L, 0.001, 0.999)
  const toLinear = (C: number) => oklabToLinearRgb(safeL, Math.cos(hue) * C, Math.sin(hue) * C)
  let rgb = toLinear(Math.max(0, chroma))
  const inGamut = (value: RGB) => value.r >= 0 && value.r <= 1 && value.g >= 0 && value.g <= 1 && value.b >= 0 && value.b <= 1
  // Reduce chroma (not lightness) when a requested hue is outside sRGB gamut.
  if (!inGamut(rgb)) {
    let low = 0, high = Math.max(0, chroma)
    for (let i = 0; i < 12; i++) {
      const middle = (low + high) / 2
      const candidate = toLinear(middle)
      if (inGamut(candidate)) { low = middle; rgb = candidate } else high = middle
    }
  }
  return {
    r: clampByte(linearToSrgb(rgb.r) * 255),
    g: clampByte(linearToSrgb(rgb.g) * 255),
    b: clampByte(linearToSrgb(rgb.b) * 255),
  }
}

function hueDistance(a: number, b: number): number {
  const difference = Math.abs(a - b)
  return Math.min(difference, Math.PI * 2 - difference)
}

export function extractStudioImagePalette(image: HTMLImageElement, limit = 20): string[] {
  if (!image.complete || !image.naturalWidth || !image.naturalHeight) return []
  const sample = document.createElement('canvas')
  const scale = Math.min(1, 128 / Math.max(image.naturalWidth, image.naturalHeight))
  sample.width = Math.max(1, Math.round(image.naturalWidth * scale))
  sample.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = sample.getContext('2d', { willReadFrequently: true })
  if (!context) return []
  try {
    context.drawImage(image, 0, 0, sample.width, sample.height)
    const pixels = context.getImageData(0, 0, sample.width, sample.height).data
    const bins = new Map<string, { r: number; g: number; b: number; count: number }>()
    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3]
      if (alpha < 96) continue
      const r = pixels[index], g = pixels[index + 1], b = pixels[index + 2]
      const key = [r >> 3, g >> 3, b >> 3].join(':')
      const bin = bins.get(key) || { r: 0, g: 0, b: 0, count: 0 }
      bin.r += r; bin.g += g; bin.b += b; bin.count += 1
      bins.set(key, bin)
    }
    const candidates = [...bins.values()].sort((a, b) => b.count - a.count)
    const palette: string[] = []
    for (const bin of candidates) {
      const color = rgbToHex(bin.r / bin.count, bin.g / bin.count, bin.b / bin.count)
      const rgb = hexToRgb(color)!
      const distinct = palette.every(existing => {
        const other = hexToRgb(existing)!
        return Math.hypot(rgb.r - other.r, rgb.g - other.g, rgb.b - other.b) >= 26
      })
      if (distinct) palette.push(color)
      if (palette.length >= limit) break
    }
    return palette
  } catch {
    return []
  }
}

export function recolorStudioPixelData(data: Uint8ClampedArray, replacements: StudioColorReplacement[]): Uint8ClampedArray {
  const output = new Uint8ClampedArray(data)
  const parsed = replacements
    .map(item => {
      const source = hexToRgb(item.source), target = hexToRgb(item.target)
      return source && target ? { source: rgbToOklab(source), target: rgbToOklab(target) } : null
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
  if (!parsed.length) return output

  for (let index = 0; index < output.length; index += 4) {
    if (output[index + 3] < 8) continue
    const pixel = rgbToOklab({ r: output[index], g: output[index + 1], b: output[index + 2] })
    let best: typeof parsed[number] | null = null
    let bestScore = Infinity

    for (const candidate of parsed) {
      let score: number
      if (candidate.source.chroma < 0.025) {
        const distance = Math.hypot(pixel.L - candidate.source.L, pixel.a - candidate.source.a, pixel.b - candidate.source.b)
        if (distance > 0.19) continue
        score = distance / 0.19 + 0.8
      } else {
        if (pixel.chroma < 0.006) continue
        const hue = hueDistance(pixel.hue, candidate.source.hue)
        if (hue > 0.92) continue
        // Hue identifies the colour family; chroma/lightness gently choose the
        // closest swatch without rejecting its darker and brighter gradient shades.
        score = hue / 0.92
          + Math.abs(pixel.chroma - candidate.source.chroma) * 1.35
          + Math.abs(pixel.L - candidate.source.L) * 0.12
      }
      if (score < bestScore) { bestScore = score; best = candidate }
    }

    if (!best || bestScore > 1.65) continue

    // Preserve each pixel's own light/dark structure. The small target-lightness
    // influence makes the chosen colour feel integrated without flattening gloss.
    const mappedLightness = clamp(pixel.L + (best.target.L - best.source.L) * 0.18, 0.015, 0.985)
    const chromaRatio = best.source.chroma > 0.025
      ? clamp(pixel.chroma / best.source.chroma, 0.18, 1.18)
      : 1
    const mappedChroma = best.target.chroma < 0.008 ? 0 : best.target.chroma * chromaRatio
    const recolored = oklabToRgb(mappedLightness, best.target.hue, mappedChroma)
    output[index] = recolored.r
    output[index + 1] = recolored.g
    output[index + 2] = recolored.b
  }
  return output
}

export function createStudioRecoloredCanvas(source: CanvasImageSource, replacements: StudioColorReplacement[]): HTMLCanvasElement {
  const dimensions = source as CanvasImageSource & { naturalWidth?: number; naturalHeight?: number; videoWidth?: number; videoHeight?: number; width?: number; height?: number }
  const width = dimensions.naturalWidth || dimensions.videoWidth || dimensions.width || 0
  const height = dimensions.naturalHeight || dimensions.videoHeight || dimensions.height || 0
  if (!width || !height) throw new Error('The selected image is not ready for colour editing.')
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas pixel processing is unavailable in this browser.')
  context.drawImage(source, 0, 0, width, height)
  if (!replacements.length) return canvas
  const imageData = context.getImageData(0, 0, width, height)
  imageData.data.set(recolorStudioPixelData(imageData.data, replacements))
  context.putImageData(imageData, 0, 0)
  return canvas
}
