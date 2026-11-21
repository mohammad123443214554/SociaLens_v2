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

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const qualities = [0.94, 0.9, 0.86, 0.82]
    const encode = (index: number) => {
      canvas.toBlob(blob => {
        if (!blob) return reject(new Error('The browser could not encode the object crop for Stability AI.'))
        if (blob.size <= 3.8 * 1024 * 1024) return resolve(blob)
        if (index + 1 < qualities.length) return encode(index + 1)
        reject(new Error('An object crop is too large to send safely. Use a smaller photo or crop the source image first.'))
      }, 'image/jpeg', qualities[index])
    }
    encode(0)
  })
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
  includeCutouts = true,
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
      if (!includeCutouts) continue

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

    if (includeCutouts && !cutouts.length) throw new Error('Smart Cutout could not rasterize any object masks.')
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


export type SmartCutoutRefinementCrop = {
  id: string
  objectId: string
  label: string
  x: number
  y: number
  width: number
  height: number
  aiWidth: number
  aiHeight: number
  blob: Blob
}

/**
 * Creates a padded, source-resolution crop around each SAM3 instance.
 * The full photo pixels are retained in the crop so Stability can refine
 * fine edges (hair, leaves and thin stems) instead of being limited to the
 * coarse polygon alpha boundary.
 */
export async function createSmartCutoutRefinementCrops(
  source: CanvasImageSource,
  width: number,
  height: number,
  segmentations: SmartCutoutSegmentation[],
): Promise<SmartCutoutRefinementCrop[]> {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < 64 || height < 64 || width * height > 9_437_184
    || !Array.isArray(segmentations) || !segmentations.length || segmentations.length > 8) {
    throw new Error('Smart Cutout cannot prepare the selected object crops.')
  }

  const crops: SmartCutoutRefinementCrop[] = []
  const temporaryCanvases: HTMLCanvasElement[] = []
  try {
    for (const segmentation of segmentations) {
      const polygons = normalizeSmartCutoutPolygons(segmentation.polygons, width, height)
      if (!polygons.length) continue
      let minX = width
      let maxX = 0
      let minY = height
      let maxY = 0
      for (const polygon of polygons) {
        for (const point of polygon) {
          minX = Math.min(minX, point[0])
          maxX = Math.max(maxX, point[0])
          minY = Math.min(minY, point[1])
          maxY = Math.max(maxY, point[1])
        }
      }
      const subjectWidth = Math.max(1, maxX - minX)
      const subjectHeight = Math.max(1, maxY - minY)
      const padding = Math.max(18, Math.round(Math.max(subjectWidth, subjectHeight) * 0.18))
      let cropWidth = Math.min(width, Math.max(64, Math.ceil(subjectWidth + padding * 2)))
      let cropHeight = Math.min(height, Math.max(64, Math.ceil(subjectHeight + padding * 2)))
      // Stability Remove Background requires an aspect ratio between 1:2.5 and 2.5:1.
      if (cropWidth / cropHeight > 2.5) {
        cropHeight = Math.min(height, Math.ceil(cropWidth / 2.5))
        if (cropWidth / cropHeight > 2.5) cropWidth = Math.floor(cropHeight * 2.5)
      }
      if (cropHeight / cropWidth > 2.5) {
        cropWidth = Math.min(width, Math.ceil(cropHeight / 2.5))
        if (cropHeight / cropWidth > 2.5) cropHeight = Math.floor(cropWidth * 2.5)
      }
      cropWidth = Math.max(64, cropWidth)
      cropHeight = Math.max(64, cropHeight)
      const centerX = (minX + maxX) / 2
      const centerY = (minY + maxY) / 2
      const x = Math.max(0, Math.min(width - cropWidth, Math.round(centerX - cropWidth / 2)))
      const y = Math.max(0, Math.min(height - cropHeight, Math.round(centerY - cropHeight / 2)))
      // The Stability Remove Background endpoint has a 4-megapixel input cap.
      // Keep source-pixel placement separately so the returned matte can be
      // composited back into the exact original-size canvas without shifting.
      const scale = Math.min(1, Math.sqrt(4_194_304 / (cropWidth * cropHeight)))
      const aiWidth = Math.max(64, Math.floor(cropWidth * scale))
      const aiHeight = Math.max(64, Math.floor(cropHeight * scale))
      const canvas = createCanvas(aiWidth, aiHeight)
      temporaryCanvases.push(canvas)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Could not prepare an object crop for edge refinement.')
      context.drawImage(source, x, y, cropWidth, cropHeight, 0, 0, aiWidth, aiHeight)
      crops.push({
        id: segmentation.id,
        objectId: segmentation.objectId,
        label: segmentation.label,
        x, y, width: cropWidth, height: cropHeight, aiWidth, aiHeight,
        blob: await canvasToJpeg(canvas),
      })
    }
    if (!crops.length) throw new Error('Smart Cutout could not prepare any object crops.')
    return crops
  } finally {
    for (const canvas of temporaryCanvases) {
      canvas.width = 1
      canvas.height = 1
    }
  }
}

/**
 * Rebuilds a full-source transparent layer using the original photo's RGB
 * pixels and Stability's refined alpha matte. This prevents the AI service's
 * colour/lighting changes from making the extracted object look washed out.
 */
export async function composeSmartCutoutRefinedLayer(
  refinedBlob: Blob,
  source: CanvasImageSource,
  crop: Pick<SmartCutoutRefinementCrop, 'x' | 'y' | 'width' | 'height' | 'aiWidth' | 'aiHeight'>,
  sourceWidth: number,
  sourceHeight: number,
): Promise<Blob> {
  const bitmap = await createImageBitmap(refinedBlob)
  const output = createCanvas(sourceWidth, sourceHeight)
  const matte = createCanvas(crop.aiWidth, crop.aiHeight)
  try {
    if (bitmap.width !== crop.aiWidth || bitmap.height !== crop.aiHeight) {
      throw new Error('Stability AI changed an object crop size; exact layer alignment cannot be guaranteed.')
    }
    const outputContext = output.getContext('2d')
    const matteContext = matte.getContext('2d', { willReadFrequently: true })
    if (!outputContext || !matteContext) throw new Error('Could not rebuild the transparent object layer.')

    // Keep the exact source colours, texture, highlights and shadows.
    outputContext.drawImage(source, crop.x, crop.y, crop.width, crop.height, crop.x, crop.y, crop.width, crop.height)

    // Use only the AI-generated alpha matte, not its potentially altered RGB.
    matteContext.drawImage(bitmap, 0, 0, crop.aiWidth, crop.aiHeight)
    const mattePixels = matteContext.getImageData(0, 0, crop.aiWidth, crop.aiHeight)
    for (let index = 3; index < mattePixels.data.length; index += 4) {
      const alpha = mattePixels.data[index] / 255
      // Strengthen semi-transparent foreground interiors while retaining
      // soft antialiased edges and fully transparent background pixels.
      mattePixels.data[index] = Math.round((1 - (1 - alpha) * (1 - alpha)) * 255)
    }
    matteContext.putImageData(mattePixels, 0, 0)

    outputContext.globalCompositeOperation = 'destination-in'
    outputContext.drawImage(matte, crop.x, crop.y, crop.width, crop.height)
    outputContext.globalCompositeOperation = 'source-over'
    return await canvasToPng(output)
  } finally {
    bitmap.close()
    output.width = 1
    output.height = 1
    matte.width = 1
    matte.height = 1
  }
}
