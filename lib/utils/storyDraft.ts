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

type DraftMetadata = Omit<StoryDraftRecord, 'file'>
type StoredMedia = { userId: string; file: File; fileName: string; fileType: string; lastModified: number; size: number }

const DB_NAME = 'socialens-story-drafts'
const STORE_NAME = 'drafts'
const MEDIA_STORE = 'media'

function openDraftDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Story drafts are not available in this browser.'))
      return
    }
    const request = indexedDB.open(DB_NAME, 2)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'userId' })
      if (!db.objectStoreNames.contains(MEDIA_STORE)) db.createObjectStore(MEDIA_STORE, { keyPath: 'userId' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Could not open story drafts.'))
  })
}

export async function loadStoryDraft(userId: string): Promise<StoryDraftRecord | null> {
  const db = await openDraftDb()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME, MEDIA_STORE], 'readonly')
      const draftRequest = tx.objectStore(STORE_NAME).get(userId)
      const mediaRequest = tx.objectStore(MEDIA_STORE).get(userId)
      let draft: DraftMetadata | undefined
      let media: StoredMedia | undefined
      let draftReady = false
      let mediaReady = false
      const finish = () => {
        if (!draftReady || !mediaReady) return
        resolve(draft && media ? { ...draft, file: media.file } : null)
      }
      draftRequest.onsuccess = () => { draft = draftRequest.result as DraftMetadata | undefined; draftReady = true; finish() }
      mediaRequest.onsuccess = () => { media = mediaRequest.result as StoredMedia | undefined; mediaReady = true; finish() }
      tx.onerror = () => reject(tx.error || new Error('Could not load story draft.'))
    })
  } finally {
    db.close()
  }
}

export async function saveStoryDraft(draft: StoryDraftRecord): Promise<void> {
  const db = await openDraftDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_NAME, MEDIA_STORE], 'readwrite')
      const mediaStore = tx.objectStore(MEDIA_STORE)
      const existingRequest = mediaStore.get(draft.userId)
      existingRequest.onsuccess = () => {
        const existing = existingRequest.result as StoredMedia | undefined
        const mediaMatches = existing
          && existing.fileName === draft.fileName
          && existing.fileType === draft.fileType
          && existing.lastModified === draft.lastModified
          && existing.size === draft.file.size
        if (!mediaMatches) {
          mediaStore.put({
            userId: draft.userId,
            file: draft.file,
            fileName: draft.fileName,
            fileType: draft.fileType,
            lastModified: draft.lastModified,
            size: draft.file.size,
          } satisfies StoredMedia)
        }
        const { file: _file, ...metadata } = draft
        tx.objectStore(STORE_NAME).put({ ...metadata, updatedAt: Date.now() } satisfies DraftMetadata)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error || new Error('Could not save story draft.'))
      tx.onabort = () => reject(tx.error || new Error('Could not save story draft.'))
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
      const tx = db.transaction([STORE_NAME, MEDIA_STORE], 'readwrite')
      tx.objectStore(STORE_NAME).delete(userId)
      tx.objectStore(MEDIA_STORE).delete(userId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error || new Error('Could not clear story draft.'))
      tx.onabort = () => reject(tx.error || new Error('Could not clear story draft.'))
    })
  } finally {
    db.close()
  }
}
