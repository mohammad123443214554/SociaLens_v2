import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isSmartCutoutMaskValid,
  readSmartCutoutPngDimensions,
  normalizeSmartCutoutPolygons,
  SMART_CUTOUT_MAX_MASK_BYTES,
} from '../lib/studio/smart-cutout-processing.ts'

function pngHeader(width: number, height: number) {
  const bytes = new Uint8Array(24)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0)
  bytes.set([0, 0, 0, 13], 8)
  bytes.set([73, 72, 68, 82], 12)
  new DataView(bytes.buffer).setUint32(16, width)
  new DataView(bytes.buffer).setUint32(20, height)
  return bytes
}

test('Smart Cutout reads valid PNG dimensions from the IHDR header', () => {
  assert.deepEqual(readSmartCutoutPngDimensions(pngHeader(1920, 1080)), { width: 1920, height: 1080 })
})

test('Smart Cutout rejects malformed, truncated and unsupported PNG headers', () => {
  assert.equal(readSmartCutoutPngDimensions(new Uint8Array(24)), null)
  assert.equal(readSmartCutoutPngDimensions(pngHeader(0, 1080)), null)
  const malformed = pngHeader(1920, 1080)
  malformed[12] = 0
  assert.equal(readSmartCutoutPngDimensions(malformed), null)
})

test('Smart Cutout rejects images beyond the provider pixel limit', () => {
  assert.equal(readSmartCutoutPngDimensions(pngHeader(4096, 4096)), null)
})

test('Smart Cutout accepts only full-resolution masks matching the source photo', () => {
  const mask = pngHeader(1280, 720)
  assert.equal(isSmartCutoutMaskValid(mask, 1280, 720), true)
  assert.equal(isSmartCutoutMaskValid(mask, 720, 1280), false)
  assert.equal(isSmartCutoutMaskValid(mask, 1280, 719), false)
})

test('Smart Cutout rejects masks above the upload size limit', () => {
  const mask = new Uint8Array(SMART_CUTOUT_MAX_MASK_BYTES + 1)
  mask.set(pngHeader(1280, 720))
  assert.equal(isSmartCutoutMaskValid(mask, 1280, 720), false)
})

test('Smart Cutout clamps polygon coordinates to the source image bounds', () => {
  const polygons = normalizeSmartCutoutPolygons([
    [[-10, 20], [120, 20], [120, 90], [20, 90]],
    [[Number.NaN, 10], [30, 30], [40, 40]],
    [[10, 10], [10, 10], [20, 20]],
  ], 100, 80)
  assert.deepEqual(polygons, [
    [[0, 20], [100, 20], [100, 80], [20, 80]],
    [[10, 10], [20, 20]],
  ].filter(polygon => polygon.length >= 3))
})

test('Smart Cutout ignores invalid polygon coordinates and unsupported canvas dimensions', () => {
  assert.deepEqual(normalizeSmartCutoutPolygons([[[0, 0], ['bad', 2], [3, 4]]], 100, 100), [])
  assert.deepEqual(normalizeSmartCutoutPolygons([[[0, 0], [10, 0], [10, 10]]], 5000, 5000), [])
})
