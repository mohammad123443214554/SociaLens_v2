import assert from 'node:assert/strict'
import test from 'node:test'
import { recolorStudioPixelData } from '../lib/studio/color-replacement.ts'

test('recolours to white while preserving source highlights and shadows', () => {
  const input = new Uint8ClampedArray([
    116, 20, 188, 255,
    58, 10, 94, 255,
  ])
  const output = recolorStudioPixelData(input, [{ source: '#7414BC', target: '#FFFFFF' }])
  const [lightR, lightG, lightB, , darkR, darkG, darkB] = output
  assert.equal(lightR, lightG)
  assert.equal(lightG, lightB)
  assert.equal(darkR, darkG)
  assert.equal(darkG, darkB)
  assert.ok(lightR > darkR, 'the brighter source shade must remain brighter')
  assert.notEqual(lightR, darkR, 'the gradient must not collapse into one flat white')
})

test('preserves tonal shading when applying a saturated replacement colour', () => {
  const input = new Uint8ClampedArray([
    190, 35, 235, 255,
    78, 12, 102, 255,
  ])
  const output = recolorStudioPixelData(input, [{ source: '#BE23EB', target: '#16A34A' }])
  const [lightR, lightG, lightB, , darkR, darkG, darkB] = output
  assert.notDeepEqual([...output.slice(0, 3)], [...output.slice(4, 7)])
  assert.ok(lightG > darkG, 'highlights and shadows should retain their brightness order')
  assert.ok(lightG > lightR && lightG > lightB, 'the replacement hue should remain green')
  assert.ok(darkG > darkR && darkG > darkB, 'the shadow should retain the replacement hue')
})

test('leaves unrelated colour families and transparent pixels unchanged', () => {
  const input = new Uint8ClampedArray([
    240, 20, 180, 255,
    20, 180, 70, 255,
    0, 0, 0, 0,
  ])
  const output = recolorStudioPixelData(input, [{ source: '#F014B4', target: '#16A34A' }])
  assert.notDeepEqual([...output.slice(0, 3)], [240, 20, 180])
  assert.deepEqual([...output.slice(4, 8)], [...input.slice(4, 8)])
  assert.deepEqual([...output.slice(8, 12)], [...input.slice(8, 12)])
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
  assert.ok(output[1] > output[0] && output[1] > output[2], 'first mapping should be green')
  assert.equal(output[4], output[5])
  assert.equal(output[5], output[6])
})

test('does not mutate the original pixel buffer', () => {
  const input = new Uint8ClampedArray([240, 20, 180, 255])
  recolorStudioPixelData(input, [{ source: '#F014B4', target: '#16A34A' }])
  assert.deepEqual([...input], [240, 20, 180, 255])
})

test('recolours darker gradient shades while retaining their lower lightness', () => {
  const input = new Uint8ClampedArray([
    120, 20, 188, 255,
    42, 6, 79, 255,
    0, 0, 0, 255,
  ])
  const output = recolorStudioPixelData(input, [{ source: '#7805F8', target: '#FFFFFF' }])
  assert.ok(output[0] > output[4], 'dark gradient pixels must remain darker than the source swatch')
  assert.deepEqual([...output.slice(8, 12)], [...input.slice(8, 12)])
})
