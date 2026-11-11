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
import { WORD_LINE_ANIMATIONS, sampleWordMotion } from '../lib/studio/word-line-animations.ts'
import { WIPE_MASK_REVEAL_ANIMATIONS, sampleMaskReveal, clipCanvasForMask } from '../lib/studio/wipe-mask-reveal-animations.ts'
import { LOOP_CONTINUOUS_ANIMATIONS } from '../lib/studio/loop-continuous-animations.ts'
import { MOTION_DYNAMIC_ANIMATIONS } from '../lib/studio/motion-dynamic-animations.ts'
import { CINEMATIC_LIGHT_ANIMATIONS } from '../lib/studio/cinematic-light-animations.ts'
import { DIGITAL_CREATIVE_ANIMATIONS } from '../lib/studio/digital-creative-animations.ts'
import { ARTISTIC_ADVANCED_ANIMATIONS } from '../lib/studio/artistic-advanced-animations.ts'
import { sampleCharacterMotion, splitStudioGraphemes } from '../lib/studio/character-animation-engine.ts'
import { STUDIO_FRAME_DURATION_SECONDS, STUDIO_FRAME_RATE, quantizeStudioTime, studioFrameIndexAtTime, studioFrameTime, studioFrameTimeFromElapsedMs } from '../lib/studio/frame-clock.ts'

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

test('multiple text layers stay synchronized to one project playhead with independent offsets', () => {
  const sharedPlayhead = 2.5
  const earlyLayer = sampleTextAnimation({
    definition: entrance,
    settings: { animationId: entrance.id, durationMs: 1000, easing: 'linear', repeatCount: 1 },
    timelineTimeSeconds: sharedPlayhead,
    layerStartSeconds: 0,
    layerDurationSeconds: 8,
  })
  const laterLayer = sampleTextAnimation({
    definition: entrance,
    settings: { animationId: entrance.id, durationMs: 2000, easing: 'linear', repeatCount: 1 },
    timelineTimeSeconds: sharedPlayhead,
    layerStartSeconds: 2,
    layerDurationSeconds: 5,
  })
  assert.equal(earlyLayer.phase, 'after')
  assert.equal(earlyLayer.progress, 1)
  assert.equal(laterLayer.phase, 'running')
  assert.equal(laterLayer.progress, 0.25)
  assert.notEqual(earlyLayer.opacity, laterLayer.opacity)
})

