'use client'

import { createClient } from '@/lib/supabase/client'

export type StudioProjectType = 'photo' | 'video'
export type StudioProjectRow = {
  id: string
  user_id: string
  project_type: StudioProjectType
  name: string
  template_id: string | null
  data: Record<string, unknown>
  created_at: string
  updated_at: string
}

const BUCKET = 'studio-projects'

export async function getStudioUserId() {
  const supabase = createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!data.user) throw new Error('Please sign in to save Studio projects.')
  return data.user.id
}

export async function uploadStudioAsset(projectId: string, file: File) {
  const supabase = createClient()
  const userId = await getStudioUserId()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-100) || 'asset'
  const path = userId + '/' + projectId + '/' + crypto.randomUUID() + '-' + safeName
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    cacheControl: '3600',
    contentType: file.type || 'application/octet-stream',
  })
  if (error) throw error
  return path
}

export async function createStudioAssetUrl(path: string) {
  const supabase = createClient()
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24)
  if (error) throw error
  return data.signedUrl
}

export async function saveStudioProject(input: {
  id: string
  project_type: StudioProjectType
  name: string
  template_id: string | null
  data: Record<string, unknown>
}) {
  const supabase = createClient()
  const userId = await getStudioUserId()
  const now = new Date().toISOString()
  const { error } = await supabase.from('studio_projects').upsert({
    ...input,
    user_id: userId,
    updated_at: now,
    last_opened_at: now,
  }, { onConflict: 'id' })
  if (error) throw error
}

export async function loadStudioProject(id: string, type: StudioProjectType) {
  const supabase = createClient()
  await getStudioUserId()
  const { data, error } = await supabase
    .from('studio_projects')
    .select('id,user_id,project_type,name,template_id,data,created_at,updated_at')
    .eq('id', id)
    .eq('project_type', type)
    .maybeSingle()
  if (error) throw error
  return data as StudioProjectRow | null
}

export async function listStudioProjects() {
  const supabase = createClient()
  await getStudioUserId()
  const { data, error } = await supabase
    .from('studio_projects')
    .select('id,project_type,name,template_id,updated_at')
    .order('updated_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data || []
}

export async function deleteStudioProject(id: string) {
  const supabase = createClient()
  const userId = await getStudioUserId()
  const folder = userId + '/' + id
  const { data: files, error: listError } = await supabase.storage.from(BUCKET).list(folder, { limit: 1000 })
  if (listError) throw listError
  if (files?.length) {
    const { error: removeError } = await supabase.storage.from(BUCKET).remove(files.map(file => folder + '/' + file.name))
    if (removeError) throw removeError
  }
  const { error } = await supabase.from('studio_projects').delete().eq('id', id)
  if (error) throw error
}
