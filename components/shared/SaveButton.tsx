'use client'

import { useState } from 'react'
import { Bookmark, X, FolderPlus, Folder } from 'lucide-react'
import { useUser } from '@/lib/hooks/useUser'
import {
  useSavedFolders,
  useSavedPostIds,
  useSavePost,
  useUnsavePost,
  useCreateFolder,
  MAX_SAVED_FOLDERS,
} from '@/lib/hooks/useSavedPosts'

interface SaveButtonProps {
  postId: string
  className?: string
  iconClassName?: string
}

export function SaveButton({ postId, className = '', iconClassName = 'h-5 w-5' }: SaveButtonProps) {
  const { user } = useUser()
  const { data: folders = [] } = useSavedFolders(user?.id)
  const { data: savedPosts = [] } = useSavedPostIds(user?.id)
  const savePost = useSavePost()
  const unsavePost = useUnsavePost()
  const createFolder = useCreateFolder()

  const [showChooser, setShowChooser] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [error, setError] = useState('')

  const isSaved = savedPosts.some(s => s.post_id === postId)

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (!user) return

    if (isSaved) {
      await unsavePost.mutateAsync({ userId: user.id, postId })
      return
    }

    if (folders.length === 0) {
      setShowCreate(true)
    } else if (folders.length === 1) {
      await savePost.mutateAsync({ userId: user.id, postId, folderId: folders[0].id })
    } else {
      setShowChooser(true)
    }
  }

  const handleCreateAndSave = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!user || !folderName.trim()) return
    setError('')
    try {
      const folder = await createFolder.mutateAsync({ userId: user.id, name: folderName.trim() })
      await savePost.mutateAsync({ userId: user.id, postId, folderId: folder.id })
      setShowCreate(false)
      setFolderName('')
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    }
  }

  const handleChoose = async (folderId: string) => {
    if (!user) return
    await savePost.mutateAsync({ userId: user.id, postId, folderId })
    setShowChooser(false)
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={savePost.isPending || unsavePost.isPending}
        className={className}
      >
        <Bookmark className={`${iconClassName} ${isSaved ? 'fill-current' : ''}`} />
      </button>

      {showChooser && (
        <div
          className="fixed inset-0 bg-black/60 z-[100] flex items-end sm:items-center justify-center p-4"
          onClick={e => { e.stopPropagation(); setShowChooser(false) }}
        >
          <div className="bg-card rounded-2xl w-full max-w-sm max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <p className="font-semibold">Save to...</p>
              <button onClick={() => setShowChooser(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-2">
              {folders.map(folder => (
                <button
                  key={folder.id}
                  onClick={() => handleChoose(folder.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-accent transition-colors text-left"
                >
                  <Folder className="h-5 w-5 text-pink-500 shrink-0" />
                  <span className="text-sm font-medium truncate">{folder.name}</span>
                </button>
              ))}
              {folders.length < MAX_SAVED_FOLDERS && (
                <button
                  onClick={() => { setShowChooser(false); setShowCreate(true) }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-accent transition-colors text-left text-pink-500"
                >
                  <FolderPlus className="h-5 w-5 shrink-0" />
                  <span className="text-sm font-medium">New folder</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <div
          className="fixed inset-0 bg-black/60 z-[100] flex items-end sm:items-center justify-center p-4"
          onClick={e => { e.stopPropagation(); setShowCreate(false); setFolderName(''); setError('') }}
        >
          <form
            onSubmit={handleCreateAndSave}
            className="bg-card rounded-2xl w-full max-w-sm p-5"
            onClick={e => e.stopPropagation()}
          >
            <p className="font-semibold mb-1">Create a folder</p>
            <p className="text-xs text-muted-foreground mb-3">Give your folder a name to save this post into it.</p>
            <input
              autoFocus
              value={folderName}
              onChange={e => setFolderName(e.target.value)}
              placeholder="Folder name"
              maxLength={40}
              className="w-full bg-muted rounded-xl px-3 py-2 text-sm outline-none border border-transparent focus:border-pink-500"
            />
            {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => { setShowCreate(false); setFolderName(''); setError('') }}
                className="flex-1 py-2 rounded-xl border text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!folderName.trim() || createFolder.isPending}
                className="flex-1 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white text-sm font-medium disabled:opacity-50"
              >
                {createFolder.isPending ? 'Creating...' : 'Create & Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
