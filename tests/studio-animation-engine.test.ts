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
import { EXIT_ANIMATIONS } from '../lib/studio/exit-animations.ts'
import { BOUNCE_ELASTIC_ANIMATIONS } from '../lib/studio/bounce-elastic-animations.ts'
import { ROTATION_3D_ANIMATIONS } from '../lib/studio/rotation-3d-animations.ts'
import { TYPING_CHARACTER_ANIMATIONS } from '../lib/studio/typing-character-animations.ts'
import { sampleCharacterMotion, splitStudioGraphemes } from '../lib/studio/character-animation-engine.ts'

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
    settings: { animationId: definition.id, durationMs: 1000, easing: 'linear', repeatCount: definition.mode === 'loop' || definition.mode === 'continuous' ? 0 : 1, ...overrides },
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

test('entrance delay is timeline-based and starts exactly at its configured offset', () => {
  const before = sample(entrance, 2.49, { delayMs: 500 })
  const start = sample(entrance, 2.5, { delayMs: 500 })
  const middle = sample(entrance, 3, { delayMs: 500 })
  assert.equal(before.phase, 'before')
  assert.equal(before.opacity, 0)
  assert.equal(start.phase, 'running')
  assert.equal(start.opacity, 0)
  assert.equal(middle.opacity, 0.5)
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


test('Exit catalog contains exactly 25 uniquely named and visually distinct presets', () => {
  assert.equal(EXIT_ANIMATIONS.length, 25)
  assert.deepEqual(validateTextAnimationRegistry(EXIT_ANIMATIONS), [])
  assert.equal(new Set(EXIT_ANIMATIONS.map(item => item.name)).size, 25)
  assert.equal(new Set(EXIT_ANIMATIONS.map(item => JSON.stringify(item.keyframes))).size, 25)
  for (const item of EXIT_ANIMATIONS) {
    assert.equal(item.category, 'Exit')
    assert.equal(item.mode, 'exit')
    assert.ok(item.description && item.description.length > 8)
  }
})

test('each Exit preset stays neutral before its exit window and reaches its authored terminal state', () => {
  for (const definition of EXIT_ANIMATIONS) {
    const duration = definition.defaultDurationMs / 1000
    const layerStart = 2
    const layerDuration = 5
    const exitStart = Math.max(layerStart, layerStart + layerDuration - duration)
    const before = sampleTextAnimation({
      definition,
      settings: { animationId: definition.id, durationMs: definition.defaultDurationMs, enabled: true },
      timelineTimeSeconds: Math.max(layerStart, exitStart - 0.01),
      layerStartSeconds: layerStart,
      layerDurationSeconds: layerDuration,
    })
    const middle = sampleTextAnimation({
      definition,
      settings: { animationId: definition.id, durationMs: definition.defaultDurationMs, enabled: true },
      timelineTimeSeconds: exitStart + duration * 0.5,
      layerStartSeconds: layerStart,
      layerDurationSeconds: layerDuration,
    })
    const end = sampleTextAnimation({
      definition,
      settings: { animationId: definition.id, durationMs: definition.defaultDurationMs, enabled: true },
      timelineTimeSeconds: exitStart + duration,
      layerStartSeconds: layerStart,
      layerDurationSeconds: layerDuration,
    })
    assert.equal(before.opacity, 1, definition.name + ' before')
    assert.equal(before.phase, 'before', definition.name + ' phase before')
    assert.equal(middle.phase, 'running', definition.name + ' phase middle')
    assert.equal(end.opacity, definition.keyframes[definition.keyframes.length - 1].opacity ?? 1, definition.name + ' authored terminal opacity')
    assert.equal(end.phase, 'after', definition.name + ' phase end')
    assert.equal(end.visible, true, definition.name + ' terminal visibility')
  }
})


test('Bounce & Elastic catalog contains exactly 25 valid, uniquely named and visually distinct presets', () => {
  assert.equal(BOUNCE_ELASTIC_ANIMATIONS.length, 25)
  assert.deepEqual(validateTextAnimationRegistry(BOUNCE_ELASTIC_ANIMATIONS), [])
  assert.equal(new Set(BOUNCE_ELASTIC_ANIMATIONS.map(item => item.id)).size, 25)
  assert.equal(new Set(BOUNCE_ELASTIC_ANIMATIONS.map(item => item.name)).size, 25)
  assert.equal(new Set(BOUNCE_ELASTIC_ANIMATIONS.map(item => JSON.stringify(item.keyframes))).size, 25)
  for (const item of BOUNCE_ELASTIC_ANIMATIONS) {
    assert.equal(item.category, 'Bounce & Elastic')
    assert.equal(item.mode, 'entrance')
    assert.ok(item.description && item.description.length > 8)
  }
})

test('each Bounce & Elastic preset starts hidden and settles to a neutral visible state', () => {
  for (const definition of BOUNCE_ELASTIC_ANIMATIONS) {
    const duration = definition.defaultDurationMs / 1000
    const start = 3
    const before = sampleTextAnimation({
      definition,
      settings: { animationId: definition.id, durationMs: definition.defaultDurationMs, enabled: true },
      timelineTimeSeconds: start - 0.001,
      layerStartSeconds: start,
      layerDurationSeconds: 6,
    })
    const first = sampleTextAnimation({
      definition,
      settings: { animationId: definition.id, durationMs: definition.defaultDurationMs, enabled: true },
      timelineTimeSeconds: start,
      layerStartSeconds: start,
      layerDurationSeconds: 6,
    })
    const middle = sampleTextAnimation({
      definition,
      settings: { animationId: definition.id, durationMs: definition.defaultDurationMs, enabled: true },
      timelineTimeSeconds: start + duration * 0.5,
      layerStartSeconds: start,
      layerDurationSeconds: 6,
    })
    const end = sampleTextAnimation({
      definition,
      settings: { animationId: definition.id, durationMs: definition.defaultDurationMs, enabled: true },
      timelineTimeSeconds: start + duration,
      layerStartSeconds: start,
      layerDurationSeconds: 6,
    })
    assert.equal(before.visible, false, definition.name + ' before visibility')
    assert.equal(first.phase, 'running', definition.name + ' start phase')
    assert.equal(middle.phase, 'running', definition.name + ' middle phase')
    assert.equal(end.phase, 'after', definition.name + ' end phase')
    assert.equal(end.visible, true, definition.name + ' end visibility')
    assert.equal(end.opacity, 1, definition.name + ' end opacity')
    assert.ok(Math.abs(end.translateX) < 0.0001, definition.name + ' end x')
    assert.ok(Math.abs(end.translateY) < 0.0001, definition.name + ' end y')
    assert.ok(Math.abs(end.scaleX - 1) < 0.0001, definition.name + ' end scale x')
    assert.ok(Math.abs(end.scaleY - 1) < 0.0001, definition.name + ' end scale y')
    assert.ok(Math.abs(end.rotate) < 0.0001, definition.name + ' end rotation')
  }
})


test('Rotation & 3D catalog contains exactly 25 unique, valid and individually authored presets', () => {
  assert.equal(ROTATION_3D_ANIMATIONS.length, 25)
  assert.deepEqual(validateTextAnimationRegistry(ROTATION_3D_ANIMATIONS), [])
  assert.equal(new Set(ROTATION_3D_ANIMATIONS.map(item => item.id)).size, 25)
  assert.equal(new Set(ROTATION_3D_ANIMATIONS.map(item => item.name)).size, 25)
  assert.equal(new Set(ROTATION_3D_ANIMATIONS.map(item => JSON.stringify(item.keyframes))).size, 25)
  for (const item of ROTATION_3D_ANIMATIONS) {
    assert.equal(item.category, 'Rotation & 3D')
    assert.equal(item.mode, 'entrance')
    assert.ok(item.description && item.description.length > 8)
  }
})

test('Rotation & 3D presets produce visible dimensional motion and settle back to neutral transforms', () => {
  for (const definition of ROTATION_3D_ANIMATIONS) {
    const duration = definition.defaultDurationMs / 1000
    const start = 4
    const middle = sampleTextAnimation({ definition, settings: { animationId: definition.id, durationMs: definition.defaultDurationMs, enabled: true }, timelineTimeSeconds: start + duration * 0.5, layerStartSeconds: start, layerDurationSeconds: 6 })
    const end = sampleTextAnimation({ definition, settings: { animationId: definition.id, durationMs: definition.defaultDurationMs, enabled: true }, timelineTimeSeconds: start + duration, layerStartSeconds: start, layerDurationSeconds: 6 })
    const hasMotion = Math.abs(middle.rotate) > 0.01 || Math.abs(middle.rotateX) > 0.01 || Math.abs(middle.rotateY) > 0.01 || Math.abs(middle.translateX) > 0.01 || Math.abs(middle.translateY) > 0.01 || Math.abs(middle.scaleX - 1) > 0.01 || Math.abs(middle.scaleY - 1) > 0.01
    assert.equal(hasMotion, true, definition.name + ' must move at midpoint')
    assert.equal(end.phase, 'after', definition.name + ' completion')
    assert.equal(end.opacity, 1, definition.name + ' opacity')
    assert.ok(Math.abs(end.rotateX) < 0.0001, definition.name + ' rotateX reset')
    assert.ok(Math.abs(end.rotateY) < 0.0001, definition.name + ' rotateY reset')
    assert.ok(Math.abs(end.skewX) < 0.0001, definition.name + ' skewX reset')
    assert.ok(Math.abs(end.skewY) < 0.0001, definition.name + ' skewY reset')
    assert.ok(Math.abs(end.blur) < 0.0001, definition.name + ' blur reset')
    assert.ok(Math.abs(end.perspective) < 0.0001, definition.name + ' perspective reset')
    assert.ok(Math.abs(end.translateX) < 0.0001, definition.name + ' x reset')
    assert.ok(Math.abs(end.translateY) < 0.0001, definition.name + ' y reset')
    assert.ok(Math.abs(end.scaleX - 1) < 0.0001, definition.name + ' scaleX reset')
    assert.ok(Math.abs(end.scaleY - 1) < 0.0001, definition.name + ' scaleY reset')
    assert.ok(Math.abs(end.rotate % 360) < 0.0001 || Math.abs(Math.abs(end.rotate % 360) - 360) < 0.0001, definition.name + ' planar rotation reset')
  }
})


test('Typing & Character catalog contains 25 unique valid per-grapheme presets',()=>{assert.equal(TYPING_CHARACTER_ANIMATIONS.length,25);assert.deepEqual(validateTextAnimationRegistry(TYPING_CHARACTER_ANIMATIONS),[]);assert.equal(new Set(TYPING_CHARACTER_ANIMATIONS.map(x=>x.id)).size,25);assert.equal(new Set(TYPING_CHARACTER_ANIMATIONS.map(x=>x.name)).size,25);assert.equal(new Set(TYPING_CHARACTER_ANIMATIONS.map(x=>x.characterEffect)).size,25);assert.equal(new Set(TYPING_CHARACTER_ANIMATIONS.map(x=>x.description)).size,25);for(const x of TYPING_CHARACTER_ANIMATIONS){assert.equal(x.category,'Typing & Character');assert.equal(x.mode,'entrance');assert.ok(x.characterEffect);assert.deepEqual(validateTextAnimationDefinition(x),[])}})
test('all character effects are deterministic, bounded and settle to neutral',()=>{for(const item of TYPING_CHARACTER_ANIMATIONS)for(const index of [0,2,7]){const effect=item.characterEffect!,m=sampleCharacterMotion({effect,progress:.5,index,count:8}),end=sampleCharacterMotion({effect,progress:1,index,count:8});assert.deepEqual(sampleCharacterMotion({effect,progress:.5,index,count:8}),m);assert.ok(m.opacity>=0&&m.opacity<=1);assert.ok(Number.isFinite(m.translateX)&&Number.isFinite(m.translateY)&&Number.isFinite(m.rotate)&&Number.isFinite(m.blur));assert.equal(end.opacity,1);assert.equal(end.translateX,0);assert.equal(end.translateY,0);assert.equal(end.scaleX,1);assert.equal(end.scaleY,1);assert.equal(end.rotate,0);assert.equal(end.blur,0);assert.equal(end.clipProgress,1)}})
test('grapheme splitting preserves joined emoji, skin tones and combining marks',()=>{assert.deepEqual(splitStudioGraphemes('A👩🏽‍💻éB'),['A','👩🏽‍💻','é','B']);assert.deepEqual(splitStudioGraphemes('Hello 👋'),['H','e','l','l','o',' ','👋'])})
test('all character presets have distinct sampled motion signatures',()=>{const signatures=TYPING_CHARACTER_ANIMATIONS.map(x=>JSON.stringify([0,.2,.45,.7,.9].map(progress=>sampleCharacterMotion({effect:x.characterEffect!,progress,index:2,count:7}))));assert.equal(new Set(signatures).size,25)})


test('premium easing curves are recognized, bounded, and settle without discontinuous keyframe velocity', () => {
  const smoothDefinition: TextAnimationDefinition = {
    id: 'test-premium-spline',
    name: 'Test Premium Spline',
    category: 'Test',
    mode: 'entrance',
    defaultDurationMs: 1000,
    keyframes: [
      { at: 0, opacity: 0, translateY: 48 },
      { at: 0.5, opacity: 0.72, translateY: -5 },
      { at: 1, opacity: 1, translateY: 0 },
    ],
  }
  const sampleAt = (time: number) => sampleTextAnimation({
    definition: smoothDefinition,
    settings: { animationId: smoothDefinition.id, durationMs: 1000, easing: 'premium-in-out' },
    timelineTimeSeconds: 2 + time,
    layerStartSeconds: 2,
    layerDurationSeconds: 4,
  })
  const before = sampleAt(0.5 - 0.002)
  const at = sampleAt(0.5)
  const after = sampleAt(0.5 + 0.002)
  const leftVelocity = (at.translateY - before.translateY) / 0.002
  const rightVelocity = (after.translateY - at.translateY) / 0.002
  assert.ok(Number.isFinite(leftVelocity) && Number.isFinite(rightVelocity))
  assert.ok(Math.abs(leftVelocity - rightVelocity) < 4, 'keyframe velocity should remain continuous')
  assert.ok(at.opacity >= 0 && at.opacity <= 1)
  assert.equal(sampleAt(1).opacity, 1)
  assert.equal(sampleAt(1).translateY, 0)
})

test('premium easing is monotonic and reaches exact endpoints', () => {
  const definition: TextAnimationDefinition = {
    ...entrance,
    id: 'test-premium-easing',
    keyframes: [{ at: 0, opacity: 0 }, { at: 1, opacity: 1 }],
  }
  for (const easing of ['premium-out', 'premium-in', 'premium-in-out'] as const) {
    let previous = -1
    for (let step = 0; step <= 100; step++) {
      const result = sampleTextAnimation({
        definition,
        settings: { animationId: definition.id, durationMs: 1000, easing },
        timelineTimeSeconds: 2 + step / 100,
        layerStartSeconds: 2,
        layerDurationSeconds: 4,
      })
      assert.ok(result.opacity >= previous - 1e-9, easing + ' must be monotonic')
      previous = result.opacity
    }
    assert.equal(previous, 1)
  }
})
