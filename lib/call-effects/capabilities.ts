export function getCallEffectsCapabilities() {
  if (typeof window === 'undefined') return { canvasCaptureStream: false, webgl2: false, worker: false }
  const canvas = document.createElement('canvas')
  let webgl2 = false
  try { webgl2 = Boolean(canvas.getContext('webgl2')) } catch { /* GPU unavailable */ }
  return {
    canvasCaptureStream: typeof HTMLCanvasElement !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function',
    webgl2,
    worker: typeof Worker !== 'undefined',
  }
}

export function getCallEffectsRenderProfile() {
  return { maxWidth: 960, frameRate: 24 }
}
