'use client'

interface AdStorySlotProps {
  onClick: () => void
}

// Sits in the stories row at a randomized position among real story rings
// (see lib/utils/adInsertion.ts), same size/shape/gradient ring as a real
// one so it doesn't stand out while scrolling through the row. "Sponsored"
// in place of a username is the only tell, matching the same approach
// used for the Reel and Post ad slots.
export function AdStorySlot({ onClick }: AdStorySlotProps) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1 shrink-0 w-16">
      <div className="h-16 w-16 rounded-full bg-gradient-to-br from-slate-400 via-slate-500 to-slate-600 p-[2px]">
        <div className="h-full w-full rounded-full border-2 border-background bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center">
          <span className="text-white text-lg font-bold">Ad</span>
        </div>
      </div>
      <span className="text-[11px] text-muted-foreground truncate w-full text-center">Sponsored</span>
    </button>
  )
}
