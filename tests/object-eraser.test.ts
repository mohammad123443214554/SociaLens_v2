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
