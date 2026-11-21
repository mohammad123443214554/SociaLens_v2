import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getSmartCutoutTimelineLabel,
  removeSmartCutoutGroup,
  restoreSmartCutoutGroup,
} from '../lib/studio/smart-cutout-project.ts'

const group = [
  { id: 'bg', smartCutoutGroupId: 'group-1', smartCutoutRole: 'background' as const, smartCutoutSourceElementId: 'source' },
  { id: 'object-1', smartCutoutGroupId: 'group-1', smartCutoutRole: 'object' as const, smartCutoutObjectLabel: 'Red mug', smartCutoutSourceElementId: 'source' },
  { id: 'object-2', smartCutoutGroupId: 'group-1', smartCutoutRole: 'object' as const, smartCutoutObjectLabel: 'Blue book', smartCutoutSourceElementId: 'source' },
]

test('undo removes only the selected Smart Cutout group and preserves source/other layers', () => {
  const project = [{ id: 'source' }, { id: 'unrelated' }, ...group]
  const result = removeSmartCutoutGroup(project, 'group-1')
  assert.deepEqual(result.removed, group)
  assert.deepEqual(result.layers.map(layer => layer.id), ['source', 'unrelated'])
})

test('redo restores the complete group without duplicate IDs', () => {
  const current = [{ id: 'source' }, { id: 'unrelated' }, group[1]]
  const restored = restoreSmartCutoutGroup(current, group)
  assert.deepEqual(restored.map(layer => layer.id), ['source', 'unrelated', 'object-1', 'bg', 'object-2'])
  assert.equal(restoreSmartCutoutGroup(restored, group), restored)
})

test('redo rejects a mixed or incomplete group snapshot', () => {
  assert.throws(() => restoreSmartCutoutGroup([], [group[0], { id: 'broken' }]), /snapshot is incomplete/)
})

test('timeline labels distinguish cutout objects, clean background and regular elements', () => {
  assert.equal(getSmartCutoutTimelineLabel(group[1], 2), 'Red mug')
  assert.equal(getSmartCutoutTimelineLabel(group[0], 1), 'Clean background')
  assert.equal(getSmartCutoutTimelineLabel({ id: 'plain' }, 3), 'Element 3')
})
