'use client'

import { Lock } from 'lucide-react'
import { restrictionMessage, RestrictedFeatureLabel } from '@/lib/utils/restrictionCheck'

interface RestrictionPopupProps {
  feature: RestrictedFeatureLabel
  until?: string | null
  onClose: () => void
}

// A proper modal popup for "you're restricted" moments, used in place of
// a plain alert()/toast so the person actually sees why an action was
// blocked and exactly when it'll be available again - not just a message
// That flashes by.
export function RestrictionPopup({ feature, until, onClose }: RestrictionPopupProps) {
  return (
    <div className="fixed inset-0 bg-black/60 z-[200] flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl w-full max-w-sm p-6 text-center space-y-3" onClick={e => e.stopPropagation()}>
        <div className="mx-auto h-14 w-14 rounded-full bg-red-500/10 flex items-center justify-center">
          <Lock className="h-7 w-7 text-red-500" />
        </div>
        <p className="font-semibold">Temporary restriction</p>
        <p className="text-sm text-muted-foreground">{restrictionMessage(feature, until)}</p>
        <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white font-medium text-sm">
          Got it
        </button>
      </div>
    </div>
  )
}
