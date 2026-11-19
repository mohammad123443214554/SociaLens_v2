export type ObjectEraserPoint = readonly [number, number]
export type ObjectEraserPolygon = readonly ObjectEraserPoint[]

function asPoint(value: readonly number[]): ObjectEraserPoint | null {
  return value.length === 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])
    ? [value[0], value[1]]
    : null
}

function cross(a: ObjectEraserPoint, b: ObjectEraserPoint, c: ObjectEraserPoint) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
}

function onSegment(a: ObjectEraserPoint, b: ObjectEraserPoint, point: ObjectEraserPoint) {
  const epsilon = 1e-7
  return Math.abs(cross(a, b, point)) <= epsilon
    && point[0] >= Math.min(a[0], b[0]) - epsilon
    && point[0] <= Math.max(a[0], b[0]) + epsilon
    && point[1] >= Math.min(a[1], b[1]) - epsilon
    && point[1] <= Math.max(a[1], b[1]) + epsilon
}

function segmentsIntersect(a: ObjectEraserPoint, b: ObjectEraserPoint, c: ObjectEraserPoint, d: ObjectEraserPoint) {
  const abC = cross(a, b, c)
  const abD = cross(a, b, d)
  const cdA = cross(c, d, a)
  const cdB = cross(c, d, b)
  if (((abC > 0 && abD < 0) || (abC < 0 && abD > 0))
    && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))) return true
  return (Math.abs(abC) <= 1e-7 && onSegment(a, b, c))
    || (Math.abs(abD) <= 1e-7 && onSegment(a, b, d))
    || (Math.abs(cdA) <= 1e-7 && onSegment(c, d, a))
    || (Math.abs(cdB) <= 1e-7 && onSegment(c, d, b))
}

function pointSegmentDistance(point: ObjectEraserPoint, start: ObjectEraserPoint, end: ObjectEraserPoint) {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared <= 1e-12) return Math.hypot(point[0] - start[0], point[1] - start[1])
  const projection = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared))
  return Math.hypot(point[0] - (start[0] + projection * dx), point[1] - (start[1] + projection * dy))
}

export function isObjectEraserPointInsidePolygon(point: ObjectEraserPoint, polygon: ObjectEraserPolygon) {
  if (polygon.length < 3) return false
  let inside = false
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const [x, y] = polygon[current]
    const [previousX, previousY] = polygon[previous]
    if (((y > point[1]) !== (previousY > point[1]))
      && point[0] < ((previousX - x) * (point[1] - y)) / (previousY - y || Number.EPSILON) + x) {
      inside = !inside
    }
  }
  return inside
}

/**
 * Checks the actual circular brush stroke (a polyline with a radius), not just
 * its sampled vertices. This catches long strokes crossing an object even
 * when both stroke endpoints are outside the segmentation polygon.
 */
export function brushStrokeIntersectsPolygons(
  stroke: readonly number[][],
  polygons: readonly number[][][],
  brushRadius = 0,
) {
  const validStroke = stroke.map(asPoint).filter((point): point is ObjectEraserPoint => point !== null)
  const validPolygons = polygons.map(polygon => polygon.map(asPoint).filter((point): point is ObjectEraserPoint => point !== null))
  if (!validStroke.length || !validPolygons.length) return false
  const radius = Number.isFinite(brushRadius) ? Math.max(0, brushRadius) : 0
  for (const polygon of validPolygons) {
    if (polygon.length < 3) continue
    if (validStroke.some(point => isObjectEraserPointInsidePolygon(point, polygon))) return true
    const polygonEdges = polygon.map((point, index) => [point, polygon[(index + 1) % polygon.length]] as const)
    if (validStroke.length === 1) {
      if (polygonEdges.some(([start, end]) => pointSegmentDistance(validStroke[0], start, end) <= radius)) return true
      continue
    }
    for (let index = 0; index < validStroke.length - 1; index++) {
      const start = validStroke[index]
      const end = validStroke[index + 1]
      for (const [edgeStart, edgeEnd] of polygonEdges) {
        if (segmentsIntersect(start, end, edgeStart, edgeEnd)) return true
        if (radius > 0 && (
          pointSegmentDistance(start, edgeStart, edgeEnd) <= radius
          || pointSegmentDistance(end, edgeStart, edgeEnd) <= radius
          || pointSegmentDistance(edgeStart, start, end) <= radius
          || pointSegmentDistance(edgeEnd, start, end) <= radius
        )) return true
      }
    }
  }
  return false
}

