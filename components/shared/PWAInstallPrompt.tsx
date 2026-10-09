'use client'

import { useState, useEffect } from 'react'
import { X, Download, Smartphone } from 'lucide-react'

export function PWAInstallPrompt() {
  const [prompt, setPrompt] = useState<any>(null)
  const [show, setShow] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    // Already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true)
      return
    }

    // iOS detection
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
    setIsIOS(ios)

    // Show iOS prompt after 5 sec if not dismissed recently
    if (ios) {
      const dismissed = localStorage.getItem('pwa-prompt-dismissed')
      const dayAgo = Date.now() - 24 * 60 * 60 * 1000
      if (!dismissed || parseInt(dismissed) < dayAgo) {
        setTimeout(() => setShow(true), 5000)
      }
      return
    }

    // Android/Desktop
    const handler = (e: any) => {
      e.preventDefault()
      setPrompt(e)
      const dismissed = localStorage.getItem('pwa-prompt-dismissed')
      const dayAgo = Date.now() - 24 * 60 * 60 * 1000
      if (!dismissed || parseInt(dismissed) < dayAgo) {
        setTimeout(() => setShow(true), 3000)
      }
    }
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => setInstalled(true))
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (prompt) {
      prompt.prompt()
      const { outcome } = await prompt.userChoice
      if (outcome === 'accepted') setInstalled(true)
      setPrompt(null)
    }
    setShow(false)
  }

  const handleDismiss = () => {
    setShow(false)
    localStorage.setItem('pwa-prompt-dismissed', Date.now().toString())
  }

  if (!show || installed) return null

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 lg:left-auto lg:right-6 lg:w-80">
      <div className="bg-card border rounded-2xl p-4 shadow-2xl">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center">
              <Smartphone className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-sm">Install SociaLens</p>
              <p className="text-xs text-muted-foreground">Add to home screen</p>
            </div>
          </div>
          <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {isIOS ? (
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>1. Tap <strong className="text-foreground">Share</strong> button 📤</p>
            <p>2. Select <strong className="text-foreground">Add to Home Screen</strong></p>
            <p>3. Tap <strong className="text-foreground">Add</strong> ✅</p>
          </div>
        ) : (
          <button
            onClick={handleInstall}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-sm font-semibold"
            style={{ background: 'linear-gradient(135deg, #ec4899, #a855f7)' }}
          >
            <Download className="h-4 w-4" />
            Install App
          </button>
        )}
      </div>
    </div>
  )
}
