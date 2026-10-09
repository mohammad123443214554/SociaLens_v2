'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils/helpers'

interface ToastProps {
  message: string
  type?: 'success' | 'error' | 'info'
  onClose: () => void
}

export function Toast({ message, type = 'info', onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div
      className={cn(
        'fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium',
        type === 'success' && 'bg-green-500',
        type === 'error' && 'bg-red-500',
        type === 'info' && 'bg-gray-800'
      )}
    >
      <span>{message}</span>
      <button onClick={onClose}>
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

// Simple toast state manager
let toastCallback: ((msg: string, type?: 'success' | 'error' | 'info') => void) | null = null

export function useToast() {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)

  toastCallback = (msg, type = 'info') => setToast({ message: msg, type })

  return {
    toast,
    showToast: (msg: string, type?: 'success' | 'error' | 'info') => setToast({ message: msg, type: type || 'info' }),
    hideToast: () => setToast(null),
  }
}

export function showToast(message: string, type?: 'success' | 'error' | 'info') {
  if (toastCallback) toastCallback(message, type)
}
