'use client'

import { Toast, useToast } from './Toast'

/**
 * The Toast component + showToast() helper already existed in this codebase
 * but nothing ever rendered a <Toast> to actually display them - so every
 * showToast() call was silently a no-op. Mounting this once, high up in the
 * tree (see ResponsiveLayout), makes showToast() work everywhere.
 *
 * This is also why call errors now use showToast() instead of alert():
 * installed/standalone PWAs (this app has PWA support) often silently
 * swallow window.alert() - a real, in-page toast always renders regardless.
 */
export function GlobalToast() {
  const { toast, hideToast } = useToast()
  if (!toast) return null
  return <Toast message={toast.message} type={toast.type} onClose={hideToast} />
}
