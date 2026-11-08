import type { Metadata } from 'next'
import { StudioVideoEditor } from '@/components/studio/StudioVideoEditor'

export const metadata: Metadata = {
  title: 'Video Editor | SociaLens Studio',
  description: 'Arrange and trim video and photo clips, preview media, and add a music track in SociaLens Studio.',
  robots: { index: false, follow: false },
}

export default async function StudioVideoEditorPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; template?: string; projectId?: string }>
}) {
  const params = await searchParams
  const projectName = (params.name || 'Untitled video project').slice(0, 80)
  const templateId = (params.template || '').slice(0, 64)
  const projectId = (params.projectId || '').slice(0, 64)

  return <StudioVideoEditor projectName={projectName} templateId={templateId} projectId={projectId} />
}
