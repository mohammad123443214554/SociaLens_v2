'use client'

interface DiscardConfirmDialogProps {
  onContinueEditing: () => void
  onDiscard: () => void
}

export function DiscardConfirmDialog({ onContinueEditing, onDiscard }: DiscardConfirmDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/70 z-[120] flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl w-full max-w-xs p-5 text-center">
        <h3 className="font-bold text-lg mb-1">Discard this story?</h3>
        <p className="text-sm text-muted-foreground mb-5">
          If you leave now, what you made will be lost.
        </p>
        <div className="space-y-2">
          <button
            onClick={onContinueEditing}
            className="w-full py-2.5 rounded-xl bg-pink-500 text-white font-medium hover:bg-pink-600 transition-colors"
          >
            Continue Editing
          </button>
          <button
            onClick={onDiscard}
            className="w-full py-2.5 rounded-xl text-red-500 font-medium hover:bg-red-500/10 transition-colors"
          >
            Discard
          </button>
        </div>
      </div>
    </div>
  )
}
