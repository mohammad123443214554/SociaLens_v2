import type { Metadata } from 'next'
import { StudioWorkspace } from '@/components/studio/StudioWorkspace'

export const metadata: Metadata = {
  title: 'SociaLens Studio',
  description: 'Create and prepare your visual stories, posts and reels in one SociaLens workspace.',
  robots: { index: false, follow: false },
}

export default function SociaLensStudioPage() {
  return <StudioWorkspace />
}
