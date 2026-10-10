import ArchivePageClient from './ArchivePageClient'

// Archive requires Supabase browser configuration at runtime. Keep this route
// dynamic so Preview builds do not try to instantiate the browser client while
// statically prerendering with Preview-only env values unavailable.
export const dynamic = 'force-dynamic'

export default function ArchivePage() {
  return <ArchivePageClient />
}
