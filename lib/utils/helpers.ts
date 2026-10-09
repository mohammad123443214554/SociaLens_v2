import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) return `${diffInSeconds}s`
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h`
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d`
  return date.toLocaleDateString()
}

export function formatCount(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`
  return count.toString()
}

export function getAvatarUrl(avatarUrl: string | null): string {
  if (!avatarUrl) return '/images/default-avatar.svg'
  return avatarUrl
}

export function getSupabaseStorageUrl(bucket: string, path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`
}

// Strips stray markdown formatting symbols (**bold**, __bold__, *italic*,
// _italic_, `code`) from AI-generated text (post titles/captions/hashtags
// from Aperonix's "Generate" feature). SociaLens renders post content as
// plain text everywhere, so leftover ** markers just show up literally
// and look broken instead of actually turning bold - this keeps them out
// of anything the app displays, regardless of where the text came from.
export function stripMarkdown(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(?<!\w)\*(?!\s)(.+?)(?<!\s)\*(?!\w)/g, '$1')
    .replace(/(?<!\w)_(?!\s)(.+?)(?<!\s)_(?!\w)/g, '$1')
    .replace(/`(.+?)`/g, '$1')
}

// Post captions are stored as "**title**\n\ndescription\n\n#hashtags" (see
// PostCaption.tsx) so the title can be told apart and shown bold. Anywhere
// that only needs a short, one-line plain-text preview (a Share sheet
// preview, an admin thumbnail caption) should go through this instead of
// slicing post.content raw, or the literal ** marks show up in the UI.
export function getPostPreviewText(content: string | null | undefined): string {
  if (!content?.trim()) return ''
  const match = content.match(/^\*\*(.+?)\*\*\n\n([\s\S]*)$/)
  const text = match ? `${match[1].trim()} ${match[2].trim()}` : content.trim()
  return stripMarkdown(text)
}
