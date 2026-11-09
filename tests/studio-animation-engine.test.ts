import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeTextAnimationSettings,
  sampleTextAnimation,
  validateTextAnimationDefinition,
  validateTextAnimationRegistry,
  type TextAnimationDefinition,
} from '../lib/studio/animation-engine.ts'
import { BASIC_ENTRANCE_ANIMATIONS } from '../lib/studio/basic-entrance-animations.ts'

const entrance: TextAnimationDefinition = {
  id: 'test-fade-in',
  name: 'Test Fade In',
  category: 'Test',
  mode: 'entrance',
  defaultDurationMs: 1000,
  keyframes: [
    { at: 0, opacity: 0, translateY: 24, scaleX: 0.9, scaleY: 0.9 },
    { at: 1, opacity: 1, translateY: 0, scaleX: 1, scaleY: 1 },
  ],
}

const exit: TextAnimationDefinition = {
  id: 'test-fade-out',
  name: 'Test Fade Out',
  category: 'Test',
  mode: 'exit',
  defaultDurationMs: 1000,
  keyframes: [
    { at: 0, opacity: 1, translateX: 0 },
    { at: 1, opacity: 0, translateX: 30 },
  ],
}

const loop: TextAnimationDefinition = {
  id: 'test-pulse',
  name: 'Test Pulse',
  category: 'Test',
  mode: 'loop',
  defaultDurationMs: 1000,
  keyframes: [
    { at: 0, scaleX: 1, scaleY: 1 },
    { at: 0.5, scaleX: 1.2, scaleY: 1.2 },
    { at: 1, scaleX: 1, scaleY: 1 },
  ],
}

const sample = (definition: TextAnimationDefinition, time: number, overrides = {}) =>
  sampleTextAnimation({
    definition,
    settings: { animationId: definition.id, durationMs: 1000, ...overrides },
    timelineTimeSeconds: time,
    layerStartSeconds: 2,
    layerDurationSeconds: 4,
  })

test('normalizes missing, invalid, and out-of-range settings safely', () => {
  assert.deepEqual(normalizeTextAnimationSettings(null), { animationId: null, enabled: false })
  const normalized = normalizeTextAnimationSettings({
    animationId: ' fade ',
    durationMs: -10,
    delayMs: 999999,
    repeatCount: 2.8,
    intensity: 10,
    direction: 'sideways' as never,
    easing: 'unknown' as never,
  })
  assert.equal(normalized.animationId, 'fade')
  assert.equal(normalized.durationMs, 50)
  assert.equal(normalized.delayMs, 60000)
  assert.equal(normalized.repeatCount, 2)
  assert.equal(normalized.intensity, 2)
  assert.equal(normalized.direction, 'normal')
  assert.equal(normalized.easing, 'ease')
})

test('validates keyframe boundaries, ordering, and finite values', () => {
  assert.deepEqual(validateTextAnimationDefinition(entrance), [])
  const invalid = {
    ...entrance,
    keyframes: [{ at: 0.2, opacity: Number.NaN }, { at: 0.1, opacity: 1 }],
  }
  assert.ok(validateTextAnimationDefinition(invalid).length >= 3)
})

test('registry validation catches duplicate ids and case-insensitive names', () => {
  const duplicate = { ...entrance, id: 'another-id', name: 'test fade in' }
  const errors = validateTextAnimationRegistry([entrance, duplicate])
  assert.ok(errors.some(error => error.includes('Duplicate animation name')))
})

test('entrance animation is deterministic and settles on its final frame', () => {
  const before = sample(entrance, 1.9)
  const start = sample(entrance, 2)
  const middle = sample(entrance, 2.5)
  const end = sample(entrance, 3)
  assert.equal(before.visible, false)
  assert.equal(start.opacity, 0)
  assert.equal(middle.opacity, 0.5)
  assert.equal(end.opacity, 1)
  assert.equal(end.translateY, 0)
  assert.deepEqual(sample(entrance, 2.5), middle)
})

