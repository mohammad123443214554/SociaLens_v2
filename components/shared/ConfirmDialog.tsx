'use client'

import { AlertTriangle, Loader2 } from 'lucide-react'

interface ConfirmDialogProps {
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

// A reusable "are you sure?" popup for any destructive/irreversible action
// (deleting a post, a story, etc). Centered dialog with a Cancel and a
// clearly-styled Confirm button, so a single accidental tap on a delete
// menu item can never remove something by itself.
export function ConfirmDialog({
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  destructive = true,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 bg-black/60 z-[300] flex items-end sm:items-center justify-center p-4"
      onClick={() => !loading && onCancel()}
    >
      <div className="bg-card rounded-2xl w-full max-w-sm p-6 text-center space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className={`mx-auto h-14 w-14 rounded-full flex items-center justify-center ${destructive ? 'bg-red-500/10' : 'bg-pink-500/10'}`}>
          <AlertTriangle className={`h-7 w-7 ${destructive ? 'text-red-500' : 'text-pink-500'}`} />
        </div>
        <div>
          <p className="font-semibold">{title}</p>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl border text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 py-2.5 rounded-xl text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 ${
              destructive ? 'bg-red-500 hover:bg-red-600' : 'bg-gradient-to-r from-pink-500 to-purple-500'
            }`}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
