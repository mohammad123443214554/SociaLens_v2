'use client'

import { Info } from 'lucide-react'

interface LimitAlertDialogProps {
  title: string
  description: string
  onClose: () => void
}

// A simple, single-button "heads up" popup - used whenever something the
// user tried to send/upload goes over one of SociaLens's limits (message
// length, video duration, etc.) so they immediately understand why it
// didn't go through, instead of it silently failing or erroring.
export function LimitAlertDialog({ title, description, onClose }: LimitAlertDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/60 z-[300] flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl w-full max-w-sm p-6 text-center space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto h-14 w-14 rounded-full flex items-center justify-center bg-pink-500/10">
          <Info className="h-7 w-7 text-pink-500" />
        </div>
        <div>
          <p className="font-semibold">{title}</p>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{description}</p>
        </div>
        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl text-white text-sm font-medium bg-gradient-to-r from-pink-500 to-purple-500 hover:opacity-90 transition-opacity"
        >
          Got it
        </button>
      </div>
    </div>
  )
}
