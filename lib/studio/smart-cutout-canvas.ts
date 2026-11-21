import { normalizeSmartCutoutPolygons } from '@/lib/studio/smart-cutout-processing'
import type { SmartCutoutSegmentation } from '@/lib/studio/smart-cutout'

export type SmartCutoutRaster = {
  id: string
  objectId: string
  label: string
  confidence: number
  blob: Blob
}

export type SmartCutoutRasterBundle = {
  width: number
  height: number
  cutouts: SmartCutoutRaster[]
  combinedMask: Blob
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('The browser could not encode a Smart Cutout PNG.'))
    }, 'image/png')
  })
}

function paintPolygons(context: CanvasRenderingContext2D, polygons: number[][][], color: string) {
  context.beginPath()
  for (const polygon of polygons) {
    if (polygon.length < 3) continue
    context.moveTo(polygon[0][0], polygon[0][1])
    for (let index = 1; index < polygon.length; index++) {
      context.lineTo(polygon[index][0], polygon[index][1])
    }
    context.closePath()
  }
  context.fillStyle = color
  context.fill('evenodd')
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

/**
 * Rasterizes masks at source-native dimensions. Temporary canvases are always
 * released, including when PNG encoding or an individual canvas allocation fails.
 */
export async function createSmartCutoutRasterBundle(
  source: CanvasImageSource,
  width: number,
  height: number,
  segmentations: SmartCutoutSegmentation[],
): Promise<SmartCutoutRasterBundle> {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < 64 || height < 64 || width * height > 9_437_184) {
    throw new Error('The source photo dimensions are not supported for Smart Cutout.')
  }
  if (!Array.isArray(segmentations) || !segmentations.length || segmentations.length > 32) {
    throw new Error('Smart Cutout needs between 1 and 32 usable object masks.')
  }

  const temporaryCanvases: HTMLCanvasElement[] = []
  try {
    const combined = createCanvas(width, height)
    temporaryCanvases.push(combined)
    const combinedContext = combined.getContext('2d', { alpha: false })
    if (!combinedContext) throw new Error('Could not create the combined Smart Cutout mask.')
    combinedContext.fillStyle = '#000'
    combinedContext.fillRect(0, 0, width, height)

    const cutouts: SmartCutoutRaster[] = []
    for (const segmentation of segmentations) {
      const polygons = normalizeSmartCutoutPolygons(segmentation.polygons, width, height)
      if (!polygons.length) continue

      paintPolygons(combinedContext, polygons, '#fff')

      const alpha = createCanvas(width, height)
      temporaryCanvases.push(alpha)
      const alphaContext = alpha.getContext('2d')
      if (!alphaContext) throw new Error('Could not create an object transparency mask.')
      paintPolygons(alphaContext, polygons, '#fff')

      const cutout = createCanvas(width, height)
      temporaryCanvases.push(cutout)
      const cutoutContext = cutout.getContext('2d')
      if (!cutoutContext) throw new Error('Could not create a transparent object layer.')
      cutoutContext.drawImage(source, 0, 0, width, height)
      cutoutContext.globalCompositeOperation = 'destination-in'
      cutoutContext.filter = 'blur(0.55px)'
      cutoutContext.drawImage(alpha, 0, 0)
      cutoutContext.filter = 'none'
      cutoutContext.globalCompositeOperation = 'source-over'

      cutouts.push({
        id: segmentation.id,
        objectId: segmentation.objectId,
        label: segmentation.label,
        confidence: segmentation.confidence,
        blob: await canvasToPng(cutout),
      })
    }

    if (!cutouts.length) throw new Error('Smart Cutout could not rasterize any object masks.')
    const combinedMask = await canvasToPng(combined)
    return { width, height, cutouts, combinedMask }
  } finally {
    // A 4K canvas can retain tens of megabytes. Release every temporary surface
    // even when one mask or PNG conversion fails part-way through the batch.
    for (const canvas of temporaryCanvases) {
      canvas.width = 1
      canvas.height = 1
    }
  }
}