test('overlapping entrance, exit and loop layers can be sampled at the exact same timeline timestamp', () => {
  const sharedPlayhead = 3.75
  const entranceLayer = sampleTextAnimation({
    definition: entrance,
    settings: { animationId: entrance.id, durationMs: 2000, easing: 'linear', repeatCount: 1 },
    timelineTimeSeconds: sharedPlayhead,
    layerStartSeconds: 3,
    layerDurationSeconds: 4,
  })
  const exitLayer = sampleTextAnimation({
    definition: exit,
    settings: { animationId: exit.id, durationMs: 1000, easing: 'linear', repeatCount: 1 },
    timelineTimeSeconds: sharedPlayhead,
    layerStartSeconds: 0,
    layerDurationSeconds: 4,
  })
  const loopLayer = sampleTextAnimation({
    definition: loop,
    settings: { animationId: loop.id, durationMs: 1000, easing: 'linear', repeatCount: 0 },
    timelineTimeSeconds: sharedPlayhead,
    layerStartSeconds: 3,
    layerDurationSeconds: 4,
  })
  assert.equal(entranceLayer.progress, 0.375)
  assert.equal(exitLayer.progress, 0.75)
  assert.equal(loopLayer.phase, 'running')
  assert.equal(loopLayer.progress, 0.75)
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

test('normalizes animation speed safely and clamps its supported range', () => {
  assert.equal(normalizeTextAnimationSettings({ animationId: 'fade', speed: 0 }).speed, 0.1)
  assert.equal(normalizeTextAnimationSettings({ animationId: 'fade', speed: 9 }).speed, 4)
  assert.equal(normalizeTextAnimationSettings({ animationId: 'fade', speed: 2.5 }).speed, 2.5)
})

test('speed scales the animation clock without changing authored duration settings', () => {
  const normal = sample(entrance, 2.25, { durationMs: 1000, speed: 1 })
  const fast = sample(entrance, 2.125, { durationMs: 1000, speed: 2 })
  assert.equal(normal.progress, fast.progress)
  assert.equal(fast.progress, 0.25)
})

test('finite repeats restart the motion and hold the final state after the last repeat', () => {
  const repeated = sample(entrance, 3.25, { durationMs: 1000, repeatCount: 2, direction: 'normal' })
  assert.equal(repeated.progress, 0.25)
  const completed = sample(entrance, 4.1, { durationMs: 1000, repeatCount: 2 })
  assert.equal(completed.phase, 'after')
  assert.equal(completed.progress, 1)
  assert.equal(completed.opacity, 1)
})

test('alternate direction reverses every second finite repeat', () => {
  const reversedSecond = sample(entrance, 3.25, { durationMs: 1000, repeatCount: 2, direction: 'alternate' })
  assert.equal(reversedSecond.progress, 0.25)
  assert.ok(reversedSecond.opacity > 0.7)
})

test('loop presets can run a finite number of cycles or indefinitely', () => {
  const finite = sample(loop, 4.1, { durationMs: 1000, repeatCount: 2 })
  assert.equal(finite.phase, 'after')
  const infinite = sample(loop, 3.5, { durationMs: 1000, repeatCount: 0 })
  assert.equal(infinite.phase, 'running')
  assert.equal(infinite.progress, 0.5)
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
  assert.equal(reverse.scaleX, 1.125)
  const alternate = sample(loop, 3.25, { direction: 'alternate' })
  assert.equal(alternate.scaleX, 1.125)
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
    settings: { animationId: smoothDefinition.id, durationMs: 1000, easing: 'linear' },
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


test('character animation motion stays restrained and stagger timing is ordered', () => {
  const effects = [
    'typewriter','reverse-typewriter','delete-typewriter','fade','rise','drop','pop','bounce',
    'rotate','flip','zoom','blur','slide','scatter','assemble','dissolve','wave','pulse',
    'stretch','squeeze','shuffle','reveal','mask-reveal','spark','stagger',
  ] as const
  for (const effect of effects) {
    for (let step = 1; step < 10; step++) {
      const sample = sampleCharacterMotion({ effect, progress: step / 10, index: 3, count: 8 })
      assert.ok(Math.abs(sample.translateX) <= 45, effect + ' horizontal travel')
      assert.ok(Math.abs(sample.translateY) <= 35, effect + ' vertical travel')
      assert.ok(Math.abs(sample.rotate) <= 60, effect + ' rotation')
      assert.ok(sample.blur >= 0 && sample.blur <= 9, effect + ' blur')
      assert.ok(sample.scaleX >= 0.04 && sample.scaleX <= 1.8, effect + ' horizontal scale')
      assert.ok(sample.scaleY >= 0.04 && sample.scaleY <= 1.8, effect + ' vertical scale')
    }
  }

  const first = sampleCharacterMotion({ effect: 'fade', progress: 0.25, index: 0, count: 8 })
  const last = sampleCharacterMotion({ effect: 'fade', progress: 0.25, index: 7, count: 8 })
  assert.ok(first.opacity > last.opacity, 'characters should reveal in a stable stagger order')
})

test('character motion returns exact neutral transforms at completion for every effect', () => {
  const effects = [
    'typewriter','reverse-typewriter','delete-typewriter','fade','rise','drop','pop','bounce',
    'rotate','flip','zoom','blur','slide','scatter','assemble','dissolve','wave','pulse',
    'stretch','squeeze','shuffle','reveal','mask-reveal','spark','stagger',
  ] as const
  for (const effect of effects) {
    assert.deepEqual(
      sampleCharacterMotion({ effect, progress: 1, index: 2, count: 8 }),
      { opacity: 1, translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotate: 0, blur: 0, clipProgress: 1 },
      effect,
    )
  }
})


test('Studio shared frame clock uses stable 30fps boundaries for preview and export', () => {
  assert.equal(STUDIO_FRAME_RATE, 30)
  assert.ok(Math.abs(STUDIO_FRAME_DURATION_SECONDS - 1 / 30) < 1e-12)
  for (const frame of [0, 1, 2, 15, 30, 59, 300, 1800]) {
    const seconds = studioFrameTime(frame)
    assert.equal(studioFrameIndexAtTime(seconds), frame)
    assert.equal(quantizeStudioTime(seconds), seconds)
    assert.equal(studioFrameTimeFromElapsedMs(seconds * 1000), seconds)
  }
})

test('Studio frame clock quantizes times consistently without going backwards', () => {
  const samples = [0, 0.001, 0.016, 0.033, 0.034, 0.049, 0.066, 0.099, 1.001, 9.999]
  let previous = -1
  for (const time of samples) {
    const quantized = quantizeStudioTime(time)
    assert.ok(quantized <= time + 1e-8)
    assert.ok(Math.abs(quantized * STUDIO_FRAME_RATE - Math.round(quantized * STUDIO_FRAME_RATE)) < 1e-8)
    assert.ok(quantized >= previous)
    previous = quantized
  }
  assert.equal(quantizeStudioTime(Number.NaN), 0)
  assert.equal(quantizeStudioTime(-5), 0)
  assert.equal(studioFrameTime(Number.POSITIVE_INFINITY), 0)
  assert.equal(studioFrameTimeFromElapsedMs(Number.NaN), 0)
})

test('preview elapsed time and export timeline time resolve to identical animation frames', () => {
  for (let frame = 0; frame < 600; frame++) {
    const previewTime = studioFrameTimeFromElapsedMs(frame * 1000 / STUDIO_FRAME_RATE + 12)
    const exportTime = quantizeStudioTime(frame / STUDIO_FRAME_RATE + 0.012)
    assert.equal(previewTime, exportTime, 'frame ' + frame)
  }
})


const COMPLETE_STUDIO_ANIMATION_CATALOG = [
  ...BASIC_ENTRANCE_ANIMATIONS,
  ...EXIT_ANIMATIONS,
  ...BOUNCE_ELASTIC_ANIMATIONS,
  ...ROTATION_3D_ANIMATIONS,
  ...TYPING_CHARACTER_ANIMATIONS,
]

test('previous Studio catalog QA validates the first 125 presets together with unique ids and names', () => {
  assert.equal(BASIC_ENTRANCE_ANIMATIONS.length, 25)
  assert.equal(EXIT_ANIMATIONS.length, 25)
  assert.equal(BOUNCE_ELASTIC_ANIMATIONS.length, 25)
  assert.equal(ROTATION_3D_ANIMATIONS.length, 25)
  assert.equal(TYPING_CHARACTER_ANIMATIONS.length, 25)
  assert.equal(COMPLETE_STUDIO_ANIMATION_CATALOG.length, 125)
  assert.equal(new Set(COMPLETE_STUDIO_ANIMATION_CATALOG.map(item => item.id)).size, 125)
  assert.equal(new Set(COMPLETE_STUDIO_ANIMATION_CATALOG.map(item => item.name.trim().toLocaleLowerCase())).size, 125)
  assert.deepEqual(validateTextAnimationRegistry(COMPLETE_STUDIO_ANIMATION_CATALOG), [])
})

test('first 125 Studio presets sample deterministically across the complete animation interval', () => {
  for (const definition of COMPLETE_STUDIO_ANIMATION_CATALOG) {
    const duration = definition.defaultDurationMs
    for (let frame = 0; frame <= 60; frame++) {
      const time = 2 + duration / 1000 * frame / 60
      const input = {
        definition,
        settings: {
          animationId: definition.id,
          durationMs: duration,
          delayMs: 0,
          repeatCount: definition.mode === 'loop' || definition.mode === 'continuous' ? 0 : 1,
          easing: definition.defaultEasing || 'ease',
          enabled: true,
        },
        timelineTimeSeconds: time,
        layerStartSeconds: 2,
        layerDurationSeconds: Math.max(4, duration / 1000 + 1),
      }
      const first = sampleTextAnimation(input)
      const second = sampleTextAnimation(input)
      assert.deepEqual(first, second, definition.id + ' deterministic frame ' + frame)
      for (const [key, value] of Object.entries(first)) {
        if (typeof value === 'number') assert.ok(Number.isFinite(value), definition.id + ' finite ' + key)
      }
      assert.ok(first.opacity >= 0 && first.opacity <= 1, definition.id + ' opacity bounds')
      assert.ok(first.scaleX > 0 && first.scaleY > 0, definition.id + ' positive scale')
      assert.ok(first.blur >= 0, definition.id + ' non-negative blur')
      assert.ok(Math.abs(first.translateX) < 2000 && Math.abs(first.translateY) < 2000, definition.id + ' bounded travel')
    }
  }
})

test('grapheme segmentation is cached and preserves Unicode text without shared mutation', () => {
  const text = 'SociaLens 👩🏽‍💻 é ✨'
  const first = splitStudioGraphemes(text)
  const second = splitStudioGraphemes(text)
  assert.equal(first, second)
  assert.deepEqual(first, ['S','o','c','i','a','L','e','n','s',' ','👩🏽‍💻',' ','é',' ','✨'])
  assert.throws(() => { (first as unknown as string[]).push('corrupt') })
  assert.deepEqual(splitStudioGraphemes(text), first)
})


test('Word & Line category contains exactly 25 unique presets numbered 126–150', () => {
  assert.equal(WORD_LINE_ANIMATIONS.length, 25)
  assert.deepEqual(validateTextAnimationRegistry(WORD_LINE_ANIMATIONS), [])
  assert.deepEqual(WORD_LINE_ANIMATIONS.map(item => item.id), Array.from({length:25},(_,index) => 'word-' + (126+index)))
  assert.equal(new Set(WORD_LINE_ANIMATIONS.map(item => item.name.toLowerCase())).size, 25)
  assert.equal(new Set(WORD_LINE_ANIMATIONS.map(item => item.wordEffect)).size, 25)
  for (const item of WORD_LINE_ANIMATIONS) {
    assert.equal(item.category, 'Word & Line')
    assert.equal(item.mode, 'entrance')
    assert.ok(item.description && item.description.length > 12)
    assert.ok(item.defaultDurationMs >= 900 && item.defaultDurationMs <= 1300)
  }
})

test('all 25 word and line effects are deterministic, finite and settle to neutral transforms', () => {
  for (const definition of WORD_LINE_ANIMATIONS) {
    for (let frame=0;frame<=60;frame++) {
      const progress=frame/60
      const input={effect:definition.wordEffect!,progress,index:2,count:7,intensity:1,lineIndex:1,lineCount:3}
      const first=sampleWordMotion(input)
      assert.deepEqual(sampleWordMotion(input),first,definition.id+' deterministic frame '+frame)
      for (const value of Object.values(first)) assert.ok(Number.isFinite(value),definition.id+' finite sample')
      assert.ok(first.opacity>=0&&first.opacity<=1)
      assert.ok(first.scale>0&&first.scale<=2)
      assert.ok(first.blur>=0&&first.blur<=24)
      assert.ok(first.clip>=0&&first.clip<=1)
      assert.ok(Math.abs(first.x)<100&&Math.abs(first.y)<100)
    }
    const end=sampleWordMotion({effect:definition.wordEffect!,progress:1,index:2,count:7,intensity:1,lineIndex:1,lineCount:3})
    assert.equal(end.opacity,1,definition.id+' opacity settles')
    assert.equal(end.x,0,definition.id+' x settles')
    assert.equal(end.y,0,definition.id+' y settles')
    assert.equal(end.scale,1,definition.id+' scale settles')
    assert.equal(end.rotate,0,definition.id+' rotation settles')
    assert.equal(end.blur,0,definition.id+' blur settles')
    assert.equal(end.clip,1,definition.id+' mask settles')
    assert.equal(end.spacing,0,definition.id+' spacing settles')
  }
})

test('line reveal and line cascade sequence complete lines in order', () => {
  const revealFirst=sampleWordMotion({effect:'line-reveal',progress:.2,index:0,count:4,lineIndex:0,lineCount:3})
  const revealLast=sampleWordMotion({effect:'line-reveal',progress:.2,index:0,count:4,lineIndex:2,lineCount:3})
  const cascadeFirst=sampleWordMotion({effect:'line-cascade',progress:.2,index:0,count:4,lineIndex:0,lineCount:3})
  const cascadeLast=sampleWordMotion({effect:'line-cascade',progress:.2,index:0,count:4,lineIndex:2,lineCount:3})
  assert.ok(revealFirst.opacity>revealLast.opacity)
  assert.ok(cascadeFirst.opacity>cascadeLast.opacity)
})

test('Wipe, Mask & Reveal category contains exactly 25 unique presets numbered 151–175',()=>{
  assert.equal(WIPE_MASK_REVEAL_ANIMATIONS.length,25)
  assert.deepEqual(validateTextAnimationRegistry(WIPE_MASK_REVEAL_ANIMATIONS),[])
  assert.deepEqual(WIPE_MASK_REVEAL_ANIMATIONS.map(item=>item.id),Array.from({length:25},(_,i)=>'mask-'+(151+i)))
  assert.equal(new Set(WIPE_MASK_REVEAL_ANIMATIONS.map(item=>item.name.toLowerCase())).size,25)
  assert.equal(new Set(WIPE_MASK_REVEAL_ANIMATIONS.map(item=>item.maskEffect)).size,25)
  for(const item of WIPE_MASK_REVEAL_ANIMATIONS){
    assert.equal(item.category,'Wipe, Mask & Reveal')
    assert.equal(item.mode,'entrance')
    assert.ok(item.description && item.description.length>12)
    assert.ok(item.defaultDurationMs>=850&&item.defaultDurationMs<=1250)
  }
})

test('all mask reveal effects are deterministic, bounded, start hidden and finish fully revealed',()=>{
  for(const definition of WIPE_MASK_REVEAL_ANIMATIONS){
    const effect=definition.maskEffect!
    let previous=-1
    for(let frame=0;frame<=60;frame++){
      const progress=frame/60
      const sample=sampleMaskReveal({effect,progress,intensity:1})
      assert.deepEqual(sample,sampleMaskReveal({effect,progress,intensity:1}),definition.id+' deterministic')
      assert.ok(Number.isFinite(sample.progress)&&sample.progress>=previous-1e-12&&sample.progress>=0&&sample.progress<=1,definition.id+' monotonic progress')
      assert.ok(sample.clipPath.length>0)
      previous=sample.progress
    }
    const start=sampleMaskReveal({effect,progress:0})
    const end=sampleMaskReveal({effect,progress:1})
    assert.equal(start.progress,0,definition.id+' starts closed')
    assert.equal(end.progress,1,definition.id+' ends open')
    assert.equal(end.clipPath,'inset(0 0 0 0)',definition.id+' exact full reveal')
    assert.equal(end.maskImage,'linear-gradient(#000,#000)',definition.id+' full opaque mask')
  }
})

test('canvas mask clipping uses the same terminal reveal state without non-finite geometry',()=>{
  const calls:Array<{method:string;values:number[]}>=[]
  const ctx={
    beginPath(){calls.push({method:'beginPath',values:[]})},
    rect(...values:number[]){calls.push({method:'rect',values})},
    clip(){calls.push({method:'clip',values:[]})},
    arc(...values:number[]){calls.push({method:'arc',values})},
    ellipse(...values:number[]){calls.push({method:'ellipse',values})},
    moveTo(...values:number[]){calls.push({method:'moveTo',values})},
    lineTo(...values:number[]){calls.push({method:'lineTo',values})},
    closePath(){calls.push({method:'closePath',values:[]})},
  } as unknown as CanvasRenderingContext2D
  for(const definition of WIPE_MASK_REVEAL_ANIMATIONS){
    calls.length=0
    const sample=sampleMaskReveal({effect:definition.maskEffect!,progress:1})
    clipCanvasForMask(ctx,sample,420,160)
    assert.ok(calls.some(call=>call.method==='clip'),definition.id+' applies canvas clip')
    assert.ok(calls.every(call=>call.values.every(Number.isFinite)),definition.id+' finite canvas geometry')
  }
})

test('Loop & Continuous category contains 25 unique presets numbered 176–200',()=>{
  assert.equal(LOOP_CONTINUOUS_ANIMATIONS.length,25)
  assert.deepEqual(validateTextAnimationRegistry(LOOP_CONTINUOUS_ANIMATIONS),[])
  assert.deepEqual(LOOP_CONTINUOUS_ANIMATIONS.map(item=>item.id),Array.from({length:25},(_,i)=>'loop-'+(176+i)))
  assert.equal(new Set(LOOP_CONTINUOUS_ANIMATIONS.map(item=>item.name.toLowerCase())).size,25)
  for(const item of LOOP_CONTINUOUS_ANIMATIONS){
    assert.equal(item.category,'Loop & Continuous')
    assert.equal(item.mode,'loop')
    assert.ok(item.description&&item.description.length>12)
    assert.ok(item.defaultDurationMs>=1000&&item.defaultDurationMs<=5000)
    const first=item.keyframes[0],last=item.keyframes[item.keyframes.length-1]
    for(const key of ['opacity','translateX','translateY','scaleX','scaleY','rotate','rotateX','rotateY','skewX','skewY','blur','letterSpacing'] as const){
      const neutral=key==='opacity'||key==='scaleX'||key==='scaleY'?1:0
      const start=first[key]??neutral
      const end=last[key]??neutral
      // A full 360° spin is visually identical to 0° at the cycle boundary.
      if(key==='rotate') assert.ok(Math.abs((((end-start+180)%360)+360)%360-180)<1e-9,item.id+' rotationally seamless '+key)
      else assert.ok(Math.abs(start-end)<1e-9,item.id+' seamless '+key)
    }
  }
})

test('all 25 continuous presets loop indefinitely and produce repeatable finite frames',()=>{
  for(const definition of LOOP_CONTINUOUS_ANIMATIONS){
    const duration=definition.defaultDurationMs/1000
    const settings={animationId:definition.id,durationMs:definition.defaultDurationMs,delayMs:0,repeatCount:0,direction:'normal' as const,easing:'linear' as const,enabled:true}
    const firstCycle=sampleTextAnimation({definition,settings,timelineTimeSeconds:0.37,layerStartSeconds:0,layerDurationSeconds:12})
    const secondCycle=sampleTextAnimation({definition,settings,timelineTimeSeconds:duration+0.37,layerStartSeconds:0,layerDurationSeconds:12})
    const thirdCycle=sampleTextAnimation({definition,settings,timelineTimeSeconds:duration*2+0.37,layerStartSeconds:0,layerDurationSeconds:12})
    const assertSameVisualFrame=(actual:ReturnType<typeof sampleTextAnimation>,expected:ReturnType<typeof sampleTextAnimation>,label:string)=>{
      for(const key of ['opacity','translateX','translateY','scaleX','scaleY','rotate','rotateX','rotateY','perspective','skewX','skewY','blur','letterSpacing'] as const){
        const delta=key==='rotate'?Math.abs((((actual[key]-expected[key]+180)%360)+360)%360-180):Math.abs(actual[key]-expected[key])
        assert.ok(delta<1e-7,definition.id+' '+label+' '+key+' drift '+delta)
      }
      assert.equal(actual.phase,expected.phase,definition.id+' '+label+' phase')
      assert.equal(actual.visible,expected.visible,definition.id+' '+label+' visibility')
    }
    assertSameVisualFrame(secondCycle,firstCycle,'second cycle')
    assertSameVisualFrame(thirdCycle,firstCycle,'third cycle')
    for(let frame=0;frame<=60;frame++){
      const sample=sampleTextAnimation({definition,settings,timelineTimeSeconds:duration*2*frame/60,layerStartSeconds:0,layerDurationSeconds:12})
      for(const [key,value] of Object.entries(sample)) if(typeof value==='number') assert.ok(Number.isFinite(value),definition.id+' finite '+key)
      assert.ok(sample.scaleX>0&&sample.scaleY>0,definition.id+' positive scale')
      assert.ok(sample.opacity>=0&&sample.opacity<=1,definition.id+' opacity range')
    }
    assert.equal(sampleTextAnimation({definition,settings,timelineTimeSeconds:duration*3,layerStartSeconds:0,layerDurationSeconds:12}).phase,'running',definition.id+' remains active')
  }
})

test('Motion & Dynamic category contains 25 unique presets numbered 201–225',()=>{
  assert.equal(MOTION_DYNAMIC_ANIMATIONS.length,25)
  assert.deepEqual(validateTextAnimationRegistry(MOTION_DYNAMIC_ANIMATIONS),[])
  assert.deepEqual(MOTION_DYNAMIC_ANIMATIONS.map(item=>item.id),Array.from({length:25},(_,i)=>'motion-'+(201+i)))
  assert.equal(new Set(MOTION_DYNAMIC_ANIMATIONS.map(item=>item.name.toLowerCase())).size,25)
  for(const item of MOTION_DYNAMIC_ANIMATIONS){
    assert.equal(item.category,'Motion & Dynamic')
    assert.equal(item.mode,'loop')
    assert.ok(item.description&&item.description.length>12)
    assert.ok(item.defaultDurationMs>=2000&&item.defaultDurationMs<=5200)
    const first=item.keyframes[0],last=item.keyframes[item.keyframes.length-1]
    for(const key of ['opacity','translateX','translateY','scaleX','scaleY','rotate','rotateX','rotateY','skewX','skewY','blur'] as const){
      const neutral=key==='opacity'||key==='scaleX'||key==='scaleY'?1:0
      const start=first[key]??neutral,end=last[key]??neutral
      if(key==='rotate') assert.ok(Math.abs((((end-start+180)%360)+360)%360-180)<1e-9,item.id+' rotationally seamless')
      else assert.ok(Math.abs(start-end)<1e-9,item.id+' seamless '+key)
    }
    assert.ok(item.keyframes.length>=3,item.id+' has authored motion path')
  }
})

test('Motion & Dynamic presets remain deterministic and bounded over repeated timeline samples',()=>{
  for(const definition of MOTION_DYNAMIC_ANIMATIONS){
    const duration=definition.defaultDurationMs/1000
    const settings={animationId:definition.id,durationMs:definition.defaultDurationMs,delayMs:0,repeatCount:0,direction:'normal' as const,easing:'ease-in-out' as const,enabled:true}
    const sampleAt=(time:number)=>sampleTextAnimation({definition,settings,timelineTimeSeconds:time,layerStartSeconds:0,layerDurationSeconds:18})
    const first=sampleAt(.413)
    assert.deepEqual(sampleAt(.413),first,definition.id+' deterministic')
    const next=sampleAt(duration+.413)
    for(const key of ['opacity','translateX','translateY','scaleX','scaleY','rotate','rotateX','rotateY','perspective','skewX','skewY','blur','letterSpacing'] as const){
      const delta=key==='rotate'?Math.abs((((next[key]-first[key]+180)%360)+360)%360-180):Math.abs(next[key]-first[key])
      assert.ok(delta<1e-7,definition.id+' cycle consistency '+key)
    }
    for(let frame=0;frame<=80;frame++){
      const sample=sampleAt(duration*frame/20)
      for(const [key,value] of Object.entries(sample)) if(typeof value==='number') assert.ok(Number.isFinite(value),definition.id+' finite '+key)
      assert.ok(sample.scaleX>0&&sample.scaleY>0,definition.id+' positive scale')
      assert.ok(sample.opacity>=0&&sample.opacity<=1,definition.id+' opacity bounds')
    }
  }
})

test('Cinematic & Light category contains 25 unique presets numbered 226–250',()=>{
  assert.equal(CINEMATIC_LIGHT_ANIMATIONS.length,25)
  assert.deepEqual(validateTextAnimationRegistry(CINEMATIC_LIGHT_ANIMATIONS),[])
  assert.deepEqual(CINEMATIC_LIGHT_ANIMATIONS.map(item=>item.id),Array.from({length:25},(_,i)=>'cinematic-'+(226+i)))
  assert.equal(new Set(CINEMATIC_LIGHT_ANIMATIONS.map(item=>item.name.toLowerCase())).size,25)
  for(const item of CINEMATIC_LIGHT_ANIMATIONS){
    assert.equal(item.category,'Cinematic & Light')
    assert.ok(item.description&&item.description.length>12)
    assert.ok(item.defaultDurationMs>=1000&&item.defaultDurationMs<=4500)
    assert.ok(item.keyframes.length>=3,item.id+' has authored keyframes')
    if(item.id==='cinematic-230'||item.id==='cinematic-237') assert.equal(item.mode,'exit',item.id+' uses exit timing')
    if(item.id==='cinematic-249'||item.id==='cinematic-250') assert.equal(item.mode,'loop',item.id+' uses loop timing')
    for(const frame of item.keyframes){
      if(frame.blur!==undefined) assert.ok(frame.blur>=0&&frame.blur<=20,item.id+' blur stays controlled')
      if(frame.opacity!==undefined) assert.ok(frame.opacity>=0&&frame.opacity<=1,item.id+' opacity stays bounded')
      if(frame.scaleX!==undefined) assert.ok(frame.scaleX>0&&frame.scaleX<=1.2,item.id+' scaleX stays restrained')
      if(frame.scaleY!==undefined) assert.ok(frame.scaleY>0&&frame.scaleY<=1.2,item.id+' scaleY stays restrained')
    }
    if(item.mode==='loop'){
      const first=item.keyframes[0],last=item.keyframes[item.keyframes.length-1]
      for(const key of ['opacity','translateX','translateY','scaleX','scaleY','rotate','rotateX','rotateY','skewX','skewY','blur'] as const){
        const neutral=key==='opacity'||key==='scaleX'||key==='scaleY'?1:0
        const start=first[key]??neutral,end=last[key]??neutral
        if(key==='rotate') assert.ok(Math.abs((((end-start+180)%360)+360)%360-180)<1e-9,item.id+' rotationally seamless')
        else assert.ok(Math.abs(start-end)<1e-9,item.id+' seamless '+key)
      }
    }
  }
})

test('Cinematic & Light presets sample deterministically without invalid visual values',()=>{
  for(const definition of CINEMATIC_LIGHT_ANIMATIONS){
    const settings={animationId:definition.id,durationMs:definition.defaultDurationMs,delayMs:0,repeatCount:definition.mode==='loop'?0:1,direction:'normal' as const,easing:'premium-out' as const,enabled:true}
    for(let frame=0;frame<=60;frame++){
      const time=definition.defaultDurationMs/1000*frame/60
      const sample=sampleTextAnimation({definition,settings,timelineTimeSeconds:time,layerStartSeconds:0,layerDurationSeconds:12})
      const repeated=sampleTextAnimation({definition,settings,timelineTimeSeconds:time,layerStartSeconds:0,layerDurationSeconds:12})
      assert.deepEqual(sample,repeated,definition.id+' deterministic')
      for(const [key,value] of Object.entries(sample)) if(typeof value==='number') assert.ok(Number.isFinite(value),definition.id+' finite '+key)
      assert.ok(sample.scaleX>0&&sample.scaleY>0,definition.id+' positive scale')
      assert.ok(sample.opacity>=0&&sample.opacity<=1,definition.id+' opacity bounds')
      assert.ok(sample.blur>=0&&sample.blur<=20,definition.id+' bounded blur')
    }
  }
})

test('Digital & Creative category contains 25 unique presets numbered 251–275',()=>{
  assert.equal(DIGITAL_CREATIVE_ANIMATIONS.length,25)
  assert.deepEqual(validateTextAnimationRegistry(DIGITAL_CREATIVE_ANIMATIONS),[])
  assert.deepEqual(DIGITAL_CREATIVE_ANIMATIONS.map(item=>item.id),Array.from({length:25},(_,i)=>'digital-'+(251+i)))
  assert.equal(new Set(DIGITAL_CREATIVE_ANIMATIONS.map(item=>item.name.toLowerCase())).size,25)
  for(const item of DIGITAL_CREATIVE_ANIMATIONS){
    assert.equal(item.category,'Digital & Creative')
    assert.ok(item.description&&item.description.length>12)
    assert.ok(item.defaultDurationMs>=900&&item.defaultDurationMs<=4000)
    assert.ok(item.keyframes.length>=3,item.id+' has authored keyframes')
    if([264,265,266,267].includes(Number(item.id.slice(8)))) assert.equal(item.mode,'exit',item.id+' exit mode')
    if(Number(item.id.slice(8))>=268&&Number(item.id.slice(8))<=274) assert.equal(item.mode,'loop',item.id+' loop mode')
    for(const frame of item.keyframes){
      if(frame.blur!==undefined) assert.ok(frame.blur>=0&&frame.blur<=20,item.id+' blur bounded')
      if(frame.opacity!==undefined) assert.ok(frame.opacity>=0&&frame.opacity<=1,item.id+' opacity bounded')
      if(frame.scaleX!==undefined) assert.ok(frame.scaleX>0&&frame.scaleX<=1.2,item.id+' scaleX bounded')
      if(frame.scaleY!==undefined) assert.ok(frame.scaleY>0&&frame.scaleY<=1.2,item.id+' scaleY bounded')
    }
    if(item.mode==='loop'){
      const first=item.keyframes[0],last=item.keyframes[item.keyframes.length-1]
      for(const key of ['opacity','translateX','translateY','scaleX','scaleY','rotate','rotateX','rotateY','skewX','skewY','blur','letterSpacing'] as const){
        const neutral=key==='opacity'||key==='scaleX'||key==='scaleY'?1:0
        assert.ok(Math.abs((first[key]??neutral)-(last[key]??neutral))<1e-9,item.id+' seamless '+key)
      }
    }
  }
})

test('Digital & Creative presets sample deterministically across their full duration',()=>{
  for(const definition of DIGITAL_CREATIVE_ANIMATIONS){
    const settings={animationId:definition.id,durationMs:definition.defaultDurationMs,delayMs:0,repeatCount:definition.mode==='loop'?0:1,direction:'normal' as const,easing:'premium-out' as const,enabled:true}
    for(let frame=0;frame<=60;frame++){
      const time=definition.defaultDurationMs/1000*frame/60
      const sample=sampleTextAnimation({definition,settings,timelineTimeSeconds:time,layerStartSeconds:0,layerDurationSeconds:15})
      const repeated=sampleTextAnimation({definition,settings,timelineTimeSeconds:time,layerStartSeconds:0,layerDurationSeconds:15})
      assert.deepEqual(sample,repeated,definition.id+' deterministic')
      for(const [key,value] of Object.entries(sample)) if(typeof value==='number') assert.ok(Number.isFinite(value),definition.id+' finite '+key)
      assert.ok(sample.scaleX>0&&sample.scaleY>0,definition.id+' positive scale')
      assert.ok(sample.opacity>=0&&sample.opacity<=1,definition.id+' opacity bounds')
      assert.ok(sample.blur>=0&&sample.blur<=20,definition.id+' blur bounds')
    }
  }
})

test('Artistic & Advanced category contains 25 unique presets numbered 276–300', () => {
  assert.equal(ARTISTIC_ADVANCED_ANIMATIONS.length, 25)
  assert.deepEqual(validateTextAnimationRegistry(ARTISTIC_ADVANCED_ANIMATIONS), [])
  assert.deepEqual(ARTISTIC_ADVANCED_ANIMATIONS.map(item => item.id), Array.from({ length: 25 }, (_, index) => 'artistic-' + (276 + index)))
  assert.equal(new Set(ARTISTIC_ADVANCED_ANIMATIONS.map(item => item.name.toLowerCase())).size, 25)
  for (const item of ARTISTIC_ADVANCED_ANIMATIONS) {
    assert.equal(item.category, 'Artistic & Advanced')
    assert.ok(item.description && item.description.length > 12)
    assert.ok(item.defaultDurationMs >= 900 && item.defaultDurationMs <= 4000)
    assert.ok(item.keyframes.length >= 3, item.id + ' has authored keyframes')
    if ([299, 300].includes(Number(item.id.slice(9)))) assert.equal(item.mode, 'exit', item.id + ' exit mode')
    if ([293, 294].includes(Number(item.id.slice(9)))) assert.equal(item.mode, 'loop', item.id + ' loop mode')
    for (const frame of item.keyframes) {
      if (frame.blur !== undefined) assert.ok(frame.blur >= 0 && frame.blur <= 20, item.id + ' blur bounded')
      if (frame.opacity !== undefined) assert.ok(frame.opacity >= 0 && frame.opacity <= 1, item.id + ' opacity bounded')
      if (frame.scaleX !== undefined) assert.ok(frame.scaleX > 0 && frame.scaleX <= 1.2, item.id + ' scaleX bounded')
      if (frame.scaleY !== undefined) assert.ok(frame.scaleY > 0 && frame.scaleY <= 1.2, item.id + ' scaleY bounded')
    }
    if (item.mode === 'loop') {
      const first = item.keyframes[0], last = item.keyframes[item.keyframes.length - 1]
      for (const key of ['opacity', 'translateX', 'translateY', 'scaleX', 'scaleY', 'rotate', 'rotateX', 'rotateY', 'skewX', 'skewY', 'blur', 'letterSpacing'] as const) {
        const neutral = key === 'opacity' || key === 'scaleX' || key === 'scaleY' ? 1 : 0
        assert.ok(Math.abs((first[key] ?? neutral) - (last[key] ?? neutral)) < 1e-9, item.id + ' seamless ' + key)
      }
    }
  }
})

test('Artistic & Advanced presets sample deterministically throughout their duration', () => {
  for (const definition of ARTISTIC_ADVANCED_ANIMATIONS) {
    const settings = { animationId: definition.id, durationMs: definition.defaultDurationMs, delayMs: 0, repeatCount: definition.mode === 'loop' ? 0 : 1, direction: 'normal' as const, easing: 'premium-out' as const, enabled: true }
    for (let frame = 0; frame <= 60; frame++) {
      const time = definition.defaultDurationMs / 1000 * frame / 60
      const sample = sampleTextAnimation({ definition, settings, timelineTimeSeconds: time, layerStartSeconds: 0, layerDurationSeconds: 15 })
      const repeated = sampleTextAnimation({ definition, settings, timelineTimeSeconds: time, layerStartSeconds: 0, layerDurationSeconds: 15 })
      assert.deepEqual(sample, repeated, definition.id + ' deterministic')
      for (const [key, value] of Object.entries(sample)) if (typeof value === 'number') assert.ok(Number.isFinite(value), definition.id + ' finite ' + key)
      assert.ok(sample.scaleX > 0 && sample.scaleY > 0, definition.id + ' positive scale')
      assert.ok(sample.opacity >= 0 && sample.opacity <= 1, definition.id + ' opacity bounds')
      assert.ok(sample.blur >= 0 && sample.blur <= 20, definition.id + ' blur bounds')
    }
  }
})

test('complete Studio animation catalog now contains 300 unique presets', () => {
  const all=[...BASIC_ENTRANCE_ANIMATIONS,...EXIT_ANIMATIONS,...BOUNCE_ELASTIC_ANIMATIONS,...ROTATION_3D_ANIMATIONS,...TYPING_CHARACTER_ANIMATIONS,...WORD_LINE_ANIMATIONS,...WIPE_MASK_REVEAL_ANIMATIONS,...LOOP_CONTINUOUS_ANIMATIONS,...MOTION_DYNAMIC_ANIMATIONS,...CINEMATIC_LIGHT_ANIMATIONS,...DIGITAL_CREATIVE_ANIMATIONS,...ARTISTIC_ADVANCED_ANIMATIONS]
  assert.equal(all.length,300)
  assert.equal(new Set(all.map(item=>item.id)).size,300)
  assert.equal(new Set(all.map(item=>item.name.toLowerCase())).size,300)
  assert.deepEqual(validateTextAnimationRegistry(all),[])
})


test('direction is applied to character, word, and mask renderer progress', () => {
  const normal = sample(entrance, 2.25, { direction: 'normal', easing: 'linear' })
  const reverse = sample(entrance, 2.25, { direction: 'reverse', easing: 'linear' })
  const alternateReverse = sample(loop, 2.25, { direction: 'alternate-reverse', easing: 'linear', repeatCount: 0 })
  assert.equal(normal.motionProgress, 0.25)
  assert.equal(reverse.motionProgress, 0.75)
  assert.equal(alternateReverse.motionProgress, 0.75)
})

test('all supported easing curves produce renderer progress and honor their endpoints', () => {
  const easings = ['linear','ease','ease-in','ease-out','ease-in-out','cubic-in','cubic-out','cubic-in-out','premium-out','premium-in','premium-in-out','back-out','back-in','elastic-out','bounce-out'] as const
  for (const easing of easings) {
    const start = sample(entrance, 2, { easing })
    const middle = sample(entrance, 2.5, { easing })
    const end = sample(entrance, 3, { easing })
    assert.equal(start.motionProgress, 0, easing + ' start')
    assert.ok(Number.isFinite(middle.motionProgress), easing + ' middle')
    assert.equal(end.motionProgress, 1, easing + ' end')
  }
})


test('every registered Studio animation exposes finite direction- and easing-aware progress', () => {
  const registry = [...BASIC_ENTRANCE_ANIMATIONS, ...EXIT_ANIMATIONS, ...BOUNCE_ELASTIC_ANIMATIONS, ...ROTATION_3D_ANIMATIONS, ...TYPING_CHARACTER_ANIMATIONS, ...WORD_LINE_ANIMATIONS, ...WIPE_MASK_REVEAL_ANIMATIONS, ...LOOP_CONTINUOUS_ANIMATIONS, ...MOTION_DYNAMIC_ANIMATIONS, ...CINEMATIC_LIGHT_ANIMATIONS, ...DIGITAL_CREATIVE_ANIMATIONS, ...ARTISTIC_ADVANCED_ANIMATIONS]
  assert.equal(registry.length, 300)
  for (const definition of registry) {
    for (const direction of ['normal', 'reverse', 'alternate', 'alternate-reverse'] as const) {
      for (const easing of ['linear','ease','ease-in','ease-out','ease-in-out','cubic-in','cubic-out','cubic-in-out','premium-out','premium-in','premium-in-out','back-out','back-in','elastic-out','bounce-out'] as const) {
        const result = sampleTextAnimation({
          definition,
          settings: { animationId: definition.id, durationMs: 1000, repeatCount: 2, direction, easing, enabled: true },
          timelineTimeSeconds: 2.35,
          layerStartSeconds: 2,
          layerDurationSeconds: 5,
        })
        assert.ok(Number.isFinite(result.motionProgress), definition.id + ' / ' + direction + ' / ' + easing)
      }
    }
  }
})
