import test from 'node:test'
import assert from 'node:assert/strict'
import { getPhotoCollagePositions, isValidPhotoCollageCount } from '../lib/utils/photoCollage.ts'

const layouts = ['grid', 'horizontal', 'vertical', 'editorial', 'scrapbook', 'vintage', 'birthday', 'torn-paper', 'memory-wall', 'film-strip', 'polaroid-wall'] as const

test('Photo Collage accepts any integer count of two or more photos', () => {
  assert.equal(isValidPhotoCollageCount(2), true)
  assert.equal(isValidPhotoCollageCount(6), true)
  assert.equal(isValidPhotoCollageCount(7), true)
  assert.equal(isValidPhotoCollageCount(24), true)
  for (const count of [-1, 0, 1, 2.5]) assert.equal(isValidPhotoCollageCount(count), false)
})

test('every layout returns one valid position per photo for small and large collages', () => {
  for (const layout of layouts) {
    for (const count of [2, 3, 4, 6, 7, 12, 24]) {
      const positions = getPhotoCollagePositions(count, layout)
      assert.equal(positions.length, count, `${layout} with ${count} photos`)
      for (const p of positions) {
        assert.ok(Number.isFinite(p.x) && p.x >= 0 && p.x <= 100, `${layout}: x=${p.x}`)
        assert.ok(Number.isFinite(p.y) && p.y >= 0 && p.y <= 100, `${layout}: y=${p.y}`)
        assert.ok(Number.isFinite(p.width) && p.width > 0 && p.width <= 100, `${layout}: width=${p.width}`)
        assert.ok(Number.isFinite(p.height) && p.height > 0 && p.height <= 100, `${layout}: height=${p.height}`)
      }
    }
  }
})
