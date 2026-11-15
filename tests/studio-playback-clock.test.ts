import test from 'node:test'
import assert from 'node:assert/strict'
import { canAdvanceStudioAudio, lastStudioFrameBeforeEnd, keepStudioTimeMonotonic } from '../lib/studio/frame-clock.ts'
import { normalizeStudioClipGaps } from '../lib/studio/timeline.ts'

test('audio continues over image clips and timeline gaps', () => {
  assert.equal(canAdvanceStudioAudio(false, false), true)
  assert.equal(canAdvanceStudioAudio(false, true), true)
})

test('audio stays paused while an active video is buffering or seeking', () => {
  assert.equal(canAdvanceStudioAudio(true, false), false)
})

test('audio resumes only after the active video can advance', () => {
  assert.equal(canAdvanceStudioAudio(true, true), true)
})

test('closes small accidental gaps between clips on the same lane', () => {
  const clips = [
    { id: 'video', timelineStart: 0, trimStart: 0, trimEnd: 32.933333, lane: 0 },
    { id: 'photo', timelineStart: 33.198005, trimStart: 0, trimEnd: 5, lane: 0 },
  ]
  const normalized = normalizeStudioClipGaps(clips)
  assert.equal(normalized[1].timelineStart, 32.933333)
  assert.equal(normalized[1].timelineStart - (normalized[0].timelineStart + normalized[0].trimEnd), 0)
  assert.equal(clips[1].timelineStart, 33.198005, 'normalization must not mutate saved input')
})

test('preserves deliberate gaps larger than the snap threshold', () => {
  const clips = [
    { timelineStart: 0, trimStart: 0, trimEnd: 10, lane: 0 },
    { timelineStart: 10.5, trimStart: 0, trimEnd: 5, lane: 0 },
  ]
  assert.equal(normalizeStudioClipGaps(clips)[1].timelineStart, 10.5)
})

test('normalizes each media lane independently', () => {
  const clips = [
    { timelineStart: 0, trimStart: 0, trimEnd: 10, lane: 0 },
    { timelineStart: 10.2, trimStart: 0, trimEnd: 5, lane: 1 },
  ]
  assert.equal(normalizeStudioClipGaps(clips)[1].timelineStart, 10.2)
})

test('stops playback on the last visible frame, not the exclusive end', () => {
  assert.equal(lastStudioFrameBeforeEnd(38.198005), 38 + 4 / 30)
  assert.equal(lastStudioFrameBeforeEnd(0), 0)
})

test('playback clock never moves backwards after a decoder-driven clip handoff', () => {
  const exactVideoEnd = 32.933333
  assert.equal(keepStudioTimeMonotonic(32.9, exactVideoEnd), exactVideoEnd)
  assert.equal(keepStudioTimeMonotonic(32.966666, exactVideoEnd), 32.966666)
})

test('clip handoff keeps the exact non-frame-aligned timeline boundary', () => {
  const videoEnd = 32.933333
  const photoStart = 32.933333
  assert.equal(Math.min(videoEnd, 37.933333), photoStart)
  assert.equal(keepStudioTimeMonotonic(photoStart, 32.9), photoStart)
})
