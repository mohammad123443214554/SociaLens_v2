'use client'

export type StoryDraftKind = 'photo' | 'video'

export interface StoryDraftRecord {
  userId: string
  kind: StoryDraftKind
  file: File
  fileName: string
  fileType: string
  lastModified: number
  photo?: {
    overlayText: string
    overlayX: number
    overlayY: number
    font: string | null
    song: { title: string; artist: string; artworkUrl: string; previewUrl: string } | null
    storyDuration: number
    textStart: number
    textDuration: number
    songStart: number
    songDuration: number
  }
  video?: { duration: number }
  updatedAt: number
}

const DB_NAME = 'socialens-story-drafts'
const STORE_NAME = 'drafts'

function openDraftDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Story drafts are not available in this browser.'))
      return
    }
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'userId' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Could not open story drafts.'))
  })
}

export async function loadStoryDraft(userId: string): Promise<StoryDraftRecord | null> {
  const db = await openDraftDb()
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(userId)
      request.onsuccess = () => resolve((request.result as StoryDraftRecord | undefined) || null)
      request.onerror = () => reject(request.error || new Error('Could not load story draft.'))
    })
  } finally {
    db.close()
  }
}

export async function saveStoryDraft(draft: StoryDraftRecord): Promise<void> {
  const db = await openDraftDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put({ ...draft, updatedAt: Date.now() })
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error || new Error('Could not save story draft.'))
    })
  } finally {
    db.close()
  }
}

export async function clearStoryDraft(userId: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  const db = await openDraftDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(userId)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error || new Error('Could not clear story draft.'))
    })
  } finally {
    db.close()
  }
}
