'use client'

// A small, dependency-free emoji grid. Good enough for "spice up a story
// caption" without pulling in a whole emoji-picker package.
const EMOJIS = [
  '😀', '😂', '🥰', '😍', '😎', '🤔', '😭', '😱', '🥳', '😴',
  '👍', '👏', '🙌', '🙏', '💪', '👀', '🤝', '✌️', '🤞', '👌',
  '❤️', '🔥', '✨', '⭐', '🎉', '💯', '😊', '😉', '😅', '🤩',
  '🥺', '😡', '😢', '🤗', '😇', '🤯', '🥶', '🤤', '😜', '🫡',
  '🎂', '🎁', '🌟', '🌈', '☀️', '🌙', '⚡', '💧', '🍀', '🌸',
  '📸', '🎬', '🎵', '⚽', '🏆', '✈️', '🚗', '🏠', '📍', '💬',
  '❤️', '💕', '❤️‍🩹', '☠️', '😶‍🌫️', '🙏', '😎', '🤐', '🤑', '💔',
]

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  onClose: () => void
}

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 bg-card border rounded-xl shadow-lg p-3 z-50">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground">Emoji</p>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
          Close
        </button>
      </div>
      <div className="grid grid-cols-8 gap-1 max-h-40 overflow-y-auto">
        {EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onSelect(emoji)}
            className="text-xl p-1.5 rounded-lg hover:bg-accent transition-colors"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
} 
