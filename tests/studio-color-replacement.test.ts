import assert from 'node:assert/strict'
import test from 'node:test'
import { recolorStudioPixelData } from '../lib/studio/color-replacement.ts'

test('replaces matched pixels with the exact requested white, without preserving old darkness', () => {
  const input = new Uint8ClampedArray([
    116, 20, 188, 255,
    98, 15, 170, 255,
  ])
  const output = recolorStudioPixelData(input, [{ source: '#7414BC', target: '#FFFFFF' }])
  assert.deepEqual([...output], [
    255, 255, 255, 255,
    255, 255, 255, 255,
  ])
})

test('changes only the nearest selected source colour and leaves unrelated pixels intact', () => {
  const input = new Uint8ClampedArray([
    240, 20, 180, 255,
    20, 30, 220, 255,
    0, 0, 0, 0,
  ])
  const output = recolorStudioPixelData(input, [{ source: '#F014B4', target: '#16A34A' }])
  assert.deepEqual([...output], [
    22, 163, 74, 255,
    20, 30, 220, 255,
    0, 0, 0, 0,
  ])
})

test('supports multiple independent source-to-target mappings', () => {
  const input = new Uint8ClampedArray([
    240, 20, 180, 255,
    20, 30, 220, 255,
  ])
  const output = recolorStudioPixelData(input, [
    { source: '#F014B4', target: '#16A34A' },
    { source: '#141EDC', target: '#FFFFFF' },
  ])
  assert.deepEqual([...output], [
    22, 163, 74, 255,
    255, 255, 255, 255,
  ])
})

test('does not mutate the original pixel buffer', () => {
  const input = new Uint8ClampedArray([240, 20, 180, 255])
  recolorStudioPixelData(input, [{ source: '#F014B4', target: '#16A34A' }])
  assert.deepEqual([...input], [240, 20, 180, 255])
})
