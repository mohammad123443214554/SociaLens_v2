import test from 'node:test'
import assert from 'node:assert/strict'
import {
  hasSmartCutoutPngAlpha,
  isSmartCutoutMaskValid,
  readSmartCutoutPngDimensions,
  normalizeSmartCutoutPolygons,
  SMART_CUTOUT_MAX_MASK_BYTES,
} from '../lib/studio/smart-cutout-processing.ts'

function pngHeader(width: number, height: number) {
  const bytes = new Uint8Array(26)
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


test('Smart Cutout accepts only PNG encodings with a real alpha channel', () => {
  const rgba = pngHeader(128, 128)
  rgba[25] = 6
  const grayscaleAlpha = pngHeader(128, 128)
  grayscaleAlpha[25] = 4
  const rgb = pngHeader(128, 128)
  rgb[25] = 2
  assert.equal(hasSmartCutoutPngAlpha(rgba), true)
  assert.equal(hasSmartCutoutPngAlpha(grayscaleAlpha), true)
  assert.equal(hasSmartCutoutPngAlpha(rgb), false)
  assert.equal(hasSmartCutoutPngAlpha(new Uint8Array(25)), false)
})


import { strengthenSmartCutoutAlpha } from '../lib/studio/smart-cutout-processing.ts'

test('Smart Cutout restores strong foreground opacity without hardening antialiased edges', () => {
  assert.equal(strengthenSmartCutoutAlpha(0), 0)
  assert.equal(strengthenSmartCutoutAlpha(255), 255)
  assert.ok(strengthenSmartCutoutAlpha(128) > 128)
  assert.ok(strengthenSmartCutoutAlpha(128) < 255)
  assert.ok(strengthenSmartCutoutAlpha(32) > 32)
  assert.equal(strengthenSmartCutoutAlpha(-10), 0)
  assert.equal(strengthenSmartCutoutAlpha(300), 255)
  assert.equal(strengthenSmartCutoutAlpha(Number.NaN), 0)
})


import { combineSmartCutoutAlpha } from '../lib/studio/smart-cutout-processing.ts'

test('SAM3 mask keeps object interiors fully opaque and limits AI alpha to a soft edge band', () => {
  const width = 9
  const height = 9
  const refined = new Uint8Array(width * height).fill(90)
  const mask = new Uint8Array(width * height)
  for (let y = 2; y <= 6; y++) for (let x = 2; x <= 6; x++) mask[y * width + x] = 255
  const combined = combineSmartCutoutAlpha(refined, mask, width, height, 1)
  assert.equal(combined[4 * width + 4], 255)
  assert.equal(combined[2 * width + 2], 255)
  assert.equal(combined[1 * width + 4], 90)
  assert.equal(combined[0 * width + 4], 0)
})

test('SAM3 alpha composition rejects mismatched masks and invalid dilation radii', () => {
  assert.throws(() => combineSmartCutoutAlpha(new Uint8Array(4), new Uint8Array(3), 2, 2))
  assert.throws(() => combineSmartCutoutAlpha(new Uint8Array(4), new Uint8Array(4), 2, 2, 13))
})