test('entrance delay is timeline-based and does not start early', () => {
  const delayed = sample(entrance, 2.5, { delayMs: 500 })
  assert.equal(delayed.phase, 'before')
  assert.equal(delayed.opacity, 0)
  assert.equal(sample(entrance, 3, { delayMs: 500 }).opacity, 0)
})

test('exit animation is anchored to the end of the layer interval', () => {
  const before = sample(exit, 4.9)
  const middle = sample(exit, 5.5)
  const end = sample(exit, 6)
  assert.equal(before.opacity, 1)
  assert.equal(middle.opacity, 0.5)
  assert.equal(end.opacity, 0)
  assert.equal(end.translateX, 30)
})

test('loop animation repeats, supports infinite repeat, and holds finite final state', () => {
  assert.equal(sample(loop, 2.5).scaleX, 1.2)
  assert.equal(sample(loop, 3.5).scaleX, 1.2)
  const finiteEnd = sample(loop, 5, { repeatCount: 2 })
  assert.equal(finiteEnd.phase, 'after')
  assert.equal(finiteEnd.scaleX, 1)
  const infinite = sample(loop, 12, { repeatCount: 0 })
  assert.equal(infinite.phase, 'running')
})

test('reverse and alternate directions are applied consistently', () => {
  const reverse = sample(loop, 2.25, { direction: 'reverse' })
  assert.equal(reverse.scaleX, 1.1)
  const alternate = sample(loop, 3.25, { direction: 'alternate' })
  assert.equal(alternate.scaleX, 1.1)
})

test('disabled and mismatched animation ids return a neutral sample', () => {
  const disabled = sampleTextAnimation({
    definition: entrance,
    settings: { animationId: entrance.id, enabled: false },
    timelineTimeSeconds: 2.5,
    layerStartSeconds: 2,
    layerDurationSeconds: 4,
  })
  assert.equal(disabled.opacity, 1)
  assert.equal(disabled.phase, 'inactive')
  assert.equal(sample(entrance, 2.5, { animationId: 'missing' }).opacity, 1)
})

test('Basic Entrance catalog contains exactly 25 uniquely named and visually distinct presets', () => {
  assert.equal(BASIC_ENTRANCE_ANIMATIONS.length, 25)
  assert.deepEqual(validateTextAnimationRegistry(BASIC_ENTRANCE_ANIMATIONS), [])
  assert.equal(new Set(BASIC_ENTRANCE_ANIMATIONS.map(item => item.name)).size, 25)
  assert.equal(new Set(BASIC_ENTRANCE_ANIMATIONS.map(item => JSON.stringify(item.keyframes))).size, 25)
  for (const item of BASIC_ENTRANCE_ANIMATIONS) {
    assert.equal(item.category, 'Basic Entrance')
    assert.equal(item.mode, 'entrance')
    assert.ok(item.description && item.description.length > 8)
  }
})

test('each Basic Entrance preset samples to a visible neutral settled state at completion', () => {
  for (const definition of BASIC_ENTRANCE_ANIMATIONS) {
    const sample = sampleTextAnimation({
      definition,
      settings: { animationId: definition.id, durationMs: definition.defaultDurationMs, enabled: true },
      timelineTimeSeconds: 2 + definition.defaultDurationMs / 1000,
      layerStartSeconds: 2,
      layerDurationSeconds: 5,
    })
    assert.equal(sample.visible, true, definition.name)
    assert.equal(sample.phase, 'after', definition.name)
    assert.equal(sample.opacity, 1, definition.name)
    assert.ok(Math.abs(sample.translateX) < 0.0001, definition.name)
    assert.ok(Math.abs(sample.translateY) < 0.0001, definition.name)
    assert.ok(Math.abs(sample.scaleX - 1) < 0.0001, definition.name)
    assert.ok(Math.abs(sample.scaleY - 1) < 0.0001, definition.name)
    assert.ok(Math.abs(sample.rotate) < 0.0001, definition.name)
    assert.ok(Math.abs(sample.blur) < 0.0001, definition.name)
  }
})
