import test from 'node:test'
import { getObjectEraserBrushRegionKey, getObjectEraserTargetCacheKey, brushStrokeIntersectsDetectionBox, brushStrokeIntersectsPolygons, scoreBrushStrokeAgainstPolygons, scaleObjectEraserPolygons, scoreBrushStrokeAgainstDetectionBox, getObjectEraserTargetsUnderBrush } from '../lib/studio/object-eraser-selection.ts'
import assert from 'node:assert/strict'
import {
  detectObjectEraserImageType,
  OBJECT_ERASER_DEFAULT_PROMPTS,
  normalizeRoboflowDetections,
  normalizeRoboflowSegmentations,
  getRoboflowRequestError,
  RoboflowRequestError,
  prepareObjectEraserImage,
} from '../lib/studio/object-eraser.ts'
import { getStabilityImageApiBaseUrl, mapStabilityApiError, mapStabilityBackgroundError, STABILITY_ERASE_CREDITS, STABILITY_ERASE_PATH, STABILITY_INPAINT_PATH, STABILITY_REMOVE_BACKGROUND_PATH } from '../lib/studio/stability-inpaint.ts'


test('scales normalized SAM2 masks into the original image pixel space', () => {
  const result = scaleObjectEraserPolygons(
    [[[0.1, 0.2], [0.9, 0.2], [0.9, 0.8], [0.1, 0.8]]],
    4000,
    3000,
    1000,
    750,
  )
  assert.deepEqual(result[0], [[400, 600], [3600, 600], [3600, 2400], [400, 2400]])
})

test('rescales SAM2 pixel masks when inference dimensions differ from the editor image', () => {
  const result = scaleObjectEraserPolygons(
    [[[100, 80], [900, 80], [900, 670], [100, 670]]],
    4000,
    3000,
    1000,
    750,
  )
  assert.deepEqual(result[0], [[400, 320], [3600, 320], [3600, 2680], [400, 2680]])
})

test('includes common plant containers in Object Eraser detection prompts', () => {
  assert.ok(OBJECT_ERASER_DEFAULT_PROMPTS.includes('pot'))
  assert.ok(OBJECT_ERASER_DEFAULT_PROMPTS.includes('flower pot'))
  assert.ok(OBJECT_ERASER_DEFAULT_PROMPTS.includes('planter'))
})

test('detects supported image signatures instead of trusting the filename', () => {
  assert.equal(detectObjectEraserImageType(new Uint8Array([255, 216, 255, 0])), 'image/jpeg')
  assert.equal(detectObjectEraserImageType(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])), 'image/png')
  assert.equal(detectObjectEraserImageType(new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80])), 'image/webp')
  assert.equal(detectObjectEraserImageType(new Uint8Array([1, 2, 3, 4])), null)
})

test('normalizes Grounding DINO center boxes into bounded top-left rectangles', () => {
  const detections = normalizeRoboflowDetections({
    predictions: [
      { x: 50, y: 40, width: 40, height: 20, confidence: 0.9, class: 'cup' },
      { x: 0, y: 10, width: 20, height: 20, confidence: 0.8, class: 'pen' },
      { x: 10, y: 10, width: 0, height: 20, confidence: 0.7, class: 'invalid' },
    ],
  }, 100, 80)
  assert.equal(detections.length, 2)
  assert.deepEqual(detections[0], { id: '1', label: 'cup', confidence: 0.9, x: 30, y: 30, width: 40, height: 20 })
  assert.deepEqual(detections[1], { id: '2', label: 'pen', confidence: 0.8, x: 0, y: 0, width: 10, height: 20 })
})

test('normalizes one polygon mask for each matching detection', () => {
  const detections = [{ id: '1', label: 'cup', confidence: 0.95, x: 10, y: 10, width: 20, height: 20 }]
  const result = normalizeRoboflowSegmentations({
    predictions: [{ confidence: 0.91, masks: [[[11, 12], [28, 12], [28, 29], [11, 29]]] }],
  }, detections)
  assert.equal(result.length, 1)
  assert.equal(result[0].id, '1')
  assert.equal(result[0].confidence, 0.91)
  assert.deepEqual(result[0].polygons[0], [[11, 12], [28, 12], [28, 29], [11, 29]])
})

