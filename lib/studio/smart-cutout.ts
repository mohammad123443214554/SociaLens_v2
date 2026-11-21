export const SMART_CUTOUT_MAX_OBJECTS = 8

export type SmartCutoutImportance = 'high' | 'medium'
export type SmartCutoutObject = {
  id: string
  label: string
  importance: SmartCutoutImportance
  reason: string
}
export type SmartCutoutSegmentation = {
  id: string
  objectId: string
  label: string
  importance: SmartCutoutImportance
  confidence: number
  polygons: number[][][]
  instanceIndex: number
}

const GENERIC_LABELS = new Set([
  'object', 'thing', 'item', 'subject', 'foreground', 'background',
  'scene', 'detail', 'texture', 'shadow', 'reflection', 'person part',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeLabel(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().replace(/^[\s"'\`]+|[\s"'\`.,;:]+$/g, '').slice(0, 80)
}

export function normalizeSmartCutoutObjects(value: unknown): SmartCutoutObject[] {
  const source = isRecord(value) && Array.isArray(value.objects) ? value.objects : []
  const seen = new Set<string>()
  const objects: SmartCutoutObject[] = []

  for (const entry of source) {
    if (!isRecord(entry)) continue
    const label = normalizeLabel(entry.label)
    const key = label.toLocaleLowerCase()
    if (!label || GENERIC_LABELS.has(key) || seen.has(key)) continue
    if (!/[\p{L}\p{N}]/u.test(label)) continue
    seen.add(key)
    const importance: SmartCutoutImportance = entry.importance === 'high' ? 'high' : 'medium'
    const reason = typeof entry.reason === 'string'
      ? entry.reason.replace(/\s+/g, ' ').trim().slice(0, 180)
      : ''
    objects.push({ id: 'smart-object-' + (objects.length + 1), label, importance, reason })
    if (objects.length >= SMART_CUTOUT_MAX_OBJECTS) break
  }

  return objects
}

export function parseSmartCutoutObjectResponse(responseText: string): SmartCutoutObject[] {
  const text = responseText.trim().replace(/^\uFEFF/, '')
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return []
  try {
    return normalizeSmartCutoutObjects(JSON.parse(text.slice(start, end + 1)))
  } catch {
    return []
  }
}

function isPoint(value: unknown): value is number[] {
  return Array.isArray(value) && value.length >= 2
    && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))
}

function extractPolygons(value: unknown): number[][][] {
  if (!Array.isArray(value) || !value.length) return []
  const candidates = value.length >= 3 && value.every(isPoint) ? [value] : value
  return candidates.map(candidate => {
    if (!Array.isArray(candidate)) return []
    return candidate.filter(isPoint).map(point => [Number(point[0]), Number(point[1])])
  }).filter(polygon => polygon.length >= 3)
}

function readImageSize(payload: Record<string, unknown>) {
  const raw = payload.image
  const image = Array.isArray(raw) ? raw[0] : raw
  if (!isRecord(image)) return null
  const width = Number(image.width)
  const height = Number(image.height)
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? { width, height }
    : null
}

export function normalizeSmartCutoutSegmentations(
  payload: unknown,
  objects: SmartCutoutObject[],
  sourceWidth: number,
  sourceHeight: number,
): { segmentations: SmartCutoutSegmentation[]; missingLabels: string[] } {
  if (!isRecord(payload) || !Array.isArray(payload.prompt_results)) {
    return { segmentations: [], missingLabels: objects.map(object => object.label) }
  }

  const imageSize = readImageSize(payload)
  const coordinateWidth = imageSize?.width ?? sourceWidth
  const coordinateHeight = imageSize?.height ?? sourceHeight
  const segmentations: SmartCutoutSegmentation[] = []
  const matched = new Set<string>()

  for (let promptIndex = 0; promptIndex < payload.prompt_results.length; promptIndex++) {
    const promptResult = payload.prompt_results[promptIndex]
    if (!isRecord(promptResult) || !Array.isArray(promptResult.predictions)) continue
    const echo = isRecord(promptResult.echo) ? promptResult.echo : {}
    const echoedLabel = normalizeLabel(echo.text)
    const object = objects.find(item => item.label.toLocaleLowerCase() === echoedLabel.toLocaleLowerCase())
      ?? objects[promptIndex]
    if (!object) continue

    let instanceIndex = 0
    for (const prediction of promptResult.predictions) {
      if (!isRecord(prediction)) continue
      const polygons = extractPolygons(prediction.masks)
      if (!polygons.length) continue
      const confidenceValue = Number(prediction.confidence ?? prediction.score ?? 0)
      const confidence = Number.isFinite(confidenceValue) ? Math.max(0, Math.min(1, confidenceValue)) : 0
      const scaledPolygons = polygons.map(polygon => polygon.map(([x, y]) => [
        Math.max(0, Math.min(sourceWidth, x * sourceWidth / coordinateWidth)),
        Math.max(0, Math.min(sourceHeight, y * sourceHeight / coordinateHeight)),
      ]))
      segmentations.push({
        id: object.id + '-instance-' + (instanceIndex + 1),
        objectId: object.id,
        label: object.label,
        importance: object.importance,
        confidence,
        polygons: scaledPolygons,
        instanceIndex: instanceIndex + 1,
      })
      instanceIndex++
      matched.add(object.id)
    }
  }

  return {
    segmentations,
    missingLabels: objects.filter(object => !matched.has(object.id)).map(object => object.label),
  }
}
