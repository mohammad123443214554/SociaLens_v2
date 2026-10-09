'use client'

import { useState } from 'react'
import { X, Check } from 'lucide-react'
import { getTextFillStyle } from '@/lib/utils/storyStyle'

interface ColorPickerPanelProps {
  label: string
  initialValue: string
  onPreview: (value: string) => void
  onCancel: () => void
  onDone: () => void
}

export function ColorPickerPanel({ label, initialValue, onPreview, onCancel, onDone }: ColorPickerPanelProps) {
  const startedShaded = initialValue.startsWith('gradient:')
  const [mode, setMode] = useState<'shaded' | 'normal'>(startedShaded ? 'shaded' : 'normal')
  const [color1, setColor1] = useState(startedShaded ? initialValue.split(':')[1] : initialValue || '#ec4899')
  const [color2, setColor2] = useState(startedShaded ? initialValue.split(':')[2] : '#06b6d4')

  const currentValue = mode === 'shaded' ? `gradient:${color1}:${color2}` : color1

  const updateAndPreview = (next: { mode?: 'shaded' | 'normal'; c1?: string; c2?: string }) => {
    const newMode = next.mode ?? mode
    const newC1 = next.c1 ?? color1
    const newC2 = next.c2 ?? color2
    if (next.mode) setMode(next.mode)
    if (next.c1) setColor1(next.c1)
    if (next.c2) setColor2(next.c2)
    onPreview(newMode === 'shaded' ? `gradient:${newC1}:${newC2}` : newC1)
  }

  return (
    // Thin strip anchored at the very top - doesn't cover the canvas below,
    // so the live preview (which is already being pushed via onPreview) stays visible.
    <div className="fixed top-0 left-0 right-0 z-[110] bg-card border-b shadow-2xl">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-bold text-sm">{label}</h3>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground" aria-label="Cancel">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-4 space-y-3">
        {/* Shaded / Normal toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => updateAndPreview({ mode: 'shaded' })}
            className={`flex-1 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              mode === 'shaded' ? 'bg-pink-500 text-white border-pink-500' : 'border-border text-muted-foreground'
            }`}
          >
            Shaded
          </button>
          <button
            onClick={() => updateAndPreview({ mode: 'normal' })}
            className={`flex-1 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              mode === 'normal' ? 'bg-pink-500 text-white border-pink-500' : 'border-border text-muted-foreground'
            }`}
          >
            Normal
          </button>
        </div>

        {/* Color inputs */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center gap-1">
            <input
              type="color"
              value={color1}
              onChange={(e) => updateAndPreview({ c1: e.target.value })}
              className="h-9 w-9 rounded-lg cursor-pointer bg-transparent"
            />
            <span className="text-[10px] text-muted-foreground">{mode === 'shaded' ? 'Color 1' : 'Color'}</span>
          </div>
          {mode === 'shaded' && (
            <div className="flex flex-col items-center gap-1">
              <input
                type="color"
                value={color2}
                onChange={(e) => updateAndPreview({ c2: e.target.value })}
                className="h-9 w-9 rounded-lg cursor-pointer bg-transparent"
              />
              <span className="text-[10px] text-muted-foreground">Color 2</span>
            </div>
          )}

          {/* Preview */}
          <div className="flex-1">
            <p className="text-[10px] text-muted-foreground mb-1">SociaLens Color Preview</p>
            <div
              className="h-9 rounded-lg flex items-center justify-center text-sm font-semibold"
              style={
                label.toLowerCase().includes('text')
                  ? { ...getTextFillStyle(currentValue), background: '#00000010' }
                  : { background: mode === 'shaded' ? `linear-gradient(135deg, ${color1}, ${color2})` : color1 }
              }
            >
              {label.toLowerCase().includes('text') ? 'Aa Preview' : ''}
            </div>
          </div>
        </div>

        {/* Cancel / Done */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-xl border font-medium text-sm hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onDone}
            className="flex-1 py-2 rounded-xl bg-pink-500 text-white font-medium text-sm hover:bg-pink-600 transition-colors flex items-center justify-center gap-1.5"
          >
            <Check className="h-4 w-4" /> Done
          </button>
        </div>
      </div>
    </div>
  )
}
