'use client'

// SociaLens doesn't ship illustrated sticker packs (that's a whole art asset
// library), so "stickers" here are large, borderless mood emoji sent at
// sticker size - same tap-a-mood UX as a real sticker tray, grouped by
// feeling rather than the alphabetical emoji-picker layout.
const STICKER_CATEGORIES: { label: string; stickers: string[] }[] = [
  { label: 'Happy', stickers: ['😀','😁','😄','😆','🤣','😂','🙂','😊','😇','🥳','🎉','✨'] },
  { label: 'Love', stickers: ['😍','🥰','😘','💕','💖','💘','❤️','💗','💝','😻','💋','💍'] },
  { label: 'Funny', stickers: ['🤪','😜','🤭','🙈','🤡','😹','🥴','🫠','🙃','😝','🤓','😎'] },
  { label: 'Sad', stickers: ['😢','😭','🥺','😞','💔','😔','😿','😥','🙁','😪','😓','😰'] },
  { label: 'Angry', stickers: ['😡','🤬','😤','👿','💢','😾','🔥','😠','🙄','😑','🤦','🤷'] },
  { label: 'Love you', stickers: ['🥰','😘','🤗','💞','🫶','👉👈','🙏','💐','🌹','💌','😳','☺️'] },
  { label: 'Celebrate', stickers: ['🎊','🎂','🥂','🍾','🎁','🏆','🙌','👏','🥳','🎈','⭐','💯'] },
  { label: 'Chill', stickers: ['😴','🥱','☕','🛌','😌','🧘','🌙','😪','🫡','🤙','😏','🍿'] },
]

interface StickerPickerProps {
  onSelect: (sticker: string) => void
  onClose: () => void
  style?: React.CSSProperties
}

export function StickerPicker({ onSelect, onClose, style }: StickerPickerProps) {
  return (
    <div
      className="fixed bg-card border rounded-2xl shadow-2xl w-80 max-h-80 flex flex-col z-50"
      style={style}
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <p className="text-xs font-semibold text-muted-foreground">Stickers</p>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
      </div>
      <div className="overflow-y-auto p-2.5 space-y-3">
        {STICKER_CATEGORIES.map(cat => (
          <div key={cat.label}>
            <p className="text-[10px] font-medium text-muted-foreground px-1 mb-1">{cat.label}</p>
            <div className="grid grid-cols-6 gap-1">
              {cat.stickers.map((sticker, i) => (
                <button
                  key={cat.label + i}
                  type="button"
                  onClick={() => onSelect(sticker)}
                  className="text-3xl p-1.5 rounded-xl hover:bg-accent hover:scale-110 transition-transform"
                >
                  {sticker}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