test('normalizes wrapped SAM2 polygon points returned as coordinate objects', () => {
  const detections = [
    { id: '1', label: 'cup', confidence: 0.95, x: 10, y: 10, width: 20, height: 20 },
    { id: '2', label: 'pen', confidence: 0.9, x: 40, y: 10, width: 20, height: 20 },
  ]
  const result = normalizeRoboflowSegmentations({
    predictions: [{
      masks: [
        { polygons: [[{ x: 11, y: 12 }, { x: 28, y: 12 }, { x: 28, y: 29 }]] },
        { mask: [[[41, 12], [58, 12], [58, 29]]] },
      ],
    }],
  }, detections)
  assert.equal(result.length, 2)
  assert.deepEqual(result[0].polygons[0], [[11, 12], [28, 12], [28, 29]])
  assert.deepEqual(result[1].polygons[0], [[41, 12], [58, 12], [58, 29]])
})

test('does not misread binary raster mask rows as polygon vertices', () => {
  const detections = [{ id: '1', label: 'mug', confidence: 0.9, x: 10, y: 10, width: 20, height: 20 }]
  assert.throws(() => normalizeRoboflowSegmentations({
    predictions: [{ masks: [[0, 0, 0, 1, 1], [0, 1, 1, 1, 0], [0, 0, 1, 0, 0]] }],
  }, detections), /unsupported format|polygon/i)
})

test('rejects missing or mismatched SAM2 masks instead of fabricating cutouts', () => {
  const detections = [{ id: '1', label: 'cup', confidence: 0.95, x: 10, y: 10, width: 20, height: 20 }]
  assert.throws(
    () => normalizeRoboflowSegmentations({ predictions: [] }, detections),
    (error: unknown) => error instanceof RoboflowRequestError && /no masks for the detected objects/.test(error.message),
  )
})

test('maps provider quota and authentication failures to stable error codes', () => {
  assert.equal(getRoboflowRequestError(429).code, 'quota_exceeded')
  assert.equal(getRoboflowRequestError(401).code, 'unauthorized')
  assert.equal(getRoboflowRequestError(503).retryable, true)
})

test('prepares a valid PNG file and rejects mismatched MIME types', async () => {
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])
  const file = new File([bytes], 'test.png', { type: 'image/png' })
  const prepared = await prepareObjectEraserImage(file)
  assert.equal(prepared.mimeType, 'image/png')
  assert.equal(prepared.size, bytes.length)
  assert.equal(prepared.base64, 'iVBORw0KGgoA')
  const mismatched = new File([bytes], 'test.jpg', { type: 'image/jpeg' })
  await assert.rejects(() => prepareObjectEraserImage(mismatched), /does not match/)
})


test('configures Stability AI and the Comfy-compatible migration host safely', () => {
  assert.equal(getStabilityImageApiBaseUrl('https://api.stability.ai'), 'https://api.stability.ai')
  assert.equal(getStabilityImageApiBaseUrl('https://stability.comfy.org'), 'https://stability.comfy.org')
  assert.throws(() => getStabilityImageApiBaseUrl('http://api.stability.ai'), /HTTPS URL/)
  assert.throws(() => getStabilityImageApiBaseUrl('https://attacker.example'), /must be https/)
  assert.equal(STABILITY_ERASE_PATH, '/v2beta/stable-image/edit/erase')
  assert.equal(STABILITY_ERASE_CREDITS, 5)
})

test('Object Eraser uses Stability AI dedicated mask-guided erase endpoint, not generative inpainting', () => {
  assert.equal(STABILITY_ERASE_PATH, '/v2beta/stable-image/edit/erase')
  assert.notEqual(STABILITY_ERASE_PATH, STABILITY_INPAINT_PATH)
})

test('configures Stability AI dedicated background removal and maps provider failures', () => {
  assert.equal(STABILITY_REMOVE_BACKGROUND_PATH, '/v2beta/stable-image/edit/remove-background')
  assert.equal(mapStabilityBackgroundError(401).code, 'unauthorized')
  assert.equal(mapStabilityBackgroundError(402).code, 'insufficient_credits')
  assert.equal(mapStabilityBackgroundError(413).code, 'image_too_large')
  assert.equal(mapStabilityBackgroundError(429).retryable, true)
  assert.equal(mapStabilityBackgroundError(503).retryable, true)
  assert.equal(mapStabilityBackgroundError(400).retryable, false)
})

test('maps Stability AI authentication, credit, safety, and retry failures', () => {
  assert.equal(mapStabilityApiError(401).code, 'unauthorized')
  assert.equal(mapStabilityApiError(402).code, 'insufficient_credits')
  assert.equal(mapStabilityApiError(403).code, 'content_filtered')
  assert.equal(mapStabilityApiError(429).retryable, true)
  assert.equal(mapStabilityApiError(503).retryable, true)
  assert.equal(mapStabilityApiError(400).retryable, false)
})


