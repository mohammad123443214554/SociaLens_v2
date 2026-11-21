import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SMART_CUTOUT_MAX_OBJECTS,
  normalizeSmartCutoutObjects,
  normalizeSmartCutoutSegmentations,
  parseSmartCutoutObjectResponse,
} from '../lib/studio/smart-cutout.ts'

test('Smart Cutout parses Gemini JSON and keeps only distinct meaningful objects', () => {
  const objects = parseSmartCutoutObjectResponse(JSON.stringify({ objects: [
    { label: ' Red Apple ', importance: 'high', reason: 'Main foreground subject' },
    { label: 'red apple', importance: 'medium', reason: 'Duplicate label' },
    { label: 'background', importance: 'high', reason: 'Not an object' },
    { label: 'Ceramic coffee mug', importance: 'high', reason: 'Separate foreground object' },
  ] }))
  assert.deepEqual(objects.map(item => item.label), ['Red Apple', 'Ceramic coffee mug'])
  assert.equal(objects[0].importance, 'high')
  assert.equal(objects[0].id, 'smart-object-1')
})

test('Smart Cutout limits the inventory and ignores malformed or generic labels', () => {
  const objects = normalizeSmartCutoutObjects({
    objects: [
      null,
      { label: 'object' },
      ...Array.from({ length: 12 }, (_, index) => ({ label: 'Object ' + (index + 1), importance: 'high' })),
    ],
  })
  assert.equal(objects.length, SMART_CUTOUT_MAX_OBJECTS)
  assert.equal(objects[0].label, 'Object 1')
})

test('Smart Cutout normalizes SAM 3 masks and keeps separate instances distinct', () => {
  const objects = normalizeSmartCutoutObjects({
    objects: [
      { label: 'red apple', importance: 'high', reason: 'Main subject' },
      { label: 'coffee mug', importance: 'medium', reason: 'Second subject' },
    ],
  })
  const result = normalizeSmartCutoutSegmentations({
    image: { width: 100, height: 50 },
    prompt_results: [
      {
        echo: { text: 'red apple' },
        predictions: [
          { confidence: 0.98, masks: [[[10, 10], [30, 10], [30, 30], [10, 30]]] },
          { confidence: 0.91, masks: [[[50, 10], [70, 10], [70, 30], [50, 30]]] },
        ],
      },
      {
        echo: { text: 'coffee mug' },
        predictions: [
          { confidence: 0.88, masks: [[[75, 10], [90, 10], [90, 35], [75, 35]]] },
        ],
      },
    ],
  }, objects, 200, 100)

  assert.equal(result.segmentations.length, 3)
  assert.deepEqual(result.segmentations.map(item => item.label), ['red apple', 'red apple', 'coffee mug'])
  assert.deepEqual(result.segmentations[0].polygons[0][0], [20, 20])
  assert.deepEqual(result.segmentations.map(item => item.instanceIndex), [1, 2, 1])
  assert.deepEqual(result.missingLabels, [])
})

test('Smart Cutout preserves multiple people, animals and products as independent instances', () => {
  const objects = normalizeSmartCutoutObjects({ objects: [
    { label: 'person', importance: 'high' },
    { label: 'golden retriever', importance: 'high' },
    { label: 'ceramic vase', importance: 'medium' },
  ] })
  const result = normalizeSmartCutoutSegmentations({
    image: { width: 300, height: 200 },
    prompt_results: [
      { echo: { text: 'person' }, predictions: [
        { confidence: 1.4, masks: [[[5, 5], [40, 5], [40, 90], [5, 90]]] },
        { confidence: -0.2, masks: [[[60, 5], [95, 5], [95, 90], [60, 90]]] },
      ] },
      { echo: { text: 'golden retriever' }, predictions: [
        { confidence: 0.93, masks: [[[110, 40], [180, 40], [180, 120], [110, 120]]] },
      ] },
      { echo: { text: 'ceramic vase' }, predictions: [
        { confidence: 0.87, masks: [[[210, 20], [260, 20], [260, 100], [210, 100]]] },
      ] },
    ],
  }, objects, 300, 200)

  assert.equal(result.segmentations.length, 4)
  assert.deepEqual(result.segmentations.map(item => item.label), [
    'person', 'person', 'golden retriever', 'ceramic vase',
  ])
  assert.deepEqual(result.segmentations.map(item => item.confidence), [1, 0, 0.93, 0.87])
  assert.equal(new Set(result.segmentations.map(item => item.id)).size, 4)
  assert.deepEqual(result.missingLabels, [])
})

test('Smart Cutout ignores malformed SAM 3 predictions without fabricating polygons', () => {
  const objects = normalizeSmartCutoutObjects({ objects: [{ label: 'wooden chair' }] })
  const result = normalizeSmartCutoutSegmentations({
    prompt_results: [{
      echo: { text: 'wooden chair' },
      predictions: [
        { confidence: 'not-a-number', masks: [[[1, 1], [1, 1], [1, 1]]] },
        { confidence: 0.8, masks: [[[0, 0], [10, 0], ['bad', 8]]] },
        { confidence: 0.8, masks: [[[0, 0], [10, 0], [10, 10], [0, 10]]] },
      ],
    }],
  }, objects, 100, 100)
  assert.equal(result.segmentations.length, 1)
  assert.deepEqual(result.segmentations[0].polygons, [[[0, 0], [10, 0], [10, 10], [0, 10]]])
  assert.deepEqual(result.missingLabels, [])
})

test('Smart Cutout reports objects for which SAM 3 returned no masks', () => {
  const objects = normalizeSmartCutoutObjects({
    objects: [
      { label: 'chair', importance: 'high' },
      { label: 'floor lamp', importance: 'medium' },
    ],
  })
  const result = normalizeSmartCutoutSegmentations({
    prompt_results: [
      { echo: { text: 'chair' }, predictions: [] },
    ],
  }, objects, 100, 100)

  assert.equal(result.segmentations.length, 0)
  assert.deepEqual(result.missingLabels, ['chair', 'floor lamp'])
})

test('Smart Cutout does not fabricate masks from malformed provider output', () => {
  const objects = normalizeSmartCutoutObjects({ objects: [{ label: 'dog' }] })
  const result = normalizeSmartCutoutSegmentations({ predictions: [] }, objects, 100, 100)
  assert.deepEqual(result.segmentations, [])
  assert.deepEqual(result.missingLabels, ['dog'])
})
