export type StudioColorReplacement = { source: string; target: string }

const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)))
const hexToRgb = (hex: string) => {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!match) return null
  const value = match[1]
  return { r: parseInt(value.slice(0, 2), 16), g: parseInt(value.slice(2, 4), 16), b: parseInt(value.slice(4, 6), 16) }
}
const rgbToHex = (r: number, g: number, b: number) => '#' + [r, g, b].map(value => clampByte(value).toString(16).padStart(2, '0')).join('')

export function extractStudioImagePalette(image: HTMLImageElement, limit = 8): string[] {
  if (!image.complete || !image.naturalWidth || !image.naturalHeight) return []
  const sample = document.createElement('canvas')
  const scale = Math.min(1, 72 / Math.max(image.naturalWidth, image.naturalHeight))
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
      const key = [r >> 4, g >> 4, b >> 4].join(':')
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
        return Math.hypot(rgb.r - other.r, rgb.g - other.g, rgb.b - other.b) >= 34
      })
      if (distinct) palette.push(color)
      if (palette.length >= limit) break
    }
    return palette
  } catch {
    return []
  }
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
  const pixels = imageData.data
  const parsed = replacements.map(item => ({ source: hexToRgb(item.source), target: hexToRgb(item.target) })).filter(item => item.source && item.target) as Array<{ source: {r:number;g:number;b:number}; target: {r:number;g:number;b:number} }>
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 8) continue
    let best: typeof parsed[number] | null = null
    let bestDistance = Infinity
    for (const replacement of parsed) {
      const distance = Math.hypot(pixels[index] - replacement.source.r, pixels[index + 1] - replacement.source.g, pixels[index + 2] - replacement.source.b)
      if (distance < bestDistance) { bestDistance = distance; best = replacement }
    }
    const tolerance = 45
    if (!best || bestDistance > tolerance) continue
    const strength = Math.max(0, Math.min(1, (tolerance - bestDistance) / 18))
    const sourceLuma = best.source.r * 0.2126 + best.source.g * 0.7152 + best.source.b * 0.0722
    const pixelLuma = pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722
    const targetLuma = best.target.r * 0.2126 + best.target.g * 0.7152 + best.target.b * 0.0722
    const shade = sourceLuma > 1 ? Math.max(0.22, Math.min(1.85, pixelLuma / sourceLuma)) : 1
    const targetScale = targetLuma > 1 ? Math.max(0.22, Math.min(1.85, (pixelLuma / Math.max(1, sourceLuma)) * (sourceLuma / targetLuma))) : shade
    const scale = Math.max(0.22, Math.min(1.85, targetScale))
    pixels[index] = clampByte(pixels[index] * (1 - strength) + best.target.r * scale * strength)
    pixels[index + 1] = clampByte(pixels[index + 1] * (1 - strength) + best.target.g * scale * strength)
    pixels[index + 2] = clampByte(pixels[index + 2] * (1 - strength) + best.target.b * scale * strength)
  }
  context.putImageData(imageData, 0, 0)
  return canvas
}
