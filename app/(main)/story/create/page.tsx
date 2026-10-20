'use client'

import { useRouter } from 'next/navigation'
import { TextStoryModal } from '@/components/stories/TextStoryModal'
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
    <main className="fixed inset-0 z-[100] bg-black">
      <TextStoryModal userId={user.id} onClose={() => router.push('/feed')} onBack={() => router.push('/feed')} />
    </main>
  )
}
