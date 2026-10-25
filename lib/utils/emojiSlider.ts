export const EMOJI_SLIDER_CHOICES = ['🔥','❤️','😍','😂','😮','😢','😡','👏','👍','😎','🥰','💯','✨','🤩','🥹','🙌','💖','🎉','💀','🤔'] as const

export function normalizeEmojiSliderQuestion(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const question = value.trim()
  return question.length >= 1 && question.length <= 100 ? question : null
}

export function isValidEmojiSliderEmoji(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 16 || value.trim() !== value) return false
  const graphemes = Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value))
  return graphemes.length === 1 && /\\p{Extended_Pictographic}|\\p{Regional_Indicator}{2}|(?:[#*0-9]\\uFE0F?\\u20E3)/u.test(value)
}

export function validateEmojiSliderScore(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100 ? value : null
}