test('object eraser detects a brush segment crossing an object when endpoints are outside', () => {
  const object = [[[40, 40], [60, 40], [60, 60], [40, 60]]]
  assert.equal(brushStrokeIntersectsPolygons([[0, 50], [100, 50]], object, 0), true)
})

test('object eraser rejects a brush stroke over empty background', () => {
  const object = [[[40, 40], [60, 40], [60, 60], [40, 60]]]
  assert.equal(brushStrokeIntersectsPolygons([[0, 0], [20, 20]], object, 3), false)
  assert.equal(brushStrokeIntersectsDetectionBox([[0, 0], [20, 20]], { x: 40, y: 40, width: 20, height: 20 }, 3), false)
})

test('object eraser accounts for the circular brush radius near an object edge', () => {
  const object = [[[40, 40], [60, 40], [60, 60], [40, 60]]]
  assert.equal(brushStrokeIntersectsPolygons([[0, 37], [100, 37]], object, 4), true)
})



test('object eraser keeps every object covered by one highlighted brush area', () => {
  const flower = { id: 'flower', polygons: [[[30, 20], [55, 20], [55, 45], [30, 45]]] }
  const pot = { id: 'pot', polygons: [[[25, 42], [65, 42], [65, 85], [25, 85]]] }
  const nearby = { id: 'nearby', polygons: [[[110, 20], [140, 20], [140, 60], [110, 60]]] }
  const selected = getObjectEraserTargetsUnderBrush(
    [[35, 30], [50, 55]],
    [flower, pot, nearby],
    4,
  )
  assert.deepEqual(selected.map(item => item.id), ['flower', 'pot'])
  assert.equal(selected.flatMap(item => item.polygons).length, 2)
})

test('object eraser prioritizes the detection box directly covered by the brush', () => {
  const stroke = [[25, 40], [35, 40]]
  const selected = { x: 20, y: 20, width: 30, height: 40 }
  const nearby = { x: 60, y: 20, width: 30, height: 40 }
  assert.ok(scoreBrushStrokeAgainstDetectionBox(stroke, selected, 3) > 0.9)
  assert.equal(scoreBrushStrokeAgainstDetectionBox(stroke, nearby, 3), 0)
})

test('object eraser chooses the segmented object most directly covered by the brush', () => {
  const paintedObject = [[[20, 20], [42, 20], [42, 48], [20, 48]]]
  const nearbyObject = [[[58, 20], [82, 20], [82, 48], [58, 48]]]
  const brush = [[24, 32], [38, 32]]
  assert.ok(scoreBrushStrokeAgainstPolygons(brush, paintedObject, 3) > 0.9)
  assert.equal(scoreBrushStrokeAgainstPolygons(brush, nearbyObject, 3), 0)
  assert.ok(scoreBrushStrokeAgainstPolygons([[21, 21]], paintedObject, 2) > 0)
})

test('object eraser cache key is stable for small segmentation boundary changes', () => {
  const first = getObjectEraserTargetCacheKey('project/image.png', 'Cup', [[[20, 20], [80, 20], [80, 80], [20, 80]]], 100, 100)
  const second = getObjectEraserTargetCacheKey('project/image.png', 'cup', [[[20.2, 20.1], [80.2, 20.1], [80.2, 80.2], [20.2, 80.2]]], 100, 100)
  const differentObject = getObjectEraserTargetCacheKey('project/image.png', 'cup', [[[50, 20], [90, 20], [90, 60], [50, 60]]], 100, 100)
  assert.equal(first, second)
  assert.notEqual(first, differentObject)
})


test('object eraser cache separates different brush regions on the same object', () => {
  const object = [[[20, 20], [80, 20], [80, 80], [20, 80]]]
  const firstStroke = [[35, 35], [45, 45]]
  const sameAreaStroke = [[35.2, 35.1], [45.1, 45.2]]
  const differentAreaStroke = [[65, 65], [75, 75]]
  const first = getObjectEraserTargetCacheKey('project/image.png', 'cup', object, 100, 100, firstStroke, 8)
  const same = getObjectEraserTargetCacheKey('project/image.png', 'cup', object, 100, 100, sameAreaStroke, 8)
  const different = getObjectEraserTargetCacheKey('project/image.png', 'cup', object, 100, 100, differentAreaStroke, 8)
  assert.equal(first, same)
  assert.notEqual(first, different)
  assert.notEqual(getObjectEraserBrushRegionKey(firstStroke, 8, 100, 100), getObjectEraserBrushRegionKey(differentAreaStroke, 8, 100, 100))
})
