'use client'

import { AlertTriangle, EyeOff, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type MessageAction = 'delete' | 'unsend' | null

interface MessageActionConfirmDialogProps {
  action: MessageAction
  open: boolean
  pending?: boolean
  onCancel: () => void
  onConfirm: () => void
}

/** Shared confirmation UI for destructive actions on chat timeline items. */
export function MessageActionConfirmDialog({
  action,
  open,
  pending = false,
  onCancel,
  onConfirm,
}: MessageActionConfirmDialogProps) {
  const isUnsend = action === 'unsend'
  if (!action) return null

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !pending) onCancel() }}>
      <DialogContent className="z-[160] w-[calc(100%-2rem)] max-w-[400px] overflow-hidden rounded-2xl border border-border/80 bg-card p-0 shadow-2xl">
        <div className="p-5 sm:p-6">
          <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${isUnsend ? 'bg-rose-500/10 text-rose-500' : 'bg-sky-500/10 text-sky-500'}`}>
            {isUnsend ? <Trash2 className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
          </div>
          <DialogHeader className="space-y-2 text-left">
            <DialogTitle className="text-lg font-semibold">
              {isUnsend ? 'Unsend this message?' : 'Delete message for you?'}
            </DialogTitle>
            <DialogDescription className="text-sm leading-6">
              {isUnsend
                ? 'This message will be removed from the conversation for everyone. This action cannot be undone.'
                : 'This message will be removed from your chat only. Other participants will still be able to see it.'}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-border/70 bg-muted/50 px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-xs leading-5 text-muted-foreground">
              {isUnsend ? 'Only continue if you are sure you want to unsend it.' : 'You can’t restore this message to your chat after deleting it.'}
            </p>
          </div>
        </div>
        <DialogFooter className="flex-row justify-end gap-2 border-t border-border/70 bg-muted/20 px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="inline-flex h-10 min-w-24 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={`inline-flex h-10 min-w-28 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${isUnsend ? 'bg-rose-600 hover:bg-rose-700' : 'bg-sky-600 hover:bg-sky-700'}`}
          >
            {isUnsend ? <Trash2 className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            {pending ? 'Please wait…' : isUnsend ? 'Unsend' : 'Delete'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
