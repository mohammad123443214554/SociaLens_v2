export type StudioColorReplacement = { source: string; target: string }

export const STUDIO_REPLACEMENT_SWATCHES = [
  '#FF2D55', '#FF4F8B', '#E91E63', '#C026D3', '#9333EA',
  '#6D28D9', '#4F46E5', '#2563EB', '#0284C7', '#06B6D4',
  '#0D9488', '#16A34A', '#65A30D', '#EAB308', '#F59E0B',
  '#F97316', '#EF4444', '#FFFFFF', '#9CA3AF', '#111827',
] as const

const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)))
const hexToRgb = (hex: string) => {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!match) return null
  const value = match[1]
  return { r: parseInt(value.slice(0, 2), 16), g: parseInt(value.slice(2, 4), 16), b: parseInt(value.slice(4, 6), 16) }
}
const rgbToHex = (r: number, g: number, b: number) => '#' + [r, g, b].map(value => clampByte(value).toString(16).padStart(2, '0')).join('')

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
  const rgbToHsv = (rgb: { r: number; g: number; b: number }) => {
    const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min
    let hue = 0
    if (delta > 0) {
      if (max === r) hue = 60 * (((g - b) / delta) % 6)
      else if (max === g) hue = 60 * ((b - r) / delta + 2)
      else hue = 60 * ((r - g) / delta + 4)
    }
    return { h: (hue + 360) % 360, s: max === 0 ? 0 : delta / max, v: max }
  }
  const parsed = replacements
    .map(item => {
      const source = hexToRgb(item.source), target = hexToRgb(item.target)
      return source && target ? { source, target, hsv: rgbToHsv(source) } : null
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
  if (!parsed.length) return output

  // A palette swatch represents a gradient family, not one exact RGB value.
  // Hue matching captures the darker/lighter shades and anti-aliased pixels
  // that the previous narrow RGB radius left unchanged.
  for (let index = 0; index < output.length; index += 4) {
    if (output[index + 3] < 8) continue
    const pixel = { r: output[index], g: output[index + 1], b: output[index + 2] }
    const hsv = rgbToHsv(pixel)
    let best: typeof parsed[number] | null = null
    let bestScore = Infinity
    for (const candidate of parsed) {
      let score = Infinity
      if (candidate.hsv.s >= 0.12) {
        if (hsv.s < 0.055) continue
        const rawHueDiff = Math.abs(hsv.h - candidate.hsv.h)
        const hueDiff = Math.min(rawHueDiff, 360 - rawHueDiff)
        if (hueDiff > 52) continue
        score = hueDiff / 52 + Math.abs(hsv.s - candidate.hsv.s) * 0.28 + Math.abs(hsv.v - candidate.hsv.v) * 0.12
      } else {
        const distance = Math.hypot(pixel.r - candidate.source.r, pixel.g - candidate.source.g, pixel.b - candidate.source.b)
        if (distance > 105) continue
        score = distance / 105 + 1
      }
      if (score < bestScore) { bestScore = score; best = candidate }
    }
    if (!best) continue
    // Use the exact requested target while retaining source alpha.
    output[index] = best.target.r
    output[index + 1] = best.target.g
    output[index + 2] = best.target.b
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
