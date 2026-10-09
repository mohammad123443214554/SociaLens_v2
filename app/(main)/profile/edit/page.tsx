'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { Camera, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent } from '@/components/ui/card'
import { useUser } from '@/lib/hooks/useUser'
import { createClient } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/utils/helpers'
import { PageLoader } from '@/components/shared/LoadingSpinner'
import { PhotoEditorModal } from '@/components/shared/PhotoEditorModal'

interface EditProfileForm {
  full_name: string
  username: string
  bio: string
}

export default function EditProfilePage() {
  const { user, profile, loading } = useUser()
  const [saving, setSaving] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [editingPhoto, setEditingPhoto] = useState<'avatar' | 'cover' | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const { register, handleSubmit, formState: { errors } } = useForm<EditProfileForm>({
    values: {
      full_name: profile?.full_name ?? '',
      bio: profile?.bio ?? '',
      username: profile?.username ?? '',
    },
  })

  const handlePhotoEdited = (file: File) => {
    const url = URL.createObjectURL(file)
    if (editingPhoto === 'avatar') { setAvatarFile(file); setAvatarPreview(url) }
    else if (editingPhoto === 'cover') { setCoverFile(file); setCoverPreview(url) }
    setEditingPhoto(null)
  }

  const onSubmit = async (data: EditProfileForm) => {
    if (!user || !profile) return
    setSaving(true)
    try {
      let avatar_url = profile.avatar_url
      let cover_photo_url = profile.cover_photo_url

      if (avatarFile) {
        // A timestamped filename (not a fixed "avatar.ext") is essential
        // here - Supabase Storage's CDN caches aggressively by URL, so
        // reusing the same filename on every upload meant the old cached
        // image kept showing even after a successful upload/save.
        const path = `${user.id}/avatar-${Date.now()}.jpg`
        const { error: upErr } = await supabase.storage.from('avatars').upload(path, avatarFile)
        if (upErr) { alert('Could not upload profile photo: ' + upErr.message); return }
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
        avatar_url = urlData.publicUrl
      }

      if (coverFile) {
        const path = `${user.id}/cover-${Date.now()}.jpg`
        const { error: upErr } = await supabase.storage.from('covers').upload(path, coverFile)
        if (upErr) { alert('Could not upload cover photo: ' + upErr.message); return }
        const { data: urlData } = supabase.storage.from('covers').getPublicUrl(path)
        cover_photo_url = urlData.publicUrl
      }

      const { error: updateErr } = await supabase.from('profiles').update({
        full_name: data.full_name,
        username: data.username,
        bio: data.bio,
        avatar_url,
        cover_photo_url,
        updated_at: new Date().toISOString(),
      }).eq('id', user.id)

      if (updateErr) { alert('Could not save changes: ' + updateErr.message); return }

      router.push(`/profile/${data.username || profile.username}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageLoader />
  if (!profile) return null

  return (
    <div className="max-w-xl mx-auto p-4">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold">Edit Profile</h1>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-5">
          <div>
            <p className="text-sm font-medium mb-2">Cover Photo</p>
            <div className="relative h-28 rounded-lg bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 cursor-pointer overflow-hidden"
              onClick={() => setEditingPhoto('cover')}>
              {(coverPreview || profile.cover_photo_url) && (
                <img src={coverPreview || profile.cover_photo_url!} alt="Cover" className="w-full h-full object-cover" />
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <Camera className="h-6 w-6 text-white" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative cursor-pointer" onClick={() => setEditingPhoto('avatar')}>
              <Avatar className="h-20 w-20">
                <AvatarImage src={avatarPreview || getAvatarUrl(profile.avatar_url)} />
                <AvatarFallback className="text-2xl">{profile.username?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-full">
                <Camera className="h-5 w-5 text-white" />
              </div>
            </div>
            <div>
              <p className="font-semibold">{profile.username}</p>
              <p className="text-sm text-muted-foreground">Tap to change photo</p>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Full Name</label>
              <Input {...register('full_name')} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Username</label>
              <Input {...register('username', { required: true })} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Bio</label>
              <Textarea {...register('bio')} className="mt-1 resize-none" rows={3} placeholder="Tell people about yourself..." />
            </div>
            <Button type="submit" className="w-full" variant="gradient" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {editingPhoto && (
        <PhotoEditorModal
          variant={editingPhoto}
          onDone={handlePhotoEdited}
          onClose={() => setEditingPhoto(null)}
        />
      )}
    </div>
  )
} 
