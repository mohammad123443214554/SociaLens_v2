import type { Metadata } from 'next'
import { StudioPhotoEditor } from '@/components/studio/StudioPhotoEditor'

export const metadata: Metadata = {
  title: 'Photo Editor | SociaLens Studio',
  description: 'Create photo designs in the SociaLens Studio canvas workspace.',
  robots: { index: false, follow: false },
}

export default async function StudioPhotoEditorPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; template?: string; projectId?: string }>
}) {
  const params = await searchParams
  const projectName = (params.name || 'Untitled photo project').slice(0, 80)
  const templateId = (params.template || '').slice(0, 64)
  const projectId = (params.projectId || '').slice(0, 64)

  return <StudioPhotoEditor projectName={projectName} templateId={templateId} projectId={projectId} />
}