export function brushStrokeIntersectsDetectionBox(
  stroke: readonly number[][],
  box: { x: number; y: number; width: number; height: number },
  brushRadius = 0,
) {
  if (![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.width <= 0 || box.height <= 0) return false
  const polygon: number[][] = [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x + box.width, box.y + box.height],
    [box.x, box.y + box.height],
  ]
  return brushStrokeIntersectsPolygons(stroke, [polygon], brushRadius)
}

/**
 * Scores how much of a user's brush path lies inside a segmented object.
 * Prefer the object actually painted over, not a nearby high-confidence box.
 */
export function scoreBrushStrokeAgainstPolygons(
  stroke: readonly number[][],
  polygons: readonly number[][][],
  brushRadius = 0,
) {
  const points = stroke.map(asPoint).filter((point): point is ObjectEraserPoint => point !== null)
  const validPolygons = polygons
    .map(polygon => polygon.map(asPoint).filter((point): point is ObjectEraserPoint => point !== null))
    .filter(polygon => polygon.length >= 3)
  if (!points.length || !validPolygons.length) return 0

  const radius = Number.isFinite(brushRadius) ? Math.max(0, brushRadius) : 0
  const step = Math.max(2, Math.min(8, radius > 0 ? radius / 2 : 4))
  const samples: ObjectEraserPoint[] = []
  if (points.length === 1) {
    samples.push(points[0])
  } else {
    for (let index = 0; index < points.length - 1; index++) {
      const start = points[index]
      const end = points[index + 1]
      const distance = Math.hypot(end[0] - start[0], end[1] - start[1])
      const count = Math.max(1, Math.ceil(distance / step))
      for (let sample = 0; sample < count; sample++) {
        const t = sample / count
        samples.push([start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t])
      }
    }
    samples.push(points[points.length - 1])
  }

  let matched = 0
  for (const sample of samples) {
    const touchesObject = validPolygons.some(polygon => {
      if (isObjectEraserPointInsidePolygon(sample, polygon)) return true
      if (radius <= 0) return false
      return polygon.some((point, index) =>
        pointSegmentDistance(sample, point, polygon[(index + 1) % polygon.length]) <= radius
      )
    })
    if (touchesObject) matched++
  }
  return matched / samples.length
}

export function getObjectEraserBrushRegionKey(
  stroke: readonly number[][],
  brushRadius: number,
  imageWidth: number,
  imageHeight: number,
) {
  const points = stroke.map(asPoint).filter((point): point is ObjectEraserPoint => point !== null)
  if (!points.length || imageWidth <= 0 || imageHeight <= 0) return ''
  const radius = Number.isFinite(brushRadius) ? Math.max(0, brushRadius) : 0
  const xs = points.map(point => point[0])
  const ys = points.map(point => point[1])
  const quantize = (value: number, dimension: number) =>
    Math.round(Math.max(0, Math.min(dimension, value)) / dimension * 50) * 2
  return [
    quantize(Math.min(...xs) - radius, imageWidth),
    quantize(Math.min(...ys) - radius, imageHeight),
    quantize(Math.max(...xs) + radius, imageWidth),
    quantize(Math.max(...ys) + radius, imageHeight),
  ].join(':')
}

/** Stable cache key based on source image and normalized object position/size. */
export function getObjectEraserTargetCacheKey(
  sourceKey: string,
  label: string,
  polygons: readonly number[][][],
  imageWidth: number,
  imageHeight: number,
  stroke?: readonly number[][],
  brushRadius = 0,
) {
  const points = polygons.flat().map(asPoint).filter((point): point is ObjectEraserPoint => point !== null)
  if (!sourceKey || !points.length || imageWidth <= 0 || imageHeight <= 0) return ''
  const xs = points.map(point => point[0])
  const ys = points.map(point => point[1])
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  const right = Math.max(...xs)
  const bottom = Math.max(...ys)
  // Two-percent buckets tolerate tiny SAM2 boundary differences while still
  // separating different objects at different positions in the same image.
  const quantize = (value: number, dimension: number) =>
    Math.round(Math.max(0, Math.min(dimension, value)) / dimension * 50) * 2
  const bounds = [
    quantize(left, imageWidth),
    quantize(top, imageHeight),
    quantize(right, imageWidth),
    quantize(bottom, imageHeight),
  ].join(':')
  const selectionKey = stroke?.length ? getObjectEraserBrushRegionKey(stroke, brushRadius, imageWidth, imageHeight) : ''
  return sourceKey + '::' + label.trim().toLocaleLowerCase() + '::' + bounds + '::' + selectionKey
}
