/** Compact, human-readable label for quoted/replying-to Aperonix share cards. */
export function getSharedAperonixReplyLabel(content: string, fallback = 'Attachment'): string {
  try {
    const payload = JSON.parse(content)
    if (payload?.__sociaLensShare !== 1) return content || fallback

    const compact = (value: unknown, max = 112) => {
      const text = String(value ?? '').replace(/\s+/g, ' ').trim()
      if (!text) return ''
      return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
    }

    if (payload.type === 'prompt') {
      const username = compact(payload.owner?.username || 'User', 32)
      const prompt = compact(payload.prompt)
      return prompt ? `${username} Prompt · ${prompt}` : `${username} Prompt`
    }
    if (payload.type === 'chat') {
      const firstUserMessage = Array.isArray(payload.messages)
        ? payload.messages.find((item: { role?: string; content?: string }) => item?.role === 'user' && item.content?.trim())
        : null
      const title = compact(payload.title || 'Aperonix chat', 48)
      const preview = compact(firstUserMessage?.content)
      return preview ? `${title} · ${preview}` : title
    }
    if (payload.type === 'voice') return compact(payload.title || 'Aperonix voice conversation')
    return 'Shared Aperonix content'
  } catch {
    return content || fallback
  }
}
