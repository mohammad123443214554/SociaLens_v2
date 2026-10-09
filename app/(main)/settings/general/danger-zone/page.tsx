'use client'

import Link from 'next/link'
import { ChevronLeft, ChevronRight, Trash2, TriangleAlert } from 'lucide-react'

export default function DangerZonePage() {
  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/settings/general" className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold text-red-500">Danger Zone</h1>
      </div>

      <div
        className="relative overflow-hidden rounded-2xl border-2 border-red-500/40 bg-red-500/5"
        style={{
          backgroundImage:
            'repeating-linear-gradient(135deg, transparent, transparent 10px, rgba(239,68,68,0.06) 10px, rgba(239,68,68,0.06) 20px)',
        }}
      >
        <div className="flex items-center gap-2 px-4 pt-4">
          <TriangleAlert className="h-5 w-5 text-red-500" />
          <p className="text-sm font-semibold text-red-500">Actions here can't be undone</p>
        </div>
        <p className="text-xs text-muted-foreground px-4 pt-1 pb-3">
          Think carefully before doing anything on this page.
        </p>

        <Link
          href="/delete-account"
          className="flex items-center justify-between px-4 py-3 mx-2 mb-2 rounded-xl bg-card/60 hover:bg-card transition-colors"
        >
          <div className="flex items-center gap-3">
            <Trash2 className="h-5 w-5 text-red-500" />
            <div>
              <p className="text-sm font-medium text-red-500">Delete Account</p>
              <p className="text-xs text-muted-foreground">Permanently delete your account and all its data</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-red-500/60" />
        </Link>
      </div>
    </div>
  )
}
