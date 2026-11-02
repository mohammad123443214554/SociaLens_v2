import test from 'node:test'
import assert from 'node:assert/strict'
import { PART_FIVE_EYE_LENS_PRESETS } from '../lib/call-effects/presets.ts'

test('Part 5 exposes exactly the six agreed eye lenses', () => {
  assert.deepEqual(
    PART_FIVE_EYE_LENS_PRESETS.map((preset) => preset.name),
    ['Ocean Blue', 'Emerald Green', 'Honey Hazel', 'Silver Grey', 'Amethyst Violet', 'Golden Amber'],
  )
})

test('eye lens presets have unique IDs and use tracked iris rendering', () => {
  const ids = PART_FIVE_EYE_LENS_PRESETS.map((preset) => preset.id)
  assert.equal(new Set(ids).size, 6)
  for (const preset of PART_FIVE_EYE_LENS_PRESETS) {
    assert.equal(preset.categoryId, 'eye-lenses')
    assert.equal(preset.renderKind, 'face-landmark')
    assert.equal(preset.requiresFace, true)
    assert.ok(preset.defaultIntensity >= 0 && preset.defaultIntensity <= 100)
  }
})
