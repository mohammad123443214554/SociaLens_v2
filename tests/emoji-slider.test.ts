import test from 'node:test'
import assert from 'node:assert/strict'
import { isValidEmojiSliderEmoji, normalizeEmojiSliderQuestion, validateEmojiSliderScore } from '../lib/utils/emojiSlider.ts'

test('Emoji Slider accepts both inclusive score endpoints and intermediate integers', () => {
  assert.equal(validateEmojiSliderScore(0), 0)
  assert.equal(validateEmojiSliderScore(100), 100)
  assert.equal(validateEmojiSliderScore(47), 47)
})

test('Emoji Slider rejects non-integer, missing, and out-of-range scores', () => {
  for (const value of [-1, 101, 1.5, NaN, Infinity, null, undefined, '50']) {
    assert.equal(validateEmojiSliderScore(value), null)
  }
})

test('Emoji Slider question is trimmed and constrained to 1–100 characters', () => {
  assert.equal(normalizeEmojiSliderQuestion('  How much do you like this?  '), 'How much do you like this?')
  assert.equal(normalizeEmojiSliderQuestion('   '), null)
  assert.equal(normalizeEmojiSliderQuestion('x'.repeat(101)), null)
  assert.equal(normalizeEmojiSliderQuestion(null), null)
})

test('Emoji Slider emoji must be one of the supported single reaction choices', () => {
  assert.equal(isValidEmojiSliderEmoji('🔥'), true)
  assert.equal(isValidEmojiSliderEmoji('not emoji'), false)
  assert.equal(isValidEmojiSliderEmoji('🔥🔥'), false)
})
