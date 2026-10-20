'use client'

import { useRouter } from 'next/navigation'
import { CreateStoryModal } from '@/components/stories/CreateStoryModal'
import { useUser } from '@/lib/hooks/useUser'
import { Loader2 } from 'lucide-react'

export default function CreateStoryPage() {
  const router = useRouter()
  const { user, loading } = useUser()

  if (loading) {
    return (
      <main className="min-h-[70vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-pink-500" />
      </main>
    )
  }

  if (!user) {
    router.replace('/login')
    return null
  }

  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-black">
      <CreateStoryModal userId={user.id} onClose={() => router.push('/feed')} />
    </main>
  )
}
