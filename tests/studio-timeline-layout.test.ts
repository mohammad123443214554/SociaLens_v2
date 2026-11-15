import test from 'node:test'
import assert from 'node:assert/strict'
import { arrangeStudioClips, moveStudioClipWithoutOverlap } from '../lib/studio/timeline.ts'

const clip = (id: string, timelineStart: number, duration: number) => ({
  id,
  timelineStart,
  trimStart: 0,
  trimEnd: duration,
  lane: 0,
})

const assertNoOverlaps = (clips: ReturnType<typeof clip>[]) => {
  const ordered = [...clips].sort((a, b) => a.timelineStart - b.timelineStart)
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]
    assert.ok(ordered[index].timelineStart >= previous.timelineStart + previous.trimEnd - previous.trimStart - 1e-9)
  }
}

test('arranges existing overlapping clips into one non-overlapping Media lane', () => {
  const arranged = arrangeStudioClips([
    clip('main-video', 0, 32),
    clip('photo', 20, 5),
    clip('ending', 34, 4),
  ])
  assert.deepEqual(arranged.map(item => [item.id, item.timelineStart]), [
    ['main-video', 0],
    ['photo', 32],
    ['ending', 37],
  ])
  assertNoOverlaps(arranged)
})

test('dropping a right-side clip into the first clip position pushes the first clip right', () => {
  const arranged = moveStudioClipWithoutOverlap([
    clip('left-video', 0, 32),
    clip('right-photo', 20, 5),
  ], 'right-photo', 0)
  assert.deepEqual(arranged.map(item => [item.id, item.timelineStart]), [
    ['right-photo', 0],
    ['left-video', 5],
  ])
  assertNoOverlaps(arranged)
})

test('dropping a clip inside another clip reorders it without stacking', () => {
  const arranged = moveStudioClipWithoutOverlap([
    clip('video', 0, 32),
    clip('photo', 20, 5),
  ], 'video', 20)
  assert.deepEqual(arranged.map(item => [item.id, item.timelineStart]), [
    ['video', 20],
    ['photo', 52],
  ])
  assertNoOverlaps(arranged)
})

test('keeps intentional empty space when moving a clip into a free area', () => {
  const arranged = moveStudioClipWithoutOverlap([
    clip('first', 0, 5),
    clip('second', 15, 5),
  ], 'second', 30)
  assert.deepEqual(arranged.map(item => [item.id, item.timelineStart]), [
    ['first', 0],
    ['second', 30],
  ])
  assertNoOverlaps(arranged)
})
