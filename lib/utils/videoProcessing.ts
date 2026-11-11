/**
 * Best-effort registration after a public video post has been created.
 * Failure never rolls back a published post: the original remains playable.
 */
export async function registerVideoForProcessing(objectPath: string | null, sourceBytes: number) {
  if (!objectPath || !Number.isSafeInteger(sourceBytes) || sourceBytes <= 0) return false
  try {
    const response = await fetch('/api/media/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ objectPath, sourceBytes }),
    })
    if (!response.ok) {
      console.warn('Video compatibility registration was not accepted:', response.status)
      return false
    }
    return true
  } catch (error) {
    console.warn('Video compatibility registration could not reach the server:', error)
    return false
  }
}
