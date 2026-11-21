export type SmartCutoutElementTransform = {
  x: number
  y: number
  width: number
  height: number
  cropLeft?: number
  cropRight?: number
  cropTop?: number
  cropBottom?: number
  rotation?: number
  timelineStart: number
  trimStart: number
  trimEnd: number
  duration: number
}

export type SmartCutoutLayerAsset = {
  id: string
  name: string
  url: string
  storagePath: string
  fileSize: number
  objectId?: string
  label?: string
}

export type SmartCutoutAlignedLayer =
  SmartCutoutElementTransform & SmartCutoutLayerAsset & {
    kind: 'image'
    smartCutoutGroupId: string
    smartCutoutRole: 'background' | 'object'
    smartCutoutSourceElementId: string
    smartCutoutObjectId?: string
    smartCutoutObjectLabel?: string
  }

export type SmartCutoutPixelBounds = {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The Studio stores image element placement in percentages of the composition.
 * Smart Cutout PNGs retain the complete source-photo canvas, so every output
 * layer must inherit the exact same transform and crop values as its source.
 * The source element itself is never mutated or replaced by this helper.
 */
export function createSmartCutoutAlignedLayers(
  source: SmartCutoutElementTransform & { id: string; kind: 'image' },
  groupId: string,
  background: SmartCutoutLayerAsset,
  objects: SmartCutoutLayerAsset[],
): SmartCutoutAlignedLayer[] {
  if (!source.id || !groupId || !background.storagePath || !background.url || !background.id) {
    throw new Error('Smart Cutout needs a source image, group ID and saved background plate.')
  }
  if (!Array.isArray(objects) || !objects.length || objects.length > 32) {
    throw new Error('Smart Cutout needs between 1 and 32 saved object cutouts.')
  }
  const allAssets = [background, ...objects]
  const ids = new Set<string>()
  for (const asset of allAssets) {
    if (!asset.id || ids.has(asset.id) || !asset.storagePath || !asset.url || !asset.name
      || !Number.isFinite(asset.fileSize) || asset.fileSize <= 0) {
      throw new Error('A Smart Cutout output asset is missing valid saved image details.')
    }
    ids.add(asset.id)
  }

  const transform = {
    x: source.x,
    y: source.y,
    width: source.width,
    height: source.height,
    cropLeft: source.cropLeft || 0,
    cropRight: source.cropRight || 0,
    cropTop: source.cropTop || 0,
    cropBottom: source.cropBottom || 0,
    rotation: source.rotation || 0,
    timelineStart: source.timelineStart,
    trimStart: source.trimStart,
    trimEnd: source.trimEnd,
    duration: source.duration,
  }

  if (![transform.x, transform.y, transform.width, transform.height, transform.timelineStart,
    transform.trimStart, transform.trimEnd, transform.duration, transform.rotation,
    transform.cropLeft, transform.cropRight, transform.cropTop, transform.cropBottom].every(Number.isFinite)
    || transform.width <= 0 || transform.height <= 0 || transform.duration <= 0
    || transform.trimEnd <= transform.trimStart
    || transform.cropLeft < 0 || transform.cropRight < 0 || transform.cropTop < 0 || transform.cropBottom < 0
    || transform.cropLeft + transform.cropRight >= 1
    || transform.cropTop + transform.cropBottom >= 1) {
    throw new Error('The source photo has invalid placement or crop settings. Smart Cutout was not applied.')
  }

  return [
    {
      ...transform,
      ...background,
      kind: 'image',
      smartCutoutGroupId: groupId,
      smartCutoutRole: 'background',
      smartCutoutSourceElementId: source.id,
    },
    ...objects.map(asset => ({
      ...transform,
      ...asset,
      kind: 'image' as const,
      smartCutoutGroupId: groupId,
      smartCutoutRole: 'object' as const,
      smartCutoutSourceElementId: source.id,
      smartCutoutObjectId: asset.objectId,
      smartCutoutObjectLabel: asset.label,
    })),
  ]
}

/**
 * Converts an image element's percentage placement to composition pixels.
 * Crop is applied symmetrically to the full-resolution PNG source and the
 * destination rectangle, matching the Studio preview/export calculations.
 */
export function getSmartCutoutPixelBounds(
  transform: SmartCutoutElementTransform,
  canvasWidth: number,
  canvasHeight: number,
): SmartCutoutPixelBounds {
  if (![canvasWidth, canvasHeight].every(Number.isFinite) || canvasWidth <= 0 || canvasHeight <= 0) {
    throw new Error('The Studio composition dimensions are invalid.')
  }
  const left = Math.min(0.95, Math.max(0, transform.cropLeft || 0))
  const right = Math.min(0.95 - left, Math.max(0, transform.cropRight || 0))
  const top = Math.min(0.95, Math.max(0, transform.cropTop || 0))
  const bottom = Math.min(0.95 - top, Math.max(0, transform.cropBottom || 0))
  return {
    x: canvasWidth * (transform.x + transform.width * left) / 100,
    y: canvasHeight * (transform.y + transform.height * top) / 100,
    width: canvasWidth * transform.width * (1 - left - right) / 100,
    height: canvasHeight * transform.height * (1 - top - bottom) / 100,
  }
}
