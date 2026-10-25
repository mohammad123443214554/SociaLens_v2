export const EMOJI_SLIDER_CHOICES = ['🔥','❤️','😍','😂','😮','😢','😡','👏','👍','😎','🥰','💯','✨','🤩','🥹','🙌','💖','🎉','💀','🤔'] as const

export function normalizeEmojiSliderQuestion(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const question = value.trim()
  return question.length >= 1 && question.length <= 100 ? question : null
}

export function isValidEmojiSliderEmoji(value: unknown): value is typeof EMOJI_SLIDER_CHOICES[number] {
  return typeof value === 'string' && (EMOJI_SLIDER_CHOICES as readonly string[]).includes(value)
}

export function validateEmojiSliderScore(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100 ? value : null
}
