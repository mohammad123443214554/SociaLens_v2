import test from 'node:test'
import assert from 'node:assert/strict'
import { SHAPECUT_CATEGORIES, SHAPECUT_SHAPES, getShapeCutPath, searchShapeCutShapes } from '../lib/utils/shapeCut.ts'

test('ShapeCut ships exactly 120 uniquely identified shapes in seven categories', () => {
  assert.equal(SHAPECUT_SHAPES.length, 120)
  assert.equal(new Set(SHAPECUT_SHAPES.map(shape => shape.id)).size, 120)
  assert.deepEqual(SHAPECUT_CATEGORIES, ['Basic', 'Geometric', 'Stars & Symbols', 'Nature & Flowers', 'Organic Blobs', 'Frames & Arches', 'Creative'])
  assert.deepEqual(SHAPECUT_CATEGORIES.map(category => SHAPECUT_SHAPES.filter(shape => shape.category === category).length), [15, 20, 15, 15, 20, 15, 20])
})

test('every ShapeCut template resolves to a non-empty SVG masking path', () => {
  for (const shape of SHAPECUT_SHAPES) {
    const path = getShapeCutPath(shape.id)
    assert.ok(path.length > 8, `${shape.id} (${shape.name}) should have a mask path`)
    assert.match(path, /^M\s/)
  }
})

test('ShapeCut search discovers common shape families', () => {
  assert.ok(searchShapeCutShapes('heart').some(shape => shape.name === 'Heart'))
  assert.ok(searchShapeCutShapes('star').some(shape => shape.name.includes('Star')))
  assert.ok(searchShapeCutShapes('arch').some(shape => shape.name.includes('Arch')))
  assert.equal(searchShapeCutShapes('blob').length, 20)
})
