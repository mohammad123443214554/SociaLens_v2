import test from 'node:test'
import assert from 'node:assert/strict'
import { getPhotoCollagePositions, isValidPhotoCollageCount } from '../lib/utils/photoCollage.ts'

test('Photo Collage accepts only two through six photos', () => {
  assert.equal(isValidPhotoCollageCount(2), true)
  assert.equal(isValidPhotoCollageCount(6), true)
  for (const count of [-1, 0, 1, 7, 2.5]) assert.equal(isValidPhotoCollageCount(count), false)
})

test('every layout returns one valid bounded position per selected photo', () => {
  const layouts = ['grid', 'horizontal', 'vertical', 'editorial', 'scrapbook'] as const
  for (const layout of layouts) {
    for (let count = 2; count <= 6; count++) {
      const positions = getPhotoCollagePositions(count, layout)
      assert.equal(positions.length, count, `${layout} with ${count} photos`)
      for (const p of positions) {
        assert.ok(Number.isFinite(p.x) && p.x >= 0 && p.x <= 100)
        assert.ok(Number.isFinite(p.y) && p.y >= 0 && p.y <= 100)
        assert.ok(Number.isFinite(p.width) && p.width > 0 && p.width <= 100)
        assert.ok(Number.isFinite(p.height) && p.height > 0 && p.height <= 100)
      }
    }
  }
})
