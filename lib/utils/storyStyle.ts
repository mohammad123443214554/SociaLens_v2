// Both background and text colors are stored as one of:
//   - a plain hex string, e.g. "#ec4899"          -> solid/normal color
//   - "gradient:#hex1:#hex2"                       -> shaded/gradient color
// These helpers turn that stored value into actual renderable CSS, used by
// both the story composer (live preview) and the story viewer (playback).

export function resolveBackgroundCss(value: string | null): string {
  if (!value) return 'linear-gradient(135deg, #ec4899, #a855f7, #06b6d4)'
  if (value.startsWith('gradient:')) {
    const [, c1, c2] = value.split(':')
    return `linear-gradient(135deg, ${c1}, ${c2})`
  }
  return value
}

export function getTextFillStyle(value: string | null): React.CSSProperties {
  if (!value) return { color: '#ffffff' }
  if (value.startsWith('gradient:')) {
    const [, c1, c2] = value.split(':')
    return {
      backgroundImage: `linear-gradient(135deg, ${c1}, ${c2})`,
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent',
    }
  }
  return { color: value }
}
