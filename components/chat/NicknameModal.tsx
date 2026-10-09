'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

interface NicknameModalProps {
  currentNickname: string | null
  targetUsername: string
  onSave: (nickname: string) => void
  onDelete?: () => void
  onClose: () => void
  saving?: boolean
  deleting?: boolean
}

export function NicknameModal({ currentNickname, targetUsername, onSave, onDelete, onClose, saving, deleting }: NicknameModalProps) {
  const [value, setValue] = useState(currentNickname || '')

  return (
    <div className="fixed inset-0 bg-black/70 z-[130] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border rounded-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-bold text-sm">Nickname for {targetUsername}</h3>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>
        <div className="p-4 space-y-3">
          <input
            autoFocus
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="Enter a nickname"
            maxLength={40}
            className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm outline-none border border-transparent focus:border-pink-500"
          />
          <p className="text-xs text-muted-foreground">Only you see this in your view of the chat - {targetUsername} will get a message letting them know you set one.</p>
        </div>
        <div className="p-4 border-t space-y-2">
          <button
            onClick={() => value.trim() && onSave(value.trim())}
            disabled={!value.trim() || saving}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white font-medium disabled:opacity-40"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          {currentNickname && onDelete && (
            <button
              onClick={onDelete}
              disabled={deleting}
              className="w-full py-2.5 rounded-xl text-red-500 font-medium hover:bg-red-500/10 disabled:opacity-40"
            >
              {deleting ? 'Removing...' : 'Delete Nickname'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
