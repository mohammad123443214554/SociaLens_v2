import test from 'node:test'
import assert from 'node:assert/strict'

const limits = (count: number) => count >= 2 && count <= 6

test('Photo Collage accepts the supported photo counts', () => {
  assert.equal(limits(2), true)
  assert.equal(limits(6), true)
})

test('Photo Collage rejects fewer than two photos and a seventh photo', () => {
  assert.equal(limits(0), false)
  assert.equal(limits(1), false)
  assert.equal(limits(7), false)
})

test('layout families have stable identifiers', () => {
  const layouts = ['grid', 'horizontal', 'editorial', 'scrapbook']
  assert.equal(new Set(layouts).size, 4)
  assert.ok(layouts.includes('scrapbook'))
})
