'use client'

import { useMemo, useState } from 'react'
import { ArrowLeft, Search, X } from 'lucide-react'

const CATEGORIES = [
  { label: 'Trending', emojis: ['😂','❤️','🔥','🥹','😍','😭','✨','🥰','🤣','💀','🙌','💖','😎','🥳','🤍','💯','🫶','😱','😘','🎉','👏','🤩','😅','💋'] },
  { label: 'Funny', emojis: ['😂','🤣','😹','😆','😜','🤪','😝','🤡','💀','🙃','😏','🤭','🫠','😎','🥴','🤓','😬','😛','😈','🤠','👻','💩','🤧','🫣'] },
  { label: 'Love', emojis: ['❤️','😍','🥰','😘','💋','💕','💖','💗','💓','💞','💘','💝','💟','❣️','🫶','🤍','🩷','💌','🌹','💐','💍','🥹','😻','❤️‍🔥'] },
  { label: 'Reactions', emojis: ['👍','👎','👏','🙌','🤝','🙏','🤦','🤷','😱','😮','😲','🥹','😭','😤','🤔','🤨','🙄','😴','🥱','🤯','🫡','💯','✅','❌'] },
  { label: 'Animals', emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🐔','🐧','🐦','🦄','🐝','🦋','🐢','🐬'] },
] as const

export function EmojiPicker({ onClose, onSelect }: { onClose: () => void; onSelect: (emoji: string) => void }) {
  const [category, setCategory] = useState<string>('Trending')
  const [query, setQuery] = useState('')
  const items = useMemo(() => {
    if (!query.trim()) return CATEGORIES.find(item => item.label === category)?.emojis ?? CATEGORIES[0].emojis
    const term = query.trim().toLowerCase()
    const names: Record<string, string> = { '😂':'laugh funny joy', '❤️':'heart love red', '🔥':'fire hot trending', '🥹':'tears emotional', '😍':'love heart eyes', '😭':'cry sad tears', '✨':'sparkles magic', '🥰':'love smile', '🤣':'laugh funny', '💀':'dead skull funny', '🙌':'celebrate praise', '💖':'heart love', '😎':'cool sunglasses', '🥳':'party birthday', '🤍':'white heart love', '💯':'100 perfect', '🫶':'love hands', '😱':'shock surprised', '😘':'kiss love', '🎉':'party celebrate', '👏':'clap applause', '🤩':'star struck excited', '😅':'nervous laugh', '💋':'kiss', '🐶':'dog puppy animal', '🐱':'cat kitten animal', '🦊':'fox animal', '🐻':'bear animal', '🐼':'panda animal', '🦄':'unicorn animal' }
    return CATEGORIES.flatMap(item => item.emojis).filter((emoji, index, all) => all.indexOf(emoji) === index && ((names[emoji] || '').includes(term) || emoji.includes(query.trim())))
  }, [category, query])
  return <div className="fixed inset-0 z-[190] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Emoji picker">
    <div className="flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-border bg-card text-foreground shadow-2xl sm:rounded-2xl">
      <header className="flex items-center justify-between border-b border-border px-4 py-3"><div className="flex items-center gap-2"><button type="button" onClick={onClose} aria-label="Back" className="rounded-full p-1.5 hover:bg-muted"><ArrowLeft className="h-5 w-5" /></button><h2 className="text-lg font-bold">Emojis</h2></div><button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-muted"><X className="h-5 w-5" /></button></header>
      <div className="p-3 pb-2"><label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3"><Search className="h-4 w-4 shrink-0 text-muted-foreground" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search emojis (e.g. love, laugh, dog)" className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" aria-label="Search emojis" />{query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><X className="h-4 w-4" /></button>}</label></div>
      {!query.trim() && <nav className="flex min-h-10 items-center gap-2 overflow-x-auto px-3 pb-3" aria-label="Emoji categories">{CATEGORIES.map(item => <button key={item.label} type="button" onClick={() => setCategory(item.label)} aria-pressed={category === item.label} className={`inline-flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-3 text-sm font-medium leading-none ${category === item.label ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-muted'}`}>{item.label}</button>)}</nav>}
      <div className="min-h-40 flex-1 overflow-y-auto px-3 pb-4"><div className="grid grid-cols-6 gap-2 sm:grid-cols-8">{items.map((emoji, i) => <button key={emoji+i} type="button" onClick={() => onSelect(emoji)} className="flex aspect-square items-center justify-center rounded-xl bg-muted text-3xl transition hover:bg-primary/10 hover:ring-2 hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`Add emoji ${emoji}`}>{emoji}</button>)}</div>{items.length===0 && <p className="p-8 text-center text-sm text-muted-foreground">No matching emojis. Try love, laugh, heart, or dog.</p>}</div>
    </div>
  </div>
}
