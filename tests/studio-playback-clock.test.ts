import test from 'node:test'
import assert from 'node:assert/strict'
import { canAdvanceStudioAudio } from '../lib/studio/frame-clock.ts'

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
