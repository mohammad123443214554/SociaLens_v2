import test from 'node:test'
import assert from 'node:assert/strict'
import {
  detectObjectEraserImageType,
  normalizeRoboflowDetections,
  normalizeRoboflowSegmentations,
  getRoboflowRequestError,
  RoboflowRequestError,
  prepareObjectEraserImage,
} from '../lib/studio/object-eraser.ts'
import { getStabilityImageApiBaseUrl, mapStabilityApiError, STABILITY_INPAINT_CREDITS, STABILITY_INPAINT_PATH } from '../lib/studio/stability-inpaint.ts'

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
    (error: unknown) => error instanceof RoboflowRequestError && /every detected object/.test(error.message),
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
  assert.equal(STABILITY_INPAINT_PATH, '/v2beta/stable-image/edit/inpaint')
  assert.equal(STABILITY_INPAINT_CREDITS, 5)
})

test('maps Stability AI authentication, credit, safety, and retry failures', () => {
  assert.equal(mapStabilityApiError(401).code, 'unauthorized')
  assert.equal(mapStabilityApiError(402).code, 'insufficient_credits')
  assert.equal(mapStabilityApiError(403).code, 'content_filtered')
  assert.equal(mapStabilityApiError(429).retryable, true)
  assert.equal(mapStabilityApiError(503).retryable, true)
  assert.equal(mapStabilityApiError(400).retryable, false)
})
