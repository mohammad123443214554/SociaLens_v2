// Computes where a popup should render given the button that opened it, so
// it never spills off the edge of the screen - flips above the button if
// there isn't room below, and slides left/right to stay within the
// viewport horizontally. Used for the message 3-dot menu and emoji picker,
// both of which need to work right up against the phone's edges.
export function getClampedPopupPosition(
  anchorRect: DOMRect,
  popupWidth: number,
  popupHeight: number,
  margin = 8
): { top: number; left: number } {
  let left = anchorRect.right - popupWidth
  left = Math.max(margin, Math.min(left, window.innerWidth - popupWidth - margin))

  let top = anchorRect.bottom + 6
  if (top + popupHeight > window.innerHeight - margin) {
    // Not enough room below - open upward instead.
    top = anchorRect.top - popupHeight - 6
  }
  top = Math.max(margin, Math.min(top, window.innerHeight - popupHeight - margin))

  return { top, left }
}
