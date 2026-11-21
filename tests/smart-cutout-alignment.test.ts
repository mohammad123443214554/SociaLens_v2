import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createSmartCutoutAlignedLayers,
  getSmartCutoutPixelBounds,
} from '../lib/studio/smart-cutout-alignment.ts'

const source = {
  id: 'source-photo',
  kind: 'image' as const,
  x: 12.5,
  y: 8.25,
  width: 72,
  height: 64,
  cropLeft: 0.08,
  cropRight: 0.12,
  cropTop: 0.04,
  cropBottom: 0.06,
  timelineStart: 2.5,
  trimStart: 0.4,
  trimEnd: 8.4,
  duration: 12,
}

const background = {
  id: 'background-layer',
  name: 'clean-background.png',
  url: 'https://assets.example/background.png',
  storagePath: 'user/project/background.png',
  fileSize: 2048,
}

const objects = [
  { id: 'object-a', name: 'object-a.png', url: 'https://assets.example/a.png', storagePath: 'user/project/a.png', fileSize: 1024, objectId: 'obj-a', label: 'Red mug' },
  { id: 'object-b', name: 'object-b.png', url: 'https://assets.example/b.png', storagePath: 'user/project/b.png', fileSize: 1536, objectId: 'obj-b', label: 'Blue book' },
]

test('Smart Cutout layers inherit identical position, size, crop and timeline timing', () => {
  const before = structuredClone(source)
  const layers = createSmartCutoutAlignedLayers(source, 'group-1', background, objects)
  assert.equal(layers.length, 3)
  for (const layer of layers) {
    for (const key of ['x', 'y', 'width', 'height', 'cropLeft', 'cropRight', 'cropTop', 'cropBottom', 'timelineStart', 'trimStart', 'trimEnd', 'duration'] as const) {
      assert.equal(layer[key], source[key] ?? 0, key)
    }
    assert.equal(layer.smartCutoutSourceElementId, source.id)
    assert.equal(layer.smartCutoutGroupId, 'group-1')
  }
  assert.equal(layers[0].smartCutoutRole, 'background')
  assert.equal(layers[1].smartCutoutObjectLabel, 'Red mug')
  assert.equal(layers[2].smartCutoutObjectLabel, 'Blue book')
  assert.deepEqual(source, before, 'source photo must remain unchanged')
})

test('Smart Cutout pixel bounds match the Studio crop placement math', () => {
  const bounds = getSmartCutoutPixelBounds(source, 1080, 1920)
  assert.deepEqual(bounds, {
    x: 1080 * (12.5 + 72 * 0.08) / 100,
    y: 1920 * (8.25 + 64 * 0.04) / 100,
    width: 1080 * 72 * (1 - 0.08 - 0.12) / 100,
    height: 1920 * 64 * (1 - 0.04 - 0.06) / 100,
  })
})

test('Smart Cutout rejects invalid source transforms and duplicate layer IDs', () => {
  assert.throws(() => createSmartCutoutAlignedLayers({ ...source, cropLeft: 0.9, cropRight: 0.2 }, 'group-1', background, objects), /invalid placement or crop/)
  assert.throws(() => createSmartCutoutAlignedLayers(source, 'group-1', background, [objects[0], { ...objects[1], id: objects[0].id }]), /valid saved image details/)
})

test('Smart Cutout rejects empty output collections and invalid composition sizes', () => {
  assert.throws(() => createSmartCutoutAlignedLayers(source, 'group-1', background, []), /between 1 and 32/)
  assert.throws(() => getSmartCutoutPixelBounds(source, 0, 1920), /dimensions are invalid/)
})
